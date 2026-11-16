import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Console,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import {
  FEEDBACK_READ_ROUTE,
  FEEDBACK_SECRET,
  FeedbackPageSchema,
} from "../src/feedback-wire.ts";
import type { KeptNote } from "../src/feedback-wire.ts";
import { siteOrigin, SiteStageSchema } from "../src/site.ts";
import { harnessHttp } from "../test/fixtures/harness-http.ts";
import { credential } from "./cloudflare-credentials.ts";
import { printed } from "./feedback-text.ts";

const USAGE =
  "usage: pnpm feedback [production | preview | <base url>] [--since=YYYY-MM-DD]";

const SECRET_NEEDS =
  "It is the secret the deploy gave the Worker as FEEDBACK_SECRET; see docs/deploying.md.";

const MOST_PAGES = 100;

class FeedbackStopped extends Schema.TaggedError<
  FeedbackStopped,
  { readonly brand: unique symbol }
>()("FeedbackStopped", { reason: Schema.String }) {
  override get message() {
    return this.reason;
  }
}

const stop = (reason: string) => new FeedbackStopped({ reason });

const SINCE = /^--since=(?<day>\d{4}-\d{2}-\d{2})$/u;

const baseOf = (target: string) =>
  /^https?:\/\//u.test(target)
    ? Option.some(target)
    : Schema.decodeUnknownOption(SiteStageSchema)(target).pipe(
        Option.map(siteOrigin)
      );

const sinceOf = (flag: string | undefined) => {
  if (flag === undefined) {
    return Option.some(0);
  }

  const day = SINCE.exec(flag)?.groups?.day;

  return day === undefined
    ? Option.none()
    : DateTime.make(`${day}T00:00:00Z`).pipe(
        Option.map(DateTime.toEpochMillis)
      );
};

const request = Effect.gen(function* readRequest() {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith("--")) ?? "production";
  const flags = args.filter((arg) => arg.startsWith("--"));
  const base = baseOf(target);
  const since = sinceOf(flags[0]);

  if (Option.isNone(base) || Option.isNone(since) || flags.length > 1) {
    return yield* stop(USAGE);
  }

  return { base: base.value, since: since.value };
});

const pageOf = (
  base: string,
  secret: Redacted.Redacted,
  after: number,
  since: number
) =>
  HttpClientRequest.post(new URL(FEEDBACK_READ_ROUTE, base)).pipe(
    HttpClientRequest.setHeader(
      "authorization",
      `Bearer ${Redacted.value(secret)}`
    ),
    HttpClientRequest.bodyJsonUnsafe({ after, since }),
    HttpClient.execute,
    Effect.flatMap((response) =>
      response.text.pipe(
        Effect.map((text) => ({ status: response.status, text }))
      )
    ),
    Effect.mapError(() =>
      stop(`${base} did not answer. Check the address and the network.`)
    ),
    Effect.flatMap(({ status, text }) =>
      status === 200
        ? Schema.decodeEffect(Schema.fromJsonString(FeedbackPageSchema))(
            text
          ).pipe(
            Effect.mapError(() =>
              stop(`${base} answered notes in a form this script cannot read.`)
            )
          )
        : Effect.fail(
            stop(
              status === 403
                ? `${base} refused the feedback secret. ${SECRET_NEEDS}`
                : `${base} answered ${status} instead of the notes.`
            )
          )
    )
  );

const report = Effect.gen(function* report() {
  const { base, since } = yield* request;

  const secret = yield* credential(
    FEEDBACK_SECRET,
    "feedback-secret",
    SECRET_NEEDS
  ).pipe(Effect.mapError((missing) => stop(missing.reason)));

  const notes: KeptNote[] = [];
  let after = 0;
  let more = true;

  for (let page = 0; more && page < MOST_PAGES; page += 1) {
    const read = yield* pageOf(base, secret, after, since);

    notes.push(...read.notes);
    after = read.notes.at(-1)?.id ?? after;
    more = read.more && read.notes.length > 0;
  }

  yield* Console.log(
    [
      `${notes.length} ${notes.length === 1 ? "note" : "notes"} from ${base}`,
      ...notes.map((note) => `\n${printed(note)}`),
    ].join("\n")
  );
});

const outcome = await Effect.runPromiseExit(
  report.pipe(
    Effect.tapError((stopped) => Console.error(stopped.message)),
    Effect.provide(Layer.merge(NodeServices.layer, harnessHttp))
  )
);

process.exitCode = Exit.isSuccess(outcome) ? 0 : 1;
