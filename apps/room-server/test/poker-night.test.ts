import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import {
  ActionSchema,
  BombPots,
  ChipsSchema,
  SeatIndexSchema,
} from "@nostakes/engine";
import { CommandIdSchema } from "@nostakes/protocol";
import type { RoomCode, RoomPass } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  MemberCommandSchema,
  RoomViews,
} from "@nostakes/room";
import type { MemberCommand, Shuffle } from "@nostakes/room";
import { Effect, Option, Redacted, Schedule, Schema } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { DEFAULT_SETTINGS } from "../src/poker-room.js";
import type { Temper } from "./fixtures/bot.js";
import type { ClientTemper } from "./fixtures/client-bot.js";
import {
  addFairness,
  emptyFairness,
  FAIRNESS_COUNT_NAMES,
} from "./fixtures/fair-checks.js";
import {
  haltedViewOf,
  ledgerFromLog,
  soundPrefixOf,
  standingsProblems,
  unfinishedHand,
} from "./fixtures/halted-standings.js";
import type { NightEnding } from "./fixtures/night-checks.js";
import {
  judgeNight,
  openNight,
  planNight,
  playNight,
} from "./fixtures/night.js";
import type { StrangerPlan } from "./fixtures/night.js";
import {
  createPokerRoom,
  joinPokerRoom,
  postJson,
} from "./fixtures/poker-http.js";
import {
  awaitArrival,
  openSocket,
  pokerCodec,
} from "./fixtures/poker-socket.js";
import type {
  PokerServerMessage,
  PokerSocket,
} from "./fixtures/poker-socket.js";
import { PokerStack } from "./fixtures/poker-stack.js";
import { inspect, loseStoredEvent } from "./fixtures/stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_night_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const Commands = MemberCommandSchema.cases;

const seat = (index: number) => SeatIndexSchema.make(index);

const SEED = 20_261_110;

const CHECKED_HANDS_PER_ROOM = 2;

const BOMB_POT_ANTE = 4;

const CHECKED_HANDS = 2 * CHECKED_HANDS_PER_ROOM;

interface SmallRoom {
  readonly bombPotEvery?: number;
  readonly knocks?: boolean;
  readonly race?: boolean;
  readonly regular?: boolean;
  readonly stranger?: StrangerPlan;
  readonly ending: NightEnding;
  readonly players: number;
  readonly shuffle: Shuffle;
  readonly hands: number;
  readonly restarts: number;
}

