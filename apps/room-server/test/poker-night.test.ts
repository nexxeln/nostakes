import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import type { Shuffle } from "@nostakes/room";
import { Effect } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import type { Temper } from "./fixtures/bot.js";
import type { ClientTemper } from "./fixtures/client-bot.js";
import {
  addFairness,
  emptyFairness,
  FAIRNESS_COUNT_NAMES,
} from "./fixtures/fair-checks.js";
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

const CHECKED_HANDS_PER_ROOM = 2;

const CHECKED_HANDS = 2 * CHECKED_HANDS_PER_ROOM;

interface SmallRoom {
  readonly players: number;
  readonly shuffle: Shuffle;
  readonly hands: number;
  readonly restarts: number;
}

const ROOMS: readonly SmallRoom[] = [
  {
    hands: CHECKED_HANDS_PER_ROOM,
    players: 3,
    restarts: 0,
    shuffle: "Checked",
  },
  {
    hands: CHECKED_HANDS_PER_ROOM,
    players: 2,
    restarts: 0,
    shuffle: "Checked",
  },
  { hands: 9, players: 5, restarts: 1, shuffle: "Plain" },
  { hands: 9, players: 2, restarts: 1, shuffle: "Plain" },
  { hands: 9, players: 4, restarts: 1, shuffle: "Plain" },
];

const TEMPER: Temper = {
  churnPercent: 6,
  dropPercent: 1,
  duplicatePercent: 8,
  illegalPercent: 3,
  mustTableMuckPercent: 90,
  secondDevicePercent: 1.5,
  shovePercent: 0,
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
  "a small night: five rooms play about 30 hands at once over real sockets, with restarts, timeouts, reconnects, duplicates, and a second device, and every check holds",
  Effect.gen(function* smallNight() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const plans = ROOMS.map(({ hands, players, restarts, shuffle }, index) =>
      planNight(
        SEED + index,
        {
          betweenHandsSeconds: 0,
          clientPercent: 50,
          handBudgetMs: 4000,
          hands,
          players,
          restarts,
          rotation: index * 2,
          shuffle,
          silences: 1,
          tableRules: {},
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
    const fairness = emptyFairness();

    for (const result of results) {
      addFairness(fairness, result.verdict.fairness);
    }

    yield* Effect.logInfo(
      `small night signals: ${(
        [
          "signalsSent",
          "peeksWithoutCards",
          "signalDeliveries",
          "peekDeliveries",
          "reactionDeliveries",
          "clientSignalsSent",
          "clientSignalsKeptOnDevice",
          "clientSignalsHeard",
        ] as const
      )
        .map(
          (name) =>
            `${name} ${results.reduce((sum, result) => sum + result.verdict.counts[name], 0)}`
        )
        .join(", ")}`
    );
    yield* Effect.logInfo(
      `small night fair shuffle: ${FAIRNESS_COUNT_NAMES.map((name) => `${name} ${fairness[name]}`).join(", ")}`
    );

    const total = (
      pick: (counts: (typeof results)[number]["verdict"]["counts"]) => number
    ) => results.reduce((sum, result) => sum + pick(result.verdict.counts), 0);

    expect(results.flatMap((result) => result.verdict.problems)).toEqual([]);
    expect(fairness.sealedDeals).toBeGreaterThanOrEqual(CHECKED_HANDS);
    expect(fairness.checkedInTime).toBeGreaterThanOrEqual(CHECKED_HANDS);
    expect(fairness.failedVerdicts).toBe(0);
    expect(fairness.plainHands).toBeGreaterThan(0);
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
    expect(total((counts) => counts.signalDeliveries)).toBeGreaterThan(0);
    expect(total((counts) => counts.peekDeliveries)).toBeGreaterThan(0);
    expect(total((counts) => counts.reactionDeliveries)).toBeGreaterThan(0);
    expect(total((counts) => counts.peeksWithoutCards)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientSignalsSent)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientSignalsHeard)).toBeGreaterThan(0);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 120_000 }
);
