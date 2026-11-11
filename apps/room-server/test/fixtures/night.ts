import { Antes, ChipsSchema, SEAT_COUNT } from "@nostakes/engine";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomCodeSchema,
} from "@nostakes/protocol";
import type { RoomCode, RoomPass } from "@nostakes/protocol";
import {
  DEFAULT_PAUSE_WHEN_AWAY_SECONDS,
  RoomSettingsSchema,
  RoomViews,
  TimeBankRefills,
} from "@nostakes/room";
import type { RoomSettings, RoomView, Shuffle } from "@nostakes/room";
import { beaconWaitLimitMs, SEALING_MARGIN_MS } from "@nostakes/shuffle";
import { Duration, Effect, Option, Schema } from "effect";

import type { StampedPoint } from "../../src/measures.js";
import { checkAnalytics, hashesOf, roomAnalytics } from "./analytics-checks.js";
import type { NightAnalytics } from "./analytics-checks.js";
import { handsSeen, randomSource, startBot } from "./bot.js";
import type {
  BotRecord,
  NightControl,
  OpenView,
  Random,
  Role,
  RuleChange,
  Temper,
} from "./bot.js";
import { startClientBot } from "./client-bot.js";
import type { ClientBotRecord, ClientTemper } from "./client-bot.js";
import { timeline } from "./client-wire.js";
import type { Timeline } from "./client-wire.js";
import { haltMidHand } from "./halt-night.js";
import { HeldArrival, KEPT_DECODED } from "./held-arrival.js";
import {
  DOOR_WAIT_MS,
  INTRUDER_NAME,
  KNOCKER_NAME,
  intrude,
  intruderProblems,
  joinIntruder,
  knockAt,
} from "./intruder.js";
import type { IntruderRecord } from "./intruder.js";
import { checkNight } from "./night-checks.js";
import type {
  HaltEvidence,
  NightEnding,
  NightEvidence,
  NightVerdict,
} from "./night-checks.js";
import { createPokerRoom, joinPokerRoom } from "./poker-http.js";
import { pokerCodec, wallClock } from "./poker-socket.js";
import type { Arrival } from "./poker-socket.js";
import {
  REGULAR_NAME,
  joinRegular,
  playRegular,
  regularProblems,
} from "./regular.js";
import type { RegularRecord } from "./regular.js";
import {
  inspect,
  jamRoom,
  queueCodes,
  refusedAlarms,
  restart,
} from "./stack.js";
import { TEST_CHAIN } from "./test-beacon.js";

type EncodedSettings = typeof RoomSettingsSchema.Encoded;

export type TableRules = Partial<EncodedSettings["table"]>;

export interface NightPlan {
  readonly ending: NightEnding;
  readonly seed: number;
  readonly code: RoomCode;
  readonly settings: RoomSettings;
  readonly players: number;
  readonly spectators: number;
  readonly lateJoiners: number;
  readonly hands: number;
  readonly restartHands: readonly number[];
  readonly voteRestarts: number;
  readonly ruleChanges: readonly RuleChange[];
  readonly silences: readonly number[];
  readonly temper: Temper;
  readonly chaos: ClientTemper;
  readonly clients: readonly number[];
  readonly limitMs: number;
  readonly devices: readonly string[];
  readonly intruderAtHand: Option.Option<number>;
  readonly intruderSits: boolean;
  readonly regularAtHand: Option.Option<number>;
}

export interface PlayedNight {
  readonly plan: NightPlan;
  readonly evidence: NightEvidence;
  readonly events: readonly string[];
  readonly durationMs: number;
  readonly analytics: NightAnalytics;
  readonly intruder: Option.Option<IntruderRecord>;
  readonly regular: Option.Option<RegularRecord>;
}

export interface NightResult {
  readonly plan: NightPlan;
  readonly verdict: NightVerdict;
  readonly checkedAt: number;
  readonly checkMs: number;
  readonly events: readonly string[];
  readonly durationMs: number;
  readonly points: readonly StampedPoint[];
}

export const DEVICE_GROUPS = 4;

export const deviceFor = (seed: number, index: number) =>
  `nostakes-bot-device-${seed % DEVICE_GROUPS}-${index}`;

export class NightFailed extends Schema.TaggedError<
  NightFailed,
  { readonly brand: unique symbol }
