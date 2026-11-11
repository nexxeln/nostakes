import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Clock,
  Console,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { datasetName } from "../src/measures.ts";
import { SiteStageSchema } from "../src/site.ts";
import { credential } from "./cloudflare-credentials.ts";
import {
  CountRowsSchema,
  countRowsFrom,
  countsQuery,
  DeviceRowsSchema,
  deviceRowsFrom,
  devicesQuery,
  funnelLines,
  funnelOf,
  healthLines,
  reportedLines,
  isoTime,
  RoomRowsSchema,
  roomRowsFrom,
  roomsQuery,
} from "./funnel.ts";
import type { Period } from "./funnel.ts";

const DAY_MS = Duration.toMillis(Duration.days(1));

const USAGE =
  "usage: pnpm stats [production|preview] [7d | 30d | YYYY-MM-DD..YYYY-MM-DD]. A number of days means the whole UTC days before today.";

const TOKEN_NEEDS =
  "Reading the numbers needs a Cloudflare API token with Account > Account Analytics > Read.";

class StatsStopped extends Schema.TaggedError<
  StatsStopped,
  { readonly brand: unique symbol }
>()("StatsStopped", { reason: Schema.String }) {
  override get message() {
    return this.reason;
  }
}

const stop = (reason: string) => new StatsStopped({ reason });

const DAYS = /^(?<days>\d{1,2})d$/u;

const RANGE = /^(?<from>\d{4}-\d{2}-\d{2})\.\.(?<to>\d{4}-\d{2}-\d{2})$/u;

const dayStart = (text: string) =>
  DateTime.make(`${text}T00:00:00Z`).pipe(
    Option.map(DateTime.toEpochMillis),
    Option.getOrElse(() => Number.NaN)
  );

const periodOf = (text: string, now: number): Period | undefined => {
  const today = now - (now % DAY_MS);
  const days = DAYS.exec(text)?.groups?.days;

  if (days !== undefined && Number(days) > 0) {
    return { from: today - Number(days) * DAY_MS, now, to: today };
  }

  const range = RANGE.exec(text)?.groups;

  if (range?.from === undefined || range.to === undefined) {
    return undefined;
  }

  const from = dayStart(range.from);
  const to = dayStart(range.to);

  return Number.isFinite(from) && Number.isFinite(to) && from < to
    ? { from, now, to }
    : undefined;
};

const request = Effect.gen(function* readRequest() {
  const [stageArg = "production", periodArg = "7d"] = process.argv.slice(2);

  const stage = yield* Schema.decodeUnknownEffect(SiteStageSchema)(
    stageArg
  ).pipe(Effect.mapError(() => stop(USAGE)));

  const now = yield* Clock.currentTimeMillis;
  const period = periodOf(periodArg, now);

  return period === undefined ? yield* stop(USAGE) : { period, stage };
});

const SQL_API = (account: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`;

const NOT_ALLOWED = /authori[sz]ation|unauthori[sz]ed|forbidden|permission/iu;

const NO_TABLE =
  /(?:unknown|not found|does not exist).*(?:table|dataset)|(?:table|dataset).*(?:unknown|not found|does not exist)/iu;

const NO_ROWS = JSON.stringify({ data: [] });

const run = (
  account: Redacted.Redacted,
  token: Redacted.Redacted,
  sql: string
) =>
  HttpClientRequest.post(SQL_API(Redacted.value(account))).pipe(
    HttpClientRequest.setHeader(
      "authorization",
      `Bearer ${Redacted.value(token)}`
    ),
    HttpClientRequest.bodyText(sql, "text/plain"),
    HttpClient.execute,
    Effect.flatMap((response) =>
      response.text.pipe(
        Effect.map((text) => ({ status: response.status, text }))
      )
    ),
    Effect.mapError(() =>
      stop(
        "Cloudflare's SQL API did not answer. Check the network and try again."
      )
    ),
    Effect.flatMap(({ status, text }) => {
      if (status === 401 || status === 403 || NOT_ALLOWED.test(text)) {
        return Effect.fail(
          stop(
            `Cloudflare refused the query (${status}). ${TOKEN_NEEDS} The deploy token does not have it yet: add that permission to it, or make a read-only token and set CLOUDFLARE_API_TOKEN.`
          )
        );
      }

      if (status === 200) {
        return Effect.succeed(text);
      }

      return NO_TABLE.test(text)
        ? Effect.succeed(NO_ROWS)
        : Effect.fail(
            stop(
              `Cloudflare's SQL API answered ${status}: ${text.slice(0, 200)}`
            )
          );
    })
  );

const rowsOf =
  <A, I>(rows: Schema.Codec<A, I>) =>
  (text: string) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(rows))(text).pipe(
      Effect.mapError(() =>
        stop(
          `Cloudflare answered in a form this script cannot read: ${text.slice(0, 200)}`
        )
      )
    );

const day = (at: number) => isoTime(at).slice(0, 10);

const report = Effect.gen(function* report() {
  const { period, stage } = yield* request;
  const needs = `${TOKEN_NEEDS} The account id is the one in the dashboard's URL.`;

  const token = yield* credential(
    "CLOUDFLARE_API_TOKEN",
    "cloudflare-api-token",
    needs
  ).pipe(Effect.mapError((missing) => stop(missing.reason)));

  const account = yield* credential(
    "CLOUDFLARE_ACCOUNT_ID",
    "cloudflare-account-id",
    needs
  ).pipe(Effect.mapError((missing) => stop(missing.reason)));

  const dataset = datasetName(stage);

  const [rooms, devices, counts] = yield* Effect.all([
    run(account, token, roomsQuery(dataset, period)).pipe(
      Effect.flatMap(rowsOf(RoomRowsSchema))
    ),
    run(account, token, devicesQuery(dataset, period)).pipe(
      Effect.flatMap(rowsOf(DeviceRowsSchema))
    ),
    run(account, token, countsQuery(dataset, period)).pipe(
      Effect.flatMap(rowsOf(CountRowsSchema))
    ),
  ]);

  const funnel = funnelOf(
    {
      counts: countRowsFrom(counts),
      devices: deviceRowsFrom(devices),
      rooms: roomRowsFrom(rooms),
    },
    period
  );

  yield* Console.log(
    [
      `nostakes ${stage}, ${day(period.from)} to ${day(period.to - DAY_MS)} UTC (dataset ${dataset})`,
      ...funnelLines(funnel),
      ...healthLines(funnel),
      ...reportedLines(funnel),
    ].join("\n")
  );
});

const outcome = await Effect.runPromiseExit(
  report.pipe(
    Effect.tapError((stopped) => Console.error(stopped.message)),
    Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer))
  )
);

process.exitCode = Exit.isSuccess(outcome) ? 0 : 1;
