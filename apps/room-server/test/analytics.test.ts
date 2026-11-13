import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { RoomCodeSchema } from "@nostakes/protocol";
import { Effect, Option } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { ANALYTICS_FAULT } from "../src/analytics.js";
import { hashDevice } from "../src/device.js";
import { REPORTS_ROUTE } from "../src/room-routes.js";
import { roomAnalytics, siteAnalytics } from "./fixtures/analytics-checks.js";
import type { Temper } from "./fixtures/bot.js";
import type { ClientTemper } from "./fixtures/client-bot.js";
import { harnessHttp } from "./fixtures/harness-http.js";
import {
  judgeNight,
  openNight,
  planNight,
  playNight,
} from "./fixtures/night.js";
import type { OpenedNight } from "./fixtures/night.js";
import { createPokerRoom, joinPokerRoom } from "./fixtures/poker-http.js";
import { PokerStack } from "./fixtures/poker-stack.js";
import { inspect, queueCodes } from "./fixtures/stack.js";
import type { AnalyticsMode } from "./fixtures/test-analytics.js";
import { TEST_ORIGIN } from "./fixtures/toy-worker.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_analytics_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const HOST_DEVICE = "host-device-raw-identifier-0001";

const GUEST_DEVICE = "guest-device-raw-identifier-0002";

const CALM: Temper = {
  churnPercent: 0,
  dropPercent: 0,
  duplicatePercent: 0,
  illegalPercent: 0,
  mustTableMuckPercent: 90,
  secondDevicePercent: 0,
  shovePercent: 0,
  showdownSilencePercent: 0,
  silencePercent: 0,
  thinkMs: 20,
  voteSilencePercent: 0,
};

const STEADY: ClientTemper = {
  blackHolePercent: 0,
  deafAtClosePercent: 0,
  deafPercent: 0,
  dropPercent: 0,
  echoPercent: 0,
  issueBeforeDropPercent: 0,
  napPercent: 0,
  waitOutSilencePercent: 0,
  wakePercent: 0,
};

const postReport = (base: string, json: string) =>
  HttpClientRequest.post(new URL(REPORTS_ROUTE, base)).pipe(
    HttpClientRequest.setHeader("origin", TEST_ORIGIN),
    HttpClientRequest.bodyText(json, "application/json"),
    HttpClient.execute,
    Effect.orDie
  );

const setMode = (base: string, code: string, mode: AnalyticsMode) =>
  HttpClientRequest.post(new URL(`/test/rooms/${code}/analytics`, base)).pipe(
    HttpClientRequest.bodyJsonUnsafe({ mode }),
    HttpClient.execute,
    Effect.asVoid,
    Effect.orDie
  );

test(
  "a room's data points name it by a key, and carry only the hash of each device that opened or joined it",
  Effect.gen(function* devicesAreHashed() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const code = RoomCodeSchema.make("HSH4DV");

    yield* queueCodes(base, [code]);

    yield* createPokerRoom(
      base,
      { avatar: "fox", name: "Ana" },
      Option.some(HOST_DEVICE)
    );
    yield* joinPokerRoom(
      base,
      code,
      { avatar: "owl", name: "Ben" },
      Option.some(GUEST_DEVICE)
    );
    yield* joinPokerRoom(base, code, { avatar: "cat", name: "Cy" });

    const points = yield* roomAnalytics(base, code);
    const blobs = points.flatMap(({ point }) => point.blobs);

    expect(points.map(({ point }) => point.blobs)).toEqual([
      ["RoomOpened", ""],
      ["MemberJoined", yield* hashDevice(HOST_DEVICE)],
      ["MemberJoined", yield* hashDevice(GUEST_DEVICE)],
      ["MemberJoined", ""],
    ]);
    expect(
      [HOST_DEVICE, GUEST_DEVICE, code, "Ana", "Ben", "fox", "owl"].filter(
        (secret) => blobs.some((blob) => blob.includes(secret))
      )
    ).toEqual([]);
    expect(new Set(points.map(({ point }) => point.indexes[0])).size).toBe(1);
    expect(points[0]?.point.indexes[0]).toMatch(/^[0-9a-f]{16}$/u);
  }).pipe(Effect.provide(harnessHttp))
);

test(
  "a report from a page lands as a count with its message stripped of codes, quotes, and tokens, and a malformed one is refused",
  Effect.gen(function* reportsAreStripped() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const sent = yield* postReport(
      base,
      '{"_tag":"ClientError","build":"web-build-1","message":"Cannot read \'Ana\' in room K7P2XZ with token Zm9vYmFyYmF6cXV4cXV1eA at https://nostakes.club/r/K7P2XZ","name":"TypeError","screen":"Room"}'
    );

    const refused = yield* postReport(
      base,
      '{"_tag":"ClientError","build":"web-build-1","message":"a name the page should never send","name":"Ana Lovelace <ana@example.com>","screen":"Room"}'
    );

    const points = yield* siteAnalytics(base);

    expect([sent.status, refused.status]).toEqual([204, 400]);
    expect(
      points
        .map(({ point }) => point)
        .filter((point) => point.blobs[0] === "ClientError")
    ).toEqual([
      {
        blobs: [
          "ClientError",
          "TypeError",
          "Cannot read <quoted> in room <code> with token <long> at <address>",
          "web-build-1",
          "Room",
        ],
        doubles: [],
        indexes: ["site"],
      },
    ]);
  }).pipe(Effect.provide(harnessHttp))
);

const openWith = (base: string, seed: number, mode: AnalyticsMode) =>
  Effect.gen(function* openWithSink() {
    const plan = planNight(
      seed,
      {
        betweenHandsSeconds: 0,
        clientPercent: 50,
        ending: "AsItComes",
        handBudgetMs: 4000,
        hands: 3,
        players: 3,
        restarts: 0,
        rotation: 0,
        shuffle: "Plain",
        silences: 0,
        tableRules: {},
        turnSeconds: 1,
      },
      CALM,
      STEADY
    );

    yield* setMode(base, plan.code, mode);

    return yield* openNight(base, plan);
  });

const playWith = (base: string, opened: OpenedNight) =>
  Effect.gen(function* playWithSink() {
    const result = judgeNight(yield* playNight(base, opened));
    const inspection = yield* inspect(base, opened.plan.code);

    return { inspection, result };
  });

test(
  "a sink that fails every write, or never finishes one, changes nothing in the game: every reply arrives, every check holds, and the failure is logged once",
  Effect.gen(function* sinkCannotHurtTheGame() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const failingNight = yield* openWith(base, 7001, "Fail");
    const hangingNight = yield* openWith(base, 7002, "Hang");

    const [failing, hanging] = yield* Effect.all(
      [playWith(base, failingNight), playWith(base, hangingNight)],
      { concurrency: "unbounded" }
    );

    for (const { result } of [failing, hanging]) {
      expect(
        result.verdict.problems.filter(
          (problem) => !problem.startsWith("analytics:")
        )
      ).toEqual([]);
      expect(result.verdict.counts.hands).toBeGreaterThanOrEqual(3);
      expect(result.points).toEqual([]);
    }

    expect(
      failing.inspection.faults.filter((fault) => fault === ANALYTICS_FAULT)
    ).toEqual([ANALYTICS_FAULT]);
    expect(hanging.inspection.faults).toEqual([]);
  }).pipe(Effect.provide(harnessHttp)),
  { timeout: 120_000 }
);