>()("NightFailed", {
  code: Schema.String,
  problem: Schema.String,
  seed: Schema.Int,
}) {
  override get message() {
    return `The night in room ${this.code} of seed ${this.seed} failed: ${this.problem}. Rerun with the same seed and read the saved log.`;
  }
}

export const WATCHDOG_MARGIN_MS = 6000;

export const SEALED_DEAL_WAIT_MS =
  SEALING_MARGIN_MS +
  TEST_CHAIN.periodSeconds * 1000 +
  beaconWaitLimitMs(TEST_CHAIN);

export const CLOSE_GRACE_MS = 30_000;

export const SETTLE_LIMIT_MS = 30_000;

export const STALL_LIMIT_MS = 20_000 + beaconWaitLimitMs(TEST_CHAIN);

export const MID_HAND_WAIT_MS = 15_000;

interface Watched {
  readonly latest: () => Option.Option<RoomView>;
  readonly lastSeq: () => number;
  readonly lastTableAt: () => number;
}

const codeFrom = (random: Random): RoomCode =>
  RoomCodeSchema.make(
    Array.from({ length: ROOM_CODE_LENGTH }, () =>
      ROOM_CODE_ALPHABET.charAt(random.below(ROOM_CODE_ALPHABET.length))
    ).join("")
  );

const decodeSettings = Schema.decodeSync(RoomSettingsSchema);

const withTable = (
  settings: EncodedSettings,
  table: Partial<EncodedSettings["table"]>
): EncodedSettings => ({ ...settings, table: { ...settings.table, ...table } });

export const RULES: readonly RuleChange[] = [
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, {
        ante: Antes.EveryPlayer({ amount: ChipsSchema.make(1) }),
      }),
    label: "every player antes 1",
  },
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, { straddle: { button: true, underTheGun: 2 } }),
    label: "straddles on the button and two under the gun",
  },
  {
    atHand: 0,
    change: (settings) => withTable(settings, { maxRuns: 3, rabbitHunt: true }),
    label: "up to three runs and rabbit hunts",
  },
  {
    atHand: 0,
    change: (settings) => ({
      ...settings,
      approval: {
        ...settings.approval,
        chips: !settings.approval.chips,
        seats: !settings.approval.seats,
      },
    }),
    label: "approvals flip",
  },
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, {
        ante: Antes.BigBlindPays({
          amount: ChipsSchema.make(settings.table.bigBlind),
        }),
      }),
    label: "the big blind pays the ante",
  },
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, {
        ante: Antes.NoAnte(),
        maxRuns: 2,
        straddle: { button: false, underTheGun: 1 },
      }),
    label: "no ante, two runs, one straddle",
  },
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, {
        showdown:
          settings.table.showdown === "Interactive"
            ? "Automatic"
            : "Interactive",
      }),
    label: "showdowns flip between interactive and automatic",
  },
  {
    atHand: 0,
    change: (settings) =>
      withTable(settings, {
        allInHands:
          settings.table.allInHands === "Hidden" ? "FaceUp" : "Hidden",
      }),
    label: "all-in hands flip between face up and hidden",
  },
];

export type StrangerPlan = "None" | "Sits" | "Watches";

export interface NightRecipe {
  readonly ending: NightEnding;
  readonly shuffle: Shuffle;
  readonly handBudgetMs: number;
  readonly rotation: number;
  readonly betweenHandsSeconds: number;
  readonly players: number;
  readonly hands: number;
  readonly turnSeconds: number;
  readonly restarts: number;
  readonly silences: number;
  readonly clientPercent: number;
  readonly tableRules: TableRules;
  readonly stranger?: StrangerPlan;
  readonly regular?: boolean;
}

const clientIndices = (random: Random, bots: number, percent: number) => {
  const drawn = Array.from({ length: bots }, (_, index) => index).filter(() =>
    random.chance(percent)
  );

  if (bots < 2 || percent <= 0) {
    return drawn;
  }

  if (drawn.length === 0) {
    return [random.below(bots)];
  }

  return drawn.length === bots ? drawn.slice(1) : drawn;
};