const ROOMS: readonly SmallRoom[] = [
  {
    bombPotEvery: 2,
    ending: "AsItComes",
    hands: CHECKED_HANDS_PER_ROOM,
    players: 3,
    restarts: 0,
    shuffle: "Checked",
  },
  {
    ending: "Stalled",
    hands: CHECKED_HANDS_PER_ROOM,
    players: 2,
    restarts: 0,
    shuffle: "Checked",
  },
  {
    bombPotEvery: 3,
    ending: "MidHand",
    hands: 9,
    players: 5,
    restarts: 1,
    shuffle: "Plain",
    stranger: "Sits",
  },
  {
    ending: "AsItComes",
    hands: 9,
    knocks: true,
    players: 2,
    regular: true,
    restarts: 1,
    shuffle: "Plain",
  },
  {
    ending: "AsItComes",
    hands: 9,
    players: 4,
    race: true,
    restarts: 1,
    shuffle: "Plain",
    stranger: "Watches",
  },
  { ending: "Halted", hands: 3, players: 3, restarts: 0, shuffle: "Plain" },
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
  "a small night: six rooms play about 30 hands at once over real sockets, with restarts, timeouts, reconnects, duplicates, and a second device, and every check holds",
  Effect.gen(function* smallNight() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const plans = ROOMS.map(
      (
        {
          bombPotEvery,
          ending,
          hands,
          knocks,
          players,
          race,
          regular,
          restarts,
          shuffle,
          stranger,
        },
        index
      ) =>
        planNight(
          SEED + index,
          {
            betweenHandsSeconds: 0,
            clientPercent: 50,
            ending,
            handBudgetMs: 4000,
            hands,
            knocks: knocks ?? false,
            players,
            race: race ?? false,
            regular: regular ?? false,
            restarts,
            rotation: index * 2,
            shuffle,
            silences: 1,
            stranger: stranger ?? "None",
            tableRules:
              bombPotEvery === undefined
                ? {}
                : {
                    bombPot: BombPots.BombPots({
                      ante: ChipsSchema.make(BOMB_POT_ANTE),
                      everyHands: bombPotEvery,
                    }),
                  },
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
    yield* Effect.logInfo(
      `small night strangers: removed ${
        played.filter((night) =>
          Option.exists(night.intruder, ({ removedVia }) =>
            Option.isSome(removedVia)
          )
        ).length
      }, by clearing the room ${
        played.filter((night) =>
          night.events.some(
            (event, index) =>
              event.includes('"_tag":"MemberRemoved"') &&
              (night.events[index + 1] ?? "").includes(
                '"_tag":"SettingsChanged"'
              )
          )
        ).length
      }`
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
    expect(total((counts) => counts.bombPots)).toBeGreaterThanOrEqual(2);
    expect(total((counts) => counts.restarts)).toBeGreaterThanOrEqual(3);
    expect(total((counts) => counts.timeouts)).toBeGreaterThanOrEqual(3);
    expect(total((counts) => counts.reconnects)).toBeGreaterThanOrEqual(3);
    expect(
      total((counts) => counts.duplicatesConfirmed)
    ).toBeGreaterThanOrEqual(1);
    expect(total((counts) => counts.viewsChecked)).toBeGreaterThan(0);
    expect(total((counts) => counts.endedStalled)).toBe(1);
    expect(total((counts) => counts.endedHalted)).toBe(1);
    expect(total((counts) => counts.endedAfterHand)).toBeGreaterThanOrEqual(1);
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
    expect(
      played.filter((night) =>
        Option.exists(night.intruder, ({ removedVia }) =>
          Option.isSome(removedVia)
        )
      ).length
    ).toBe(plans.filter((plan) => Option.isSome(plan.intruderAtHand)).length);
    expect(
      played.flatMap((night) =>
        Option.toArray(night.regular).map(({ handsDealt, removedVia }) => ({
          handsDealt: handsDealt >= 1,
          removed: Option.isSome(removedVia),
        }))
      )
    ).toStrictEqual([{ handsDealt: true, removed: true }]);
    expect(total((counts) => counts.peekDeliveries)).toBeGreaterThan(0);
    expect(total((counts) => counts.reactionDeliveries)).toBeGreaterThan(0);
    expect(total((counts) => counts.peeksWithoutCards)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientSignalsSent)).toBeGreaterThan(0);
    expect(total((counts) => counts.clientSignalsHeard)).toBeGreaterThan(0);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 120_000 }
);

const StandingsBody = Schema.Struct({ view: Schema.Json });

const standingsFor = (base: string, code: RoomCode, token: string) =>
  postJson(new URL(`/rooms/${code}/standings`, base), { token }).pipe(
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.map((json) => ({ json, status: response.status }))
      )
    ),
    Effect.orDie
  );

const isReplyTo =
  (id: string) =>
  (
    message: PokerServerMessage
  ): message is typeof pokerCodec.server.cases.Reply.Type =>
    pokerCodec.server.guards.Reply(message) && message.id === id;

const latestOpenView = (socket: PokerSocket) =>
  Option.fromUndefinedOr(
    socket.arrivals.findLast(
      ({ message }) =>
        pokerCodec.server.guards.Events(message) ||
        pokerCodec.server.guards.Welcome(message)
    )?.message
  ).pipe(
    Option.flatMap((message) =>
      pokerCodec.server.guards.Events(message) ||
      pokerCodec.server.guards.Welcome(message)
        ? Option.some(message.view)
        : Option.none()
    ),
    Option.filter(RoomViews.$is("Open"))
  );

const toActIn = (sockets: readonly PokerSocket[], hand: number) =>
  Effect.sync(() =>
    sockets.flatMap((socket) =>
      latestOpenView(socket).pipe(
        Option.filter((view) =>
          Option.exists(view.hand, ({ handNumber }) => handNumber === hand)
        ),
        Option.flatMap(({ legal }) => legal),
        Option.map((legal) => ({ legal, socket })),
        Option.toArray
      )
    )
  ).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("50 millis"),
      times: 200,
      until: (found) => found.length > 0,
    }),
    Effect.flatMap((found) => Effect.fromNullishOr(found[0])),
    Effect.orDie
  );

