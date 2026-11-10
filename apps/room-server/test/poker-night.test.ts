import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Effect } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import type { Temper } from "./fixtures/bot.js";
import type { ClientTemper } from "./fixtures/client-bot.js";
import {
  judgeNight,
  openNight,
  planNight,
  playNight,
} from "./fixtures/night.js";
import { PokerStack } from "./fixtures/poker-stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_night_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const SEED = 20_261_110;

const TEMPER: Temper = {
  churnPercent: 6,
  dropPercent: 1,
  duplicatePercent: 8,
  illegalPercent: 3,
  secondDevicePercent: 1.5,
  showdownSilencePercent: 5,
  silencePercent: 0,
  thinkMs: 30,
  voteSilencePercent: 0,
};

const CHAOS: ClientTemper = {
  blackHolePercent: 1.5,
  deafAtClosePercent: 0,
  deafPercent: 0,
  dropPercent: 1.5,
  echoPercent: 1,
  issueBeforeDropPercent: 70,
  napPercent: 0,
  waitOutSilencePercent: 0,
  wakePercent: 1,
};

test(
  "a small night: three rooms play about 30 hands over real sockets, with restarts, timeouts, reconnects, duplicates, and a second device, and every check holds",
  Effect.gen(function* smallNight() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const plans = [3, 5, 2].map((players, index) =>
      planNight(
        SEED + index,
        {
          betweenHandsSeconds: 0,
          clientPercent: 50,
          handBudgetMs: 4000,
          hands: 10,
          players,
          restarts: 1,
          rotation: index * 2,
          silences: 1,
          turnSeconds: 1,
        },
        TEMPER,
        CHAOS
      )
    );

    const opened = [];

    for (const plan of plans) {
      opened.push(yield* openNight(base, plan));
    }

    const played = yield* Effect.all(
      opened.map((night) => playNight(base, night)),
      { concurrency: "unbounded" }
    );

    const results = played.map(judgeNight);

    const total = (
      pick: (counts: (typeof results)[number]["verdict"]["counts"]) => number
    ) => results.reduce((sum, result) => sum + pick(result.verdict.counts), 0);

    expect(results.flatMap((result) => result.verdict.problems)).toEqual([]);
    expect(total((counts) => counts.hands)).toBeGreaterThanOrEqual(30);
    expect(total((counts) => counts.restarts)).toBeGreaterThanOrEqual(3);
    expect(total((counts) => counts.timeouts)).toBeGreaterThanOrEqual(3);
    expect(total((counts) => counts.reconnects)).toBeGreaterThanOrEqual(3);
    expect(
      total((counts) => counts.duplicatesConfirmed)
    ).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.viewsChecked)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientBots)).toBeGreaterThanOrEqual(3);
    expect(
      total((counts) => counts.clientCommandsTraced)
    ).toBeGreaterThanOrEqual(30);
    expect(total((counts) => counts.clientViewsChecked)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientEventsChecked)).toBeGreaterThan(0);
    expect(
      total((counts) => counts.clientIssuedBeforeDrop)
    ).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.clientResent)).toBeGreaterThanOrEqual(1);
    expect(
      total((counts) => counts.clientDropsBotClose)
    ).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.clientDropsRestart)).toBeGreaterThanOrEqual(
      1
    );
    expect(total((counts) => counts.clientWakes)).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.clientEchoes)).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.clientUnexpectedRefusals)).toBe(0);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 120_000 }
);