const tableFrom = (
  random: Random,
  small: number
): EncodedSettings["table"] => ({
  allInHands: random.chance(40) ? "Hidden" : "FaceUp",
  ante: Antes.NoAnte(),
  bigBlind: small * 2,
  blindPosting: random.chance(30) ? "Casino" : "HomeGame",
  maxRuns: random.between(1, 3),
  rabbitHunt: random.chance(50),
  rabbitHunters: random.chance(30) ? "StillIn" : "DealtIn",
  runCount: random.chance(25) ? "Fixed" : "Vote",
  showdown: random.chance(80) ? "Interactive" : "Automatic",
  showdownOrder: random.chance(30) ? "LastAggressor" : "RiverAggressor",
  smallBlind: small,
  straddle: { button: random.chance(50), underTheGun: random.below(3) },
  straddleSize: random.chance(30) ? "TwoBigBlinds" : "Doubling",
  voluntaryShows: random.chance(30) ? "BothCards" : "EitherCard",
});

export const HOST_DEAL_WAIT_MS = 6000;

const longestBankSeconds = (settings: RoomSettings) =>
  Math.max(
    settings.timeBankSeconds,
    TimeBankRefills.$match(settings.timeBankRefill, {
      NoRefill: () => 0,
      Refill: ({ upTo }) => upTo,
    })
  );

export const slowRulesAllowanceMs = (settings: RoomSettings) => {
  const keepsAbsentPlayersIn =
    settings.sitOutAfterTimeouts !== 1 || settings.leavingMidHand === "PlaysOn";

  return (
    (settings.dealing === "Host" ? HOST_DEAL_WAIT_MS : 0) +
    (keepsAbsentPlayersIn && settings.turnSeconds > 0
      ? (settings.turnSeconds + longestBankSeconds(settings)) * 2000
      : 0)
  );
};

const strangerOf = (recipe: NightRecipe, seed: number) => ({
  intruderAtHand:
    recipe.ending !== "Halted" &&
    recipe.hands >= 6 &&
    (recipe.stranger === undefined
      ? randomSource(seed * 13 + 5).chance(50)
      : recipe.stranger !== "None")
      ? Option.some(Math.max(2, Math.floor(recipe.hands / 3)))
      : Option.none(),
  intruderSits:
    recipe.stranger === undefined
      ? randomSource(seed * 13 + 7).chance(70)
      : recipe.stranger === "Sits",
  regularAtHand:
    recipe.ending !== "Halted" &&
    recipe.hands >= 6 &&
    (recipe.regular ?? randomSource(seed * 13 + 9).chance(30))
      ? Option.some(Math.max(2, Math.floor(recipe.hands / 3)))
      : Option.none(),
});