const ask = (socket: PokerSocket, id: string, command: MemberCommand) =>
  Effect.gen(function* askRoom() {
    const from = socket.arrivals.length;

    yield* socket.send(
      pokerCodec.client.cases.Command.make({
        command,
        id: CommandIdSchema.make(id),
      })
    );

    return yield* awaitArrival(socket, `reply ${id}`, isReplyTo(id), from);
  }).pipe(Effect.orDie);

const acted = (sockets: readonly PokerSocket[], hand: number, id: string) =>
  Effect.gen(function* actOnce() {
    const { legal, socket } = yield* toActIn(sockets, hand);

    const action = Option.isSome(legal.call)
      ? ActionSchema.cases.Call.make({})
      : ActionSchema.cases.Check.make({});

    const reply = yield* ask(socket, id, Commands.Act.make({ action }));

    return pokerCodec.reply.guards.Accepted(reply.result)
      ? reply.result.seq
      : 0;
  });

const greeted = (base: string, pass: RoomPass, label: string) =>
  Effect.gen(function* greet() {
    const socket = yield* openSocket(base, pass.code, label);

    yield* socket.send(
      pokerCodec.client.cases.Hello.make({
        after: Option.none(),
        token: pass.token,
      })
    );
    yield* awaitArrival(socket, "welcome", pokerCodec.server.guards.Welcome);

    return socket;
  }).pipe(Effect.orDie);

test(
  "a room halted mid-hand by a lost stored event still serves its standings: chips in the unfinished hand go back, the nets add up to zero, and they match a ledger read from the log",
  Effect.gen(function* haltedStandings() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const settings = { ...DEFAULT_SETTINGS, betweenHandsSeconds: 0 };

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
      settings: { ...settings, shuffle: "Plain" },
    }).pipe(Effect.orDie);

    const benPass = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "owl",
      name: "Ben",
    }).pipe(Effect.orDie);

    const ana = yield* greeted(base, anaPass, "ana");
    const ben = yield* greeted(base, benPass, "ben");

    yield* ask(
      ana,
      "sit",
      Commands.RequestSeat.make({
        buyIn: ChipAmountSchema.make(200),
        seat: seat(0),
      })
    );
    yield* ask(
      ben,
      "sit",
      Commands.RequestSeat.make({
        buyIn: ChipAmountSchema.make(200),
        seat: seat(1),
      })
    );
    yield* ask(ana, "start", Commands.StartGame.make({}));

    const first = yield* toActIn([ana, ben], 1);

    yield* ask(
      first.socket,
      "fold",
      Commands.Act.make({ action: ActionSchema.cases.Fold.make({}) })
    );

    const called = yield* acted([ana, ben], 2, "call");

    yield* acted([ana, ben], 2, "check");
    yield* acted([ana, ben], 2, "flop");

    const before = yield* inspect(base, anaPass.code);

    yield* loseStoredEvent(base, anaPass.code, called + 1);

    const anaStandings = yield* standingsFor(
      base,
      anaPass.code,
      Redacted.value(anaPass.token)
    );

    const benStandings = yield* standingsFor(
      base,
      anaPass.code,
      Redacted.value(benPass.token)
    );

    const stranger = yield* standingsFor(base, anaPass.code, "a".repeat(43));
    const after = yield* inspect(base, anaPass.code);
    const sound = soundPrefixOf(after.seqs, after.events);
    const ledger = ledgerFromLog(sound);

    expect({
      halted: after.halted,
      statuses: [anaStandings.status, benStandings.status, stranger.status],
    }).toStrictEqual({
      halted: Option.some(
        `stored event ${called + 1} has sequence number ${called + 2}`
      ),
      statuses: [200, 200, 403],
    });

    const views = [anaStandings, benStandings].map(({ json }) =>
      haltedViewOf(Schema.decodeUnknownSync(StandingsBody)(json).view)
    );

    expect(before.halted).toStrictEqual(Option.none());
    expect(sound.length).toBe(called);
    expect(unfinishedHand(sound)).toBe(true);
    expect(
      views.flatMap((view) =>
        standingsProblems(view, ledger, {
          ledger: sound.length,
          standings: after.headSeq,
        })
      )
    ).toEqual([]);
    expect(
      ledger.map(({ net }) => net).toSorted((left, right) => left - right)
    ).toEqual([-1, 1]);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);