export const planNight = (
  seed: number,
  recipe: NightRecipe,
  temper: Temper,
  chaos: ClientTemper
): NightPlan => {
  const random = randomSource(seed);
  const small = random.between(1, 3);
  const big = small * 2;

  const changes = Math.min(
    RULES.length,
    Math.max(2, Math.floor(recipe.hands / 5))
  );

  const settings = decodeSettings({
    approval: { chips: random.chance(50), seats: random.chance(50) },
    betweenHandsSeconds: recipe.betweenHandsSeconds,
    buyIn: { max: big * 50, min: big * 10 },
    leavingMidHand: random.chance(40) ? "PlaysOn" : "ActedFor",
    pauseWhenAwaySeconds: seed % 4 === 0 ? 0 : DEFAULT_PAUSE_WHEN_AWAY_SECONDS,
    runChoiceSeconds: random.between(1, 2),
    seats: random.chance(50)
      ? 9
      : random.between(Math.max(2, recipe.players), 9),
    showdownSeconds: random.between(1, 2),
    shuffle: recipe.shuffle,
    sitOutAfterTimeouts: [1, 1, 1, 0, 2][random.below(5)] ?? 1,
    table: { ...tableFrom(random, small), ...recipe.tableRules },
    timeBankRefill:
      recipe.turnSeconds > 0 && random.chance(50)
        ? TimeBankRefills.Refill({
            everyHands: random.between(1, 3),
            seconds: 1,
            upTo: random.between(1, 3),
          })
        : TimeBankRefills.NoRefill(),
    timeBankSeconds: recipe.turnSeconds > 0 ? random.between(1, 2) : 0,
    topUps:
      (["UpToMax", "UpToMax", "BelowMin", "WhenBust"] as const)[
        random.below(4)
      ] ?? "UpToMax",
    turnSeconds: recipe.turnSeconds,
  });

  const lateJoiners = recipe.players > 2 ? 1 : 0;

  const plan = {
    chaos,
    code: codeFrom(random),
    hands: recipe.hands,
    lateJoiners,
    limitMs:
      recipe.hands *
        (recipe.handBudgetMs +
          (recipe.shuffle === "Checked" ? SEALED_DEAL_WAIT_MS : 0)) +
      60_000,
    players: recipe.players - (recipe.players > 2 ? 1 : 0),
    restartHands: Array.from({ length: recipe.restarts }, (_, index) =>
      Math.max(
        2,
        Math.min(
          recipe.hands - 2,
          Math.floor(((index + 1) * recipe.hands) / (recipe.restarts + 1)) +
            random.below(2)
        )
      )
    ),
    ruleChanges: Array.from({ length: changes }, (_, index) => {
      const rule = RULES[(recipe.rotation + index) % RULES.length] ?? RULES[0];

      return {
        atHand: Math.floor(((index + 1) * recipe.hands) / (changes + 1)),
        change: rule?.change ?? ((same) => same),
        label: rule?.label ?? "none",
      };
    }),
    seed,
    settings,
    silences:
      recipe.turnSeconds > 0
        ? Array.from(
            { length: recipe.silences },
            (_, index) => 2 + index * 3 + random.below(2)
          )
        : [],
    spectators: random.chance(50) && recipe.stranger !== "Watches" ? 1 : 0,
    temper,
    voteRestarts: 1,
  };

  const clients = clientIndices(
    random,
    plan.players + plan.spectators + plan.lateJoiners,
    recipe.clientPercent
  );

  const hostDeals = !clients.includes(0) && random.chance(30);

  const played = hostDeals
    ? { ...settings, dealing: "Host" as const }
    : settings;

  const visitors = strangerOf(recipe, seed);

  return {
    ...plan,
    clients,
    devices: Array.from(
      { length: plan.players + plan.spectators + plan.lateJoiners },
      (_, index) => deviceFor(seed, index)
    ),
    ending: recipe.ending,

    ...visitors,
    limitMs: plan.limitMs + recipe.hands * slowRulesAllowanceMs(played),
    settings: Option.isSome(visitors.regularAtHand)
      ? { ...played, seats: SEAT_COUNT }
      : played,
  };
};

const longestClockMs = (view: RoomView) =>
  RoomViews.$is("Open")(view)
    ? Math.max(
        view.settings.turnSeconds +
          Math.max(
            view.settings.timeBankSeconds,
            TimeBankRefills.$match(view.settings.timeBankRefill, {
              NoRefill: () => 0,
              Refill: ({ upTo }) => upTo,
            })
          ),
        view.settings.runChoiceSeconds,
        view.settings.betweenHandsSeconds
      ) *
        1000 +
      (view.settings.shuffle === "Checked" ? SEALED_DEAL_WAIT_MS : 0)
    : 0;

const waitsForTheHost = (view: RoomView) =>
  RoomViews.$is("Open")(view) &&
  view.settings.dealing === "Host" &&
  Option.isNone(view.hand) &&
  Option.isNone(view.clocks.nextDeal);

type RestartMoment = "between hands" | "mid-hand" | "mid-vote";

const restartMoment = (
  view: OpenView,
  hands: number,
  due: number | undefined,
  voteRestartsLeft: boolean
): Option.Option<RestartMoment> => {
  const voting = view.hand.pipe(
    Option.exists((current) => Option.isSome(current.choosingRuns))
  );

  if (voting) {
    return voteRestartsLeft ? Option.some("mid-vote") : Option.none();
  }

  const midHand = Option.isSome(view.hand);

  return due !== undefined && hands >= due && (midHand || hands > due)
    ? Option.some(midHand ? "mid-hand" : "between hands")
    : Option.none();
};

const shouldAdvance = (view: RoomView) =>
  RoomViews.$is("Open")(view) &&
  view.game === "Running" &&
  (Option.isSome(view.hand) ||
    (!waitsForTheHost(view) &&
      view.seats.filter(({ occupant }) =>
        occupant.pipe(
          Option.exists(({ sittingOut, stack }) => !sittingOut && stack > 0)
        )
      ).length >= 2));

export interface OpenedNight {
  readonly plan: NightPlan;
  readonly passes: readonly RoomPass[];
  readonly openedAt: number;
  readonly journal: Timeline;
  readonly bots: BotRecord[];
  readonly clients: ClientBotRecord[];
}

export interface Holding {
  readonly frames: number;
  readonly frameBytes: number;
  readonly notes: number;
  readonly byKind: ReadonlyMap<string, { count: number; bytes: number }>;
}

export const holdingOf = (night: OpenedNight): Holding => {
  const arrivals = [
    ...night.bots.flatMap((bot) =>
      bot.devices.flatMap((device) =>
        device.sockets.flatMap(({ socket }) => socket.arrivals)
      )
    ),
    ...night.clients.flatMap((client) => client.arrivals()),
  ];

  const byKind = new Map<string, { count: number; bytes: number }>();

  for (const arrival of arrivals) {
    const { text } = arrival;

    const tag =
      arrival instanceof HeldArrival ? arrival.kind : arrival.message._tag;

    const kind = byKind.get(tag) ?? { bytes: 0, count: 0 };

    byKind.set(tag, {
      bytes: kind.bytes + text.length,
      count: kind.count + 1,
    });
  }

  return {
    byKind,
    frameBytes: arrivals.reduce((sum, { text }) => sum + text.length, 0),
    frames: arrivals.length,
    notes:
      night.journal.moments().length +
      night.clients.reduce((sum, client) => sum + client.timeline().length, 0),
  };
};

export const openNight = (base: string, plan: NightPlan) =>
  Effect.gen(function* openRoomForNight() {
    const openedAt = wallClock();

    yield* queueCodes(base, [plan.code]);

    const host = yield* createPokerRoom(
      base,
      {
        avatar: "bot",
        name: "bot0",
        settings: plan.settings,
      },
      Option.fromUndefinedOr(plan.devices[0])
    );

    if (host.code !== plan.code) {
      return yield* new NightFailed({
        code: plan.code,
        problem: `the room opened as ${host.code}`,
        seed: plan.seed,
      });
    }

    const passes = [host];

    for (let index = 1; index < plan.players + plan.spectators; index += 1) {
      passes.push(
        yield* joinPokerRoom(
          base,
          plan.code,
          {
            avatar: "bot",
            name: `bot${index}`,
          },
          Option.fromUndefinedOr(plan.devices[index])
        )
      );
    }

    const opened: OpenedNight = {
      bots: [],
      clients: [],
      journal: timeline(),
      openedAt,
      passes,
      plan,
    };

    return opened;
  });

export const playNight = (base: string, opened: OpenedNight) =>
  Effect.gen(function* playNightOut() {
    const { clients, plan } = opened;
    const { note } = opened.journal;
    const started = wallClock();

    const control: NightControl = {
      closing: false,
      door: Option.none(),
      head: 0,
      intruders: new Map(),
      quiet: new Set(),
      regulars: new Map(),
      ruleChanges: plan.ruleChanges,
      rulesApplied: 0,
      seats: plan.players + plan.lateJoiners,
      silences: plan.silences,
      silencesTaken: 0,
      stop: false,
    };

    const records = opened.bots;
    const watched: Watched[] = [];
    const closers: Effect.Effect<void>[] = [];

    const fail = (problem: string) =>
      new NightFailed({ code: plan.code, problem, seed: plan.seed });

    const launch = (pass: RoomPass, index: number) => {
      const role: Role =
        index < plan.players || index >= plan.players + plan.spectators
          ? "Player"
          : "Spectator";

      const setup = {
        base,
        control,
        index,
        pass,
        random: randomSource(plan.seed * 31 + index * 7919 + 1),
        role,
        temper: plan.temper,
      };

      if (plan.clients.includes(index)) {
        const bot = startClientBot({ ...setup, chaos: plan.chaos });

        clients.push(bot.record);
        watched.push(bot.record);

        return bot.loop;
      }

      const bot = startBot(setup);

      records.push(bot.record);
      watched.push(bot.record);
      closers.push(bot.closeAll);

      return bot.loop;
    };

    const freshest = () =>
      watched
        .filter((record) => Option.isSome(record.latest()))
        .toSorted((left, right) => right.lastSeq() - left.lastSeq())
        .at(0)
        ?.latest() ?? Option.none<RoomView>();

    const handsNow = () =>
      Option.match(freshest(), { onNone: () => 0, onSome: handsSeen });

    let lateJoined = 0;

    const lateJoiner = (index: number, atHand: number) =>
      Effect.gen(function* joinLate() {
        while (handsNow() < atHand && !control.closing && !control.stop) {
          yield* Effect.sleep(Duration.millis(100));
        }

        if (control.stop) {
          return;
        }

        const pass = yield* joinPokerRoom(
          base,
          plan.code,
          {
            avatar: "late",
            name: `bot${index}`,
          },
          Option.fromUndefinedOr(plan.devices[index])
        );

        lateJoined += 1;

        yield* launch(pass, index);
      });

    let restarts = 0;
    let voteRestarts = 0;

    let closedAt = Option.none<number>();

    const nightOver = (now: number) => {
      const sawClose = watched.filter((record) =>
        record.latest().pipe(Option.exists(RoomViews.$is("Closed")))
      ).length;

      if (sawClose > 0 && Option.isNone(closedAt)) {
        note(`${sawClose} of ${watched.length} bots saw the room closed`);
        closedAt = Option.some(now);
      }

      return (
        (watched.length > 0 && sawClose === watched.length) ||
        closedAt.pipe(Option.exists((at) => now - at > CLOSE_GRACE_MS))
      );
    };

    const unsettledClients = () =>
      clients.flatMap((client) =>
        Option.toArray(client.unsettled()).map(
          (why) => `${client.label} ${why}`
        )
      );

    let handsReached = 0;

    const troubleAt = (now: number, hands: number) => {
      const reported = clients.flatMap((client) => client.problems).at(0);

      handsReached = Math.max(handsReached, hands);

      if (reported !== undefined) {
        return Option.some(`a client bot failed: ${reported}`);
      }

      const unsettled = control.closing
        ? `, and these client bots were not yet live with nothing pending: ${unsettledClients().join("; ") || "none"}`
        : "";

      return now - started > plan.limitMs
        ? Option.some(
            `the night reached ${handsReached} of ${plan.hands} hands in ${plan.limitMs} ms${unsettled}`
          )
        : Option.none();
    };

    let halting = false;
    let settlingSince = Option.none<number>();
    let endingSince = Option.none<number>();
    let jammed = false;

    const timeToClose = (open: OpenView, now: number) =>
      Effect.gen(function* decideClosing() {
        const since = Option.getOrElse(endingSince, () => now);

        endingSince = Option.some(since);

        if (plan.ending === "MidHand") {
          return Option.isSome(open.hand) || now - since > MID_HAND_WAIT_MS
            ? Option.some(
                Option.isSome(open.hand) ? "mid-hand" : "a hand that never came"
              )
            : Option.none();
        }

        if (plan.ending === "AsItComes") {
          return Option.some("as it comes");
        }

        if (plan.ending === "Halted") {
          return Option.isSome(open.hand)
            ? Option.some("halting mid-hand")
            : Option.none();
        }

        if (!jammed) {
          note("jamming the room's deals so it stalls");
          yield* jamRoom(base, plan.code, true);
          jammed = true;
        }

        return Option.isSome(open.stalled)
          ? Option.some("stalled")
          : Option.none();
      });

    const settle = (now: number): Option.Option<string> => {
      const unsettled = unsettledClients();

      if (unsettled.length === 0) {
        note("every client bot is live with nothing pending; the night stops");
        control.stop = true;

        return Option.none();
      }

      if (Option.isNone(settlingSince)) {
        note(`waiting for client bots to settle: ${unsettled.join("; ")}`);
        settlingSince = Option.some(now);
      }

      return settlingSince.pipe(
        Option.filter((since) => now - since > SETTLE_LIMIT_MS),
        Option.map(
          () =>
            `the room closed, but ${SETTLE_LIMIT_MS} ms later these client bots were still not live with nothing pending: ${unsettled.join("; ")}`
        )
      );
    };

    const supervise = Effect.gen(function* superviseNight() {
      let progress = wallClock();
      let problem = Option.none<string>();

      while (!control.stop && Option.isNone(problem)) {
        yield* Effect.sleep(Duration.millis(30));

        const now = wallClock();
        const view = freshest();
        const hands = handsNow();

        control.head = Math.max(
          control.head,
          ...watched.map((record) => record.lastSeq())
        );

        if (nightOver(now)) {
          problem = settle(now);

          continue;
        }

        problem = troubleAt(now, hands);

        if (Option.isSome(problem)) {
          continue;
        }

        const open = view.pipe(Option.filter(RoomViews.$is("Open")));

        if (Option.isNone(open)) {
          continue;
        }

        if (hands >= plan.hands && !control.closing) {
          const reason = yield* timeToClose(open.value, now);

          if (Option.isSome(reason) && plan.ending === "Halted") {
            note(`stopping every bot after ${hands} hands to halt the room`);
            halting = true;
            control.stop = true;

            continue;
          }

          if (Option.isSome(reason)) {
            note(`closing after ${hands} hands, ${reason.value}`);
            control.closing = true;
          } else if (
            jammed &&
            endingSince.pipe(
              Option.exists((since) => now - since > STALL_LIMIT_MS)
            )
          ) {
            problem = Option.some(
              `the jammed room was not marked stalled within ${STALL_LIMIT_MS} ms`
            );

            continue;
          }
        }

        if (jammed) {
          progress = now;
        }

        const moment = control.closing
          ? Option.none<RestartMoment>()
          : restartMoment(
              open.value,
              hands,
              plan.restartHands[restarts],
              voteRestarts < plan.voteRestarts
            );

        if (Option.isSome(moment)) {
          restarts += moment.value === "mid-vote" ? 0 : 1;
          voteRestarts += moment.value === "mid-vote" ? 1 : 0;
          note(`restart ${moment.value}`);
          yield* restart(base, plan.code);
          progress = wallClock();

          continue;
        }

        const lastEvent = Math.max(
          ...watched.map((record) => record.lastTableAt())
        );

        progress = shouldAdvance(open.value)
          ? Math.max(progress, lastEvent)
          : now;

        if (now - progress > longestClockMs(open.value) + WATCHDOG_MARGIN_MS) {
          problem = Option.some(
            `no table event arrived for ${Math.round(now - progress)} ms with a running game at hand ${hands}`
          );
        }
      }

      return yield* Option.match(problem, {
        onNone: () => Effect.void,
        onSome: (text) => {
          note(`failed: ${text}`);

          return Effect.fail(fail(text));
        },
      });
    });

    const loops = opened.passes.map((pass, index) => launch(pass, index));

    let intruder = Option.none<IntruderRecord>();
    let regular = Option.none<RegularRecord>();

    const regularPlays = Option.match(plan.regularAtHand, {
      onNone: () => Effect.void,
      onSome: (atHand) =>
        joinRegular(base, plan.code).pipe(
          Effect.flatMap((pass) =>
            playRegular(base, pass, control, atHand, control.seats, note)
          ),
          Effect.tap((record) =>
            Effect.sync(() => {
              regular = Option.some(record);
            })
          )
        ),
    });

    const intruding = Option.match(plan.intruderAtHand, {
      onNone: () => Effect.void,
      onSome: (atHand) =>
        Effect.gen(function* letAStrangerIn() {
          while (
            (handsNow() < atHand || lateJoined < plan.lateJoiners) &&
            !control.closing &&
            !control.stop
          ) {
            yield* Effect.sleep(Duration.millis(100));
          }

          if (control.closing || control.stop) {
            return;
          }

          const lockedFor = (locked: boolean) =>
            Effect.gen(function* doorAt() {
              control.door = Option.some(locked);

              const since = wallClock();

              while (
                !freshest().pipe(
                  Option.exists(
                    (view) =>
                      RoomViews.$is("Open")(view) &&
                      view.settings.locked === locked
                  )
                ) &&
                wallClock() - since < DOOR_WAIT_MS &&
                !control.stop
              ) {
                yield* Effect.sleep(Duration.millis(100));
              }
            });

          yield* lockedFor(true);
          note("the host locked the room; a stranger knocks");

          const knocked = yield* knockAt(base, plan.code);

          yield* lockedFor(false);
          control.door = Option.none();
          note("the host unlocked the room; the stranger joins");

          const pass = yield* joinIntruder(base, plan.code);

          const record = yield* intrude(
            base,
            pass,
            control,
            () => handsNow() + 1,
            note,
            plan.intruderSits
          );

          intruder = Option.some({ ...record, knocked });
        }),
    });

    const late = Array.from({ length: plan.lateJoiners }, (_, offset) =>
      lateJoiner(
        plan.players + plan.spectators + offset,
        Math.max(1, Math.floor(plan.hands / 3))
      )
    );

    yield* Effect.all([supervise, intruding, regularPlays, ...loops, ...late], {
      concurrency: "unbounded",
    }).pipe(
      Effect.ensuring(
        Effect.all(closers, { discard: true }).pipe(Effect.ignore)
      )
    );

    const halt = halting
      ? Option.some(
          yield* haltMidHand(
            base,
            plan.code,
            opened.passes,
            randomSource(plan.seed * 17 + 3).between,
            note
          )
        )
      : Option.none<HaltEvidence>();

    const halted = yield* inspect(base, plan.code);

    const inspection = Option.match(halt, {
      onNone: () => halted,
      onSome: ({ lost }) => ({
        ...halted,
        events: halted.events.toSpliced(lost.seq - 1, 0, lost.event),
        seqs: halted.seqs.toSpliced(lost.seq - 1, 0, lost.seq),
      }),
    });

    const points = yield* roomAnalytics(base, plan.code);
    const hashes = yield* hashesOf(plan.devices);

    const played: PlayedNight = {
      analytics: {
        hashes,
        points,
        secrets: [
          plan.code,
          ...plan.devices,
          ...plan.devices.map((_, index) => `bot${index}`),
          INTRUDER_NAME,
          KNOCKER_NAME,
          REGULAR_NAME,
        ],
      },
      durationMs: wallClock() - started,
      events: inspection.events,
      evidence: {
        bots: records,
        checked: plan.settings.shuffle === "Checked",
        clients,
        code: plan.code,
        ending: plan.ending,
        events: inspection.events,
        halt,
        halted: inspection.halted,
        memoryMatchesLog: inspection.memoryMatchesLog,
        refusedAlarms: refusedAlarms(inspection),
        restarts,
        seed: plan.seed,
        seqs: inspection.seqs,
        voteRestarts,
      },
      intruder,
      plan,
      regular,
    };

    return played;
  });

const decodedIn = (arrivals: readonly Arrival[]) =>
  arrivals.filter(
    (arrival) => arrival instanceof HeldArrival && arrival.decoded
  ).length;

export const keptDecoded = (
  bots: readonly BotRecord[],
  clients: readonly ClientBotRecord[]
): readonly string[] => [
  ...bots.flatMap((bot) =>
    bot.devices.flatMap((device) =>
      device.sockets.flatMap(({ socket }) => {
        const kept = decodedIn(socket.arrivals);
        const closed = Option.isSome(socket.closed());
        const most = closed ? 0 : KEPT_DECODED;

        return kept > most
          ? [
              `the harness kept ${kept} decoded frames of ${socket.label}, which ${closed ? "had closed" : "was open"}, where ${most} is the most`,
            ]
          : [];
      })
    )
  ),
  ...clients.flatMap((client) => {
    const kept = decodedIn(client.arrivals());

    return kept > KEPT_DECODED
      ? [
          `the harness kept ${kept} decoded frames of ${client.label}, where ${KEPT_DECODED} is the most`,
        ]
      : [];
  }),
];

export const judgeNight = (played: PlayedNight): NightResult => {
  const checkedAt = wallClock();
  const checked = checkNight(played.evidence);

  const verdict = {
    ...checked,
    problems: [
      ...checked.problems,
      ...checkAnalytics(played.events, played.analytics),
      ...keptDecoded(played.evidence.bots, played.evidence.clients),
      ...Option.match(played.regular, {
        onNone: () => [],
        onSome: (record) =>
          regularProblems(
            record,
            played.events.map((text) => pokerCodec.decodeEvent(text))
          ),
      }),
      ...Option.match(played.intruder, {
        onNone: () => [],
        onSome: (record) =>
          intruderProblems(
            record,
            played.events.map((text) => pokerCodec.decodeEvent(text))
          ),
      }),
    ],
  };

  return {
    checkMs: wallClock() - checkedAt,
    checkedAt,
    durationMs: played.durationMs,
    events: played.events,
    plan: played.plan,
    points: played.analytics.points,
    verdict,
  };
};
