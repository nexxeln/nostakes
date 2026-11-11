import {
  Activities,
  ANSWER_LIMIT_MS,
  BACKOFF_CAP_MS,
  OVERDUE_GRACE_MS,
} from "@nostakes/client";
import { Antes, Events, Seats, ShowdownEntries } from "@nostakes/engine";
import type { Card, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { MAX_MISSED_EVENTS } from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import {
  Audiences,
  RoomEventSchema,
  RoomViewSchema,
  SeenEventSchema,
  RoomEvents,
  RoomStates,
  RoomSignalSchema,
  RoomViews,
  audienceOf,
  chipsOnTable,
  decide,
  evolve,
  redact,
  replay,
  viewFor,
} from "@nostakes/room";
import type {
  RoomEvent,
  RoomSignal,
  RoomState,
  RoomView,
} from "@nostakes/room";
import { sha256 } from "@nostakes/shuffle";
import { Option, Predicate, Result, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

import { pokerRoom } from "../../src/poker-room.js";
import type { MemberCommand } from "../../src/poker-room.js";
import type { BotRecord, SocketRecord } from "./bot.js";
import { NO_BOUNTY_WATCH, neverPaid, watchedBounty } from "./bounty-checks.js";
import type { BountyWatch } from "./bounty-checks.js";
import type { ClientBotRecord } from "./client-bot.js";
import {
  addFairness,
  emptyFairness,
  judgeDevice,
  sealKeyOf,
  stretchesFrom,
  stretchFold,
  waitBeyondPause,
} from "./fair-checks.js";
import type { FairnessCounts, Proof, Stretch } from "./fair-checks.js";
import {
  haltedViewOf,
  ledgerFromLog,
  standingsProblems,
  unfinishedHand,
} from "./halted-standings.js";
import { decodeServerFrame, pokerCodec, wallClock } from "./poker-socket.js";
import type { Arrival } from "./poker-socket.js";
import { describeSignal } from "./signal-plan.js";
import { beaconDown } from "./test-beacon.js";

const eventCodec = Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema));

const decodeEvent = Schema.decodeSync(eventCodec);

const encodeEvent = Schema.encodeSync(eventCodec);

const seenCodec = Schema.fromJsonString(Schema.toCodecJson(SeenEventSchema));

const viewCodec = Schema.fromJsonString(Schema.toCodecJson(RoomViewSchema));

const encodeSeen = Schema.encodeSync(seenCodec);

const encodeView = Schema.encodeSync(viewCodec);

const encodeSeenResult = Schema.encodeResult(seenCodec);

const encodeViewResult = Schema.encodeResult(viewCodec);

const textOf = (encoded: Result.Result<string, Schema.SchemaError>) =>
  Result.getOrElse(encoded, (failure) => `unencodable: ${failure.message}`);

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const utf8 = new TextEncoder();

const digestOf = (text: string): string =>
  Hex.encode(sha256(utf8.encode(text)));

const { guards } = pokerCodec.server;

export const CLOCK_TOLERANCE_MS = 50;

export const DEAF_REPLY_MARGIN_MS = 5000;

export const DEAF_REPLY_BOUND_MS =
  ANSWER_LIMIT_MS * 2 +
  OVERDUE_GRACE_MS +
  BACKOFF_CAP_MS +
  DEAF_REPLY_MARGIN_MS;

export const COUNT_NAMES = [
  "antePosts",
  "approvals",
  "bankStarts",
  "bigBlindAnteHands",
  "bombPots",
  "bombPotsCalled",
  "bounties",
  "catchUps",
  "catchUpsSkipped",
  "clientBots",
  "clientCommands",
  "clientCommandsTraced",
  "clientDeafAtClose",
  "clientDeafCommands",
  "clientDropsBlackHole",
  "clientDropsBotClose",
  "clientDropsDeafSilence",
  "clientDropsDeafUnanswered",
  "clientDropsRestart",
  "clientDropsSilenceLimit",
  "clientDropsUnansweredOnClearLine",
  "clientDropsUnexplained",
  "clientEchoes",
  "clientEventsChecked",
  "clientFailedAttempts",
  "clientIssuedBeforeDrop",
  "clientNaps",
  "clientResent",
  "clientSignalsHeard",
  "clientSignalsKeptOnDevice",
  "clientSignalsSent",
  "clientSkippedRanges",
  "clientUnexpectedRefusals",
  "clientViewsChecked",
  "clientWakes",
  "closeQueued",
  "commands",
  "denials",
  "drops",
  "duplicates",
  "duplicatesConfirmed",
  "endedAfterHand",
  "endedBetweenHands",
  "endedHalted",
  "endedStalled",
  "events",
  "everyPlayerAnteHands",
  "framesChecked",
  "hands",
  "handsCancelled",
  "handsWithApproval",
  "handsWithoutApproval",
  "illegal",
  "illegalMucks",
  "lateShowdownChoices",
  "multiRunHands",
  "noAnteHands",
  "peekDeliveries",
  "peeksWithoutCards",
  "protocolViolations",
  "quietPauses",
  "quietResumes",
  "rabbitHunts",
  "reactionDeliveries",
  "reconnects",
  "rejected",
  "replyTimeouts",
  "resent",
  "restarts",
  "rulesQueued",
  "runChoices",
  "secondDevices",
  "settingsChanged",
  "showdownMucks",
  "showdownTables",
  "shows",
  "signalDeliveries",
  "signalsSent",
  "silences",
  "straddles",
  "tablesUnattended",
  "timeouts",
  "transfers",
  "unclockedVotesTimedOut",
  "unshownWinners",
  "viewsChecked",
  "voteRestarts",
  "welcomeClockChecks",
] as const;

export type CountName = (typeof COUNT_NAMES)[number];

export type NightCounts = Record<CountName, number>;

export const emptyCounts = (): NightCounts => ({
  antePosts: 0,
  approvals: 0,
  bankStarts: 0,
  bigBlindAnteHands: 0,
  bombPots: 0,
  bombPotsCalled: 0,
  bounties: 0,
  catchUps: 0,
  catchUpsSkipped: 0,
  clientBots: 0,
  clientCommands: 0,
  clientCommandsTraced: 0,
  clientDeafAtClose: 0,
  clientDeafCommands: 0,
  clientDropsBlackHole: 0,
  clientDropsBotClose: 0,
  clientDropsDeafSilence: 0,
  clientDropsDeafUnanswered: 0,
  clientDropsRestart: 0,
  clientDropsSilenceLimit: 0,
  clientDropsUnansweredOnClearLine: 0,
  clientDropsUnexplained: 0,
  clientEchoes: 0,
  clientEventsChecked: 0,
  clientFailedAttempts: 0,
  clientIssuedBeforeDrop: 0,
  clientNaps: 0,
  clientResent: 0,
  clientSignalsHeard: 0,
  clientSignalsKeptOnDevice: 0,
  clientSignalsSent: 0,
  clientSkippedRanges: 0,
  clientUnexpectedRefusals: 0,
  clientViewsChecked: 0,
  clientWakes: 0,
  closeQueued: 0,
  commands: 0,
  denials: 0,
  drops: 0,
  duplicates: 0,
  duplicatesConfirmed: 0,
  endedAfterHand: 0,
  endedBetweenHands: 0,
  endedHalted: 0,
  endedStalled: 0,
  events: 0,
  everyPlayerAnteHands: 0,
  framesChecked: 0,
  hands: 0,
  handsCancelled: 0,
  handsWithApproval: 0,
  handsWithoutApproval: 0,
  illegal: 0,
  illegalMucks: 0,
  lateShowdownChoices: 0,
  multiRunHands: 0,
  noAnteHands: 0,
  peekDeliveries: 0,
  peeksWithoutCards: 0,
  protocolViolations: 0,
  quietPauses: 0,
  quietResumes: 0,
  rabbitHunts: 0,
  reactionDeliveries: 0,
  reconnects: 0,
  rejected: 0,
  replyTimeouts: 0,
  resent: 0,
  restarts: 0,
  rulesQueued: 0,
  runChoices: 0,
  secondDevices: 0,
  settingsChanged: 0,
  showdownMucks: 0,
  showdownTables: 0,
  shows: 0,
  signalDeliveries: 0,
  signalsSent: 0,
  silences: 0,
  straddles: 0,
  tablesUnattended: 0,
  timeouts: 0,
  transfers: 0,
  unclockedVotesTimedOut: 0,
  unshownWinners: 0,
  viewsChecked: 0,
  voteRestarts: 0,
  welcomeClockChecks: 0,
});

export type NightEnding = "AsItComes" | "MidHand" | "Stalled" | "Halted";

export interface HaltStandings {
  readonly label: string;
  readonly status: number;
  readonly view: Option.Option<Schema.Json>;
}

export interface HaltEvidence {
  readonly lost: { readonly seq: number; readonly event: string };
  readonly soundSeq: number;
  readonly standings: readonly HaltStandings[];
}

export interface NightEvidence {
  readonly checked: boolean;
  readonly ending: NightEnding;
  readonly seed: number;
  readonly code: RoomCode;
  readonly events: readonly string[];
  readonly seqs: readonly number[];
  readonly halted: Option.Option<string>;
  readonly halt: Option.Option<HaltEvidence>;
  readonly refusedAlarms: number;
  readonly memoryMatchesLog: boolean;
  readonly bots: readonly BotRecord[];
  readonly clients: readonly ClientBotRecord[];
  readonly restarts: number;
  readonly voteRestarts: number;
}

export interface NightVerdict {
  readonly problems: readonly string[];
  readonly counts: NightCounts;
  readonly fairness: FairnessCounts;
  readonly proofs: readonly Proof[];
  readonly deafReplyMs: readonly number[];
  readonly transfers: readonly number[];
  readonly replayMs: number;
  readonly views: number;
  readonly viewMs: number;
}

interface Seen {
  readonly player: PlayerId;
  readonly where: string;
  readonly cards: readonly number[];
  readonly digest: string;
  readonly text: () => string;
}

interface WelcomeSeen {
  readonly player: PlayerId;
  readonly view: RoomView;
  readonly cards: readonly number[];
  readonly helloAt: number;
  readonly arrivedAt: number;
  readonly where: string;
}

interface Final {
  readonly player: PlayerId;
  readonly view: RoomView;
}

interface ClientView {
  readonly player: PlayerId;
  readonly view: RoomView;
  readonly where: string;
}

interface Trace {
  readonly player: PlayerId;
  readonly command: MemberCommand;
  readonly id: string;
  readonly to: number;
  readonly where: string;
}

interface SignalSeen {
  readonly from: PlayerId;
  readonly signal: RoomSignal;
  readonly where: string;
}

interface Received {
  readonly signals: Map<number, SignalSeen[]>;
  readonly events: Map<number, Seen[]>;
  readonly views: Map<number, Seen[]>;
  readonly welcomes: Map<number, WelcomeSeen[]>;
  readonly clientViews: Map<number, ClientView[]>;
  readonly traces: Trace[];
  readonly finals: Final[];
  readonly stretches: Map<string, readonly Stretch[]>;
}

interface Knowledge {
  readonly shown: Set<number>;
  readonly holes: Map<
    SeatIndex,
    { readonly cards: readonly Card[]; readonly player: PlayerId }
  >;
}

interface Ledger {
  bounty: BountyWatch;
  quiet: boolean;
  lastTag: RoomEvent["_tag"];
  bought: number;
  cashed: number;
  deadline: number;
  runDeadline: Option.Option<number>;
  showdownDeadline: Option.Option<number>;
  showdown: Option.Option<Set<SeatIndex>>;
  viewMs: number;
  views: number;
  known: Knowledge;
  readonly net: Map<PlayerId, number>;
  readonly decks: Set<string>;
}

interface Checker {
  readonly code: RoomCode;
  readonly counts: NightCounts;
  readonly problems: string[];
}

const report = (checker: Checker, problem: string) => {
  if (checker.problems.length < 40) {
    checker.problems.push(`${checker.code}: ${problem}`);
  }
};

const pushTo = <A>(index: Map<number, A[]>, seq: number, item: A) => {
  const list = index.get(seq) ?? [];

  list.push(item);
  index.set(seq, list);
};

const CARD_KEYS = new Set([
  "board",
  "boards",
  "card",
  "cards",
  "deck",
  "decks",
  "holeCards",
  "rabbit",
  "shown",
  "undealt",
  "yourCards",
]);

const SPARE_DECK_KEY = "spare";

const NIGHT_RECAP_KEY = "recap";

const UNSCANNED = new Set([SPARE_DECK_KEY, NIGHT_RECAP_KEY]);

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

const fieldOf = (json: Schema.Json, key: string): Schema.Json =>
  isJsonObject(json) ? (json[key] ?? null) : null;

const itemsOf = (json: Schema.Json): readonly Schema.Json[] =>
  isJsonArray(json) ? json : [];

const cardsIn = (value: Schema.Json, holding: boolean): readonly number[] => {
  if (Predicate.isNumber(value)) {
    return holding ? [value] : [];
  }

  if (isJsonArray(value)) {
    return value.flatMap((item) => cardsIn(item, holding));
  }

  return isJsonObject(value)
    ? Object.entries(value).flatMap(([key, item]) =>
        UNSCANNED.has(key) ? [] : cardsIn(item, CARD_KEYS.has(key))
      )
    : [];
};

const publicCards = (event: Event): readonly Card[] => {
  if (
    Events.$is("StreetDealt")(event) ||
    Events.$is("CardsShown")(event) ||
    Events.$is("HandTabled")(event) ||
    Events.$is("RabbitHunted")(event)
  ) {
    return event.cards;
  }

  if (Events.$is("HandsTabled")(event)) {
    return event.hands.flatMap((hand) => hand.cards);
  }

  return Events.$is("ShowdownReached")(event)
    ? event.order.flatMap((entry) =>
        ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
      )
    : [];
};

const occupantOf = (state: RoomState, seat: SeatIndex) =>
  RoomStates.$is("Open")(state)
    ? Option.fromUndefinedOr(state.table.seats[seat]).pipe(
        Option.filter(Seats.$is("Occupied")),
        Option.map((occupied) => occupied.player)
      )
    : Option.none();

const allowedFor = (known: Knowledge, state: RoomState, player: PlayerId) => {
  const audience = audienceOf(state, player);

  if (!Audiences.$is("Seated")(audience)) {
    return known.shown;
  }

  const own = known.holes.get(audience.seat);

  return own === undefined || own.player !== player
    ? known.shown
    : new Set([...known.shown, ...own.cards]);
};

const deadlineOf = (state: RoomState) =>
  RoomStates.$is("Open")(state)
    ? state.clocks.decision.pipe(Option.map((clock) => clock.deadline))
    : Option.none();

const remainingShown = (view: RoomView) =>
  RoomViews.$is("Open")(view)
    ? view.clocks.turn.pipe(
        Option.map(({ remainingMs }) => remainingMs),
        Option.orElse(() =>
          view.clocks.runChoice.pipe(
            Option.map(({ remainingMs }) => remainingMs)
          )
        )
      )
    : Option.none();

const stacksOf = (view: RoomView) =>
  RoomViews.$is("Open")(view) && Option.isNone(view.hand)
    ? Option.some(
        view.seats.reduce(
          (total, { occupant }) =>
            total +
            occupant.pipe(
              Option.match({ onNone: () => 0, onSome: ({ stack }) => stack })
            ),
          0
        )
      )
    : Option.none();

const addBotStats = (checker: Checker, bot: BotRecord) => {
  const { counts } = checker;
  const { stats } = bot;

  counts.commands += stats.commands;
  counts.rejected += stats.rejected;
  counts.illegal += stats.illegal;
  counts.illegalMucks += stats.illegalMucks;
  counts.duplicates += stats.duplicates;
  counts.resent += stats.resent;
  counts.reconnects += stats.reconnects;
  counts.drops += stats.drops;
  counts.secondDevices += stats.secondDevices;
  counts.silences += stats.silences;
  counts.protocolViolations += stats.protocolViolations;
  counts.replyTimeouts += stats.replyTimeouts;
  counts.signalsSent += stats.signals.sent;
  counts.peeksWithoutCards += stats.signals.peeksWithoutCards;

  if (stats.replyTimeouts > 0) {
    report(
      checker,
      `${bot.label} waited 8 seconds for ${stats.replyTimeouts} replies on a live socket`
    );
  }
};

interface Lineage {
  next: Option.Option<number>;
  welcomed: boolean;
}

const batchEventText = (arrival: Arrival, offset: number) => {
  const { message } = arrival;

  return guards.Events(message)
    ? Option.match(Option.fromUndefinedOr(message.events[offset]), {
        onNone: () => "nothing",
        onSome: (event) => textOf(encodeSeenResult(event)),
      })
    : "nothing";
};

const batchViewText = (arrival: Arrival) => {
  const { message } = arrival;

  return guards.Events(message)
    ? textOf(encodeViewResult(message.view))
    : "nothing";
};

const missedText = (arrival: Arrival, offset: number) => {
  const { message } = arrival;

  if (
    !guards.Welcome(message) ||
    !pokerCodec.catchUp.guards.Missed(message.catchUp)
  ) {
    return "nothing";
  }

  return Option.match(Option.fromUndefinedOr(message.catchUp.events[offset]), {
    onNone: () => "nothing",
    onSome: (event) => textOf(encodeSeenResult(event)),
  });
};

const welcomeArrived = (
  checker: Checker,
  received: Received,
  where: string,
  record: SocketRecord,
  lineage: Lineage,
  player: PlayerId,
  arrival: Arrival,
  held: Arrival
) => {
  const { message } = arrival;

  if (!guards.Welcome(message)) {
    return;
  }

  const after = Option.getOrElse(record.after, () => -1);
  const raw = decodeJson(arrival.text);
  const rawCatchUp = fieldOf(raw, "catchUp");

  lineage.welcomed = true;

  pokerCodec.catchUp.match(message.catchUp, {
    Missed: ({ events, from }) => {
      checker.counts.catchUps += 1;

      if (
        from !== after + 1 ||
        lineage.next.pipe(Option.exists((expected) => expected !== from))
      ) {
        report(
          checker,
          `${where} caught up from ${from}, not after its last event`
        );
      }

      if (from + events.length - 1 !== message.seq) {
        report(
          checker,
          `${where} caught up to ${from + events.length - 1}, not to the head at ${message.seq}`
        );
      }

      const rawMissed = itemsOf(fieldOf(rawCatchUp, "events"));

      for (const [offset, event] of events.entries()) {
        pushTo(received.events, from + offset, {
          cards: cardsIn(rawMissed[offset] ?? null, false),
          digest: digestOf(textOf(encodeSeenResult(event))),
          player,
          text: () => missedText(held, offset),
          where,
        });
      }
    },
    Skipped: ({ from, to }) => {
      checker.counts.catchUpsSkipped += 1;

      if (from !== after + 1 || to !== message.seq) {
        report(
          checker,
          `${where} was told it skipped ${from}..${to} after ${after}, with the head at ${message.seq}`
        );
      }

      if (to - after <= MAX_MISSED_EVENTS) {
        report(
          checker,
          `${where} skipped ${to - after} events that the server could have replayed`
        );
      }
    },
    UpToDate: () => {
      if (Option.isSome(record.after) && message.seq !== after) {
        report(
          checker,
          `${where} missed ${message.seq - after} events and was told it was up to date`
        );
      }
    },
  });

  pushTo(received.welcomes, message.seq, {
    arrivedAt: arrival.at,
    cards: cardsIn(fieldOf(raw, "view"), false),
    helloAt: record.helloAt,
    player,
    view: message.view,
    where,
  });
  lineage.next = Option.some(message.seq + 1);
};

const eventsArrived = (
  checker: Checker,
  received: Received,
  where: string,
  lineage: Lineage,
  player: PlayerId,
  arrival: Arrival,
  held: Arrival
) => {
  const { message } = arrival;

  if (!guards.Events(message)) {
    return;
  }

  if (!lineage.welcomed) {
    report(checker, `${where} got events before its welcome`);
  }

  if (
    lineage.next.pipe(Option.exists((expected) => expected !== message.from))
  ) {
    report(
      checker,
      `${where} got events from ${message.from} while expecting ${Option.getOrElse(lineage.next, () => 0)}`
    );
  }

  if (message.to - message.from + 1 !== message.events.length) {
    report(
      checker,
      `${where} got ${message.events.length} events for ${message.from}..${message.to}`
    );
  }

  const raw = decodeJson(arrival.text);
  const rawEvents = itemsOf(fieldOf(raw, "events"));

  for (const [offset, event] of message.events.entries()) {
    pushTo(received.events, message.from + offset, {
      cards: cardsIn(rawEvents[offset] ?? null, false),
      digest: digestOf(textOf(encodeSeenResult(event))),
      player,
      text: () => batchEventText(held, offset),
      where,
    });
  }

  pushTo(received.views, message.to, {
    cards: cardsIn(fieldOf(raw, "view"), false),
    digest: digestOf(textOf(encodeViewResult(message.view))),
    player,
    text: () => batchViewText(held),
    where,
  });
  lineage.next = Option.some(message.to + 1);
};

const signalArrived = (
  checker: Checker,
  received: Received,
  where: string,
  lineage: Lineage,
  arrival: Arrival
) => {
  const { message } = arrival;

  if (!guards.Signal(message)) {
    return;
  }

  if (!lineage.welcomed) {
    report(checker, `${where} got a signal before its welcome`);
  }

  pushTo(received.signals, Option.getOrElse(lineage.next, () => 1) - 1, {
    from: message.from,
    signal: message.signal,
    where,
  });
};

const viewOf = (arrival: Arrival) => {
  const { message } = arrival;

  if (guards.Welcome(message) || guards.Events(message)) {
    return Option.some({ at: arrival.at, view: message.view });
  }

  return Option.none();
};

const indexBot = (checker: Checker, received: Received, bot: BotRecord) => {
  const { player } = bot.pass;
  const replies = new Map<string, string[]>();
  let latest = Option.none<{ readonly at: number; readonly view: RoomView }>();

  addBotStats(checker, bot);

  for (const device of bot.devices) {
    const lineage: Lineage = { next: Option.none(), welcomed: false };
    const fold = stretchFold();

    for (const [index, record] of device.sockets.entries()) {
      const where = `${bot.label} ${device.name} #${index + 1}`;

      lineage.welcomed = false;

      for (const problem of record.socket.problems) {
        report(checker, problem);
      }

      for (const held of record.socket.arrivals) {
        const arrival: Arrival = {
          at: held.at,
          message: held.message,
          text: held.text,
        };

        checker.counts.framesChecked += 1;
        fold.add(arrival);

        if (arrival.text.includes('"deck"')) {
          report(checker, `${where} received a frame with a deck`);
        }

        welcomeArrived(
          checker,
          received,
          where,
          record,
          lineage,
          player,
          arrival,
          held
        );
        eventsArrived(checker, received, where, lineage, player, arrival, held);
        signalArrived(checker, received, where, lineage, arrival);

        for (const seen of Option.toArray(viewOf(arrival))) {
          latest = latest.pipe(Option.exists(({ at }) => at > seen.at))
            ? latest
            : Option.some(seen);
        }

        if (guards.Reply(arrival.message)) {
          const list = replies.get(arrival.message.id) ?? [];

          list.push(pokerCodec.encodeReply(arrival.message.result));
          replies.set(arrival.message.id, list);
        }
      }
    }

    if (device.sockets.length > 0) {
      received.stretches.set(`${bot.label} ${device.name}`, fold.stretches());
    }
  }

  for (const [id, times] of bot.sent) {
    const texts = replies.get(id) ?? [];

    if (new Set(texts).size > 1) {
      report(
        checker,
        `${bot.label} got different replies to ${id}: ${texts.join(" / ")}`
      );
    }

    checker.counts.duplicatesConfirmed += times > 1 && texts.length > 1 ? 1 : 0;
  }

  Option.match(latest, {
    onNone: () => {
      report(checker, `${bot.label} never saw the room`);
    },
    onSome: ({ view }) => {
      received.finals.push({ player, view });
    },
  });
};

const addClientStats = (checker: Checker, client: ClientBotRecord) => {
  const { counts } = checker;
  const { stats } = client;

  counts.clientBots += 1;
  counts.clientDeafAtClose += stats.deafAtClose;
  counts.clientDeafCommands += client.commands.filter(
    ({ issuedOnDeafLine }) => issuedOnDeafLine
  ).length;
  counts.clientCommands += stats.commands;
  counts.clientIssuedBeforeDrop += stats.issuedBeforeDrop;
  counts.clientResent += stats.resent;
  counts.clientDropsBotClose += stats.dropsBotClose;
  counts.clientDropsRestart += stats.dropsRestart;
  counts.clientDropsSilenceLimit += stats.dropsSilenceLimit;
  counts.clientDropsBlackHole += stats.dropsBlackHole;
  counts.clientDropsDeafSilence += stats.dropsDeafSilence;
  counts.clientDropsDeafUnanswered += stats.dropsDeafUnanswered;
  counts.clientDropsUnansweredOnClearLine += stats.dropsUnansweredOnClearLine;
  counts.clientDropsUnexplained += stats.dropsUnexplained;
  counts.clientFailedAttempts += stats.failedAttempts;
  counts.clientWakes += stats.wakes;
  counts.clientSkippedRanges += stats.skippedRanges;
  counts.clientUnexpectedRefusals += stats.unexpectedRefusals;
  counts.clientEchoes += stats.echoes;
  counts.clientNaps += stats.naps;
  counts.clientSignalsSent += stats.signalsSent;
  counts.clientSignalsKeptOnDevice += stats.signalsKeptOnDevice;
  counts.clientSignalsHeard += stats.signalsHeard;
  counts.commands += stats.commands;
  counts.rejected += stats.rejected;
  counts.illegal += stats.illegal;
  counts.illegalMucks += stats.illegalMucks;
  counts.silences += stats.silences;
};

const finalSeqOf = (client: ClientBotRecord) =>
  client.final().pipe(
    Option.flatMap(({ seq }) => seq),
    Option.getOrElse(() => 0)
  );

const indexClientActivity = (
  checker: Checker,
  received: Received,
  client: ClientBotRecord,
  first: number
) => {
  const { player } = client.pass;
  const where = `${client.label} activity`;
  let expected = first + 1;
  let broken = Option.none<string>();

  for (const item of client.activity) {
    if (Option.isSome(broken)) {
      break;
    }

    if (Activities.$is("Applied")(item)) {
      if (item.seq === expected) {
        const text = textOf(encodeSeenResult(item.event));

        checker.counts.clientEventsChecked += 1;
        pushTo(received.events, item.seq, {
          cards: cardsIn(decodeJson(text), false),
          digest: digestOf(text),
          player,
          text: () => textOf(encodeSeenResult(item.event)),
          where,
        });
        expected = item.seq + 1;
      } else {
        broken = Option.some(
          `${where} reported event ${item.seq} while ${expected} was next`
        );
      }
    } else if (item.from === expected) {
      expected = item.to + 1;
    } else {
      broken = Option.some(
        `${where} reported skipping ${item.from}..${item.to} while ${expected} was next`
      );
    }
  }

  const applied = finalSeqOf(client);

  Option.match(broken, {
    onNone: () => {
      if (expected - 1 !== applied) {
        report(
          checker,
          `${where} accounts for events up to ${expected - 1}, but the client applied ${applied}`
        );
      }
    },
    onSome: (problem) => {
      report(checker, problem);
    },
  });
};

const indexClientReplies = (
  checker: Checker,
  received: Received,
  client: ClientBotRecord
) => {
  const issued = new Set<string>(client.commands.map(({ id }) => id));
  const replies = new Map<string, Set<string>>();

  for (const entry of client.commands) {
    const where = `${client.label} ${entry.command._tag} ${entry.id}`;

    for (const answeredAt of Option.toArray(entry.answeredAt)) {
      const waitedMs = Math.round(answeredAt - entry.issuedAt);

      if (entry.issuedOnDeafLine && waitedMs > DEAF_REPLY_BOUND_MS) {
        report(
          checker,
          `${where} went out on a deaf line and waited ${waitedMs} ms for its reply, past the ${DEAF_REPLY_BOUND_MS} ms bound`
        );
      }
    }

    Option.match(entry.outcome, {
      onNone: () => {
        report(checker, `${where} was still waiting for its reply`);
      },
      onSome: Result.match({
        onFailure: (why) => {
          report(checker, `${where} got no reply: ${why}`);
        },
        onSuccess: (reply) => {
          if (pokerCodec.reply.guards.Accepted(reply)) {
            received.traces.push({
              command: entry.command,
              id: entry.id,
              player: client.pass.player,
              to: reply.seq,
              where,
            });
          }

          if (pokerCodec.reply.guards.Unavailable(reply)) {
            report(checker, `${where} was answered ${reply.reason}`);
          }
        },
      }),
    });
  }

  for (const text of client.frames()) {
    const message = decodeServerFrame(text).pipe(
      Result.getSuccess,
      Option.filter(guards.Reply)
    );

    for (const { id, result } of Option.toArray(message)) {
      if (!issued.has(id)) {
        report(
          checker,
          `${client.label} was answered for ${id}, which it never issued`
        );
      }

      const seen = replies.get(id) ?? new Set<string>();

      seen.add(pokerCodec.encodeReply(result));
      replies.set(id, seen);
    }
  }

  for (const [id, texts] of replies) {
    if (texts.size > 1) {
      report(
        checker,
        `${client.label} got different replies to ${id}: ${[...texts].join(" / ")}`
      );
    }
  }
};

const indexClient = (
  checker: Checker,
  received: Received,
  client: ClientBotRecord
) => {
  addClientStats(checker, client);

  for (const problem of client.problems) {
    report(checker, problem);
  }

  Option.match(client.firstSeq(), {
    onNone: () => {
      report(checker, `${client.label} never went live`);
    },
    onSome: (first) => {
      indexClientActivity(checker, received, client, first);
    },
  });

  for (const { hand, seq, view } of client.handEnds) {
    pushTo(received.clientViews, seq, {
      player: client.pass.player,
      view,
      where: `${client.label} after hand ${hand}`,
    });
  }

  indexClientReplies(checker, received, client);

  for (const view of Option.toArray(
    client.final().pipe(Option.flatMap((state) => state.view))
  )) {
    received.finals.push({ player: client.pass.player, view });
  }
};

const countHandStart = (checker: Checker, state: RoomState) => {
  if (!RoomStates.$is("Open")(state)) {
    return;
  }

  const { counts } = checker;
  const { ante } = state.table.config;
  const { approval } = state.settings;
  const approving = approval.seats || approval.chips;

  counts.noAnteHands += Antes.$is("NoAnte")(ante) ? 1 : 0;
  counts.everyPlayerAnteHands += Antes.$is("EveryPlayer")(ante) ? 1 : 0;
  counts.bigBlindAnteHands += Antes.$is("BigBlindPays")(ante) ? 1 : 0;
  counts.handsWithApproval += approving ? 1 : 0;
  counts.handsWithoutApproval += approving ? 0 : 1;
};

const observeTable = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  table: Event
) => {
  const { counts } = checker;

  if (Events.$is("HandStarted")(table)) {
    ledger.known = { holes: new Map(), shown: new Set() };
    counts.hands += 1;

    const deck = table.deck.join(",");

    if (ledger.decks.has(deck)) {
      report(checker, `hand ${table.handNumber} reuses an earlier deck`);
    }

    ledger.decks.add(deck);
    counts.bombPots += table.bombPot === undefined ? 0 : 1;
    countHandStart(checker, state);
  }

  if (Events.$is("HoleCardsDealt")(table)) {
    for (const player of Option.toArray(occupantOf(state, table.seat))) {
      ledger.known.holes.set(table.seat, { cards: table.cards, player });
    }
  }

  for (const card of publicCards(table)) {
    ledger.known.shown.add(card);
  }

  counts.antePosts += Events.$is("AntePosted")(table) ? 1 : 0;
  counts.straddles += Events.$is("StraddlePosted")(table) ? 1 : 0;
  counts.runChoices += Events.$is("RunsChosen")(table) ? 1 : 0;
  counts.multiRunHands +=
    Events.$is("RunsAgreed")(table) && table.runs > 1 ? 1 : 0;
  counts.rabbitHunts += Events.$is("RabbitHunted")(table) ? 1 : 0;
  counts.shows += Events.$is("CardsShown")(table) ? 1 : 0;

  if (
    Events.$is("HandEnded")(table) &&
    RoomStates.$is("Open")(state) &&
    ledger.bought - ledger.cashed !== chipsOnTable(state)
  ) {
    report(
      checker,
      `after hand ${table.handNumber} the ledger holds ${ledger.bought - ledger.cashed} and the table ${chipsOnTable(state)}`
    );
  }
};

const observeMoney = (ledger: Ledger, event: RoomEvent) => {
  if (RoomEvents.$is("BoughtIn")(event)) {
    ledger.bought += event.amount;
    ledger.net.set(
      event.player,
      (ledger.net.get(event.player) ?? 0) - event.amount
    );
  }

  if (RoomEvents.$is("CashedOut")(event)) {
    ledger.cashed += event.amount;
    ledger.net.set(
      event.player,
      (ledger.net.get(event.player) ?? 0) + event.amount
    );
  }
};

const observeRunVote = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  event: RoomEvent
) => {
  if (RoomEvents.$is("RunClockStarted")(event)) {
    ledger.runDeadline = Option.some(event.deadline);
  }

  if (
    !RoomEvents.$is("Table")(event) ||
    !Events.$is("RunsAgreed")(event.event)
  ) {
    return;
  }

  const late = ledger.runDeadline.pipe(
    Option.exists((deadline) => event.at >= deadline)
  );

  checker.counts.unclockedVotesTimedOut +=
    late && RoomStates.$is("Open")(state) && state.settings.turnSeconds === 0
      ? 1
      : 0;
  ledger.runDeadline = Option.none();
};

const observeShowdown = (
  checker: Checker,
  ledger: Ledger,
  event: RoomEvent
) => {
  const { counts } = checker;

  if (RoomEvents.$is("ShowdownClockStarted")(event)) {
    ledger.showdownDeadline = Option.some(event.deadline);
  }

  if (!RoomEvents.$is("Table")(event)) {
    return;
  }

  const table = event.event;

  if (Events.$is("ShowdownStarted")(table)) {
    ledger.showdown = Option.some(new Set());
  }

  if (Events.$is("HandTabled")(table) || Events.$is("HandMucked")(table)) {
    counts.showdownTables += Events.$is("HandTabled")(table) ? 1 : 0;
    counts.showdownMucks += Events.$is("HandMucked")(table) ? 1 : 0;
    counts.lateShowdownChoices += ledger.showdownDeadline.pipe(
      Option.exists((deadline) => event.at >= deadline)
    )
      ? 1
      : 0;
    ledger.showdownDeadline = Option.none();
  }

  if (Events.$is("HandTabled")(table)) {
    for (const tabled of Option.toArray(ledger.showdown)) {
      tabled.add(table.seat);
    }
  }

  if (Events.$is("HandEnded")(table)) {
    ledger.showdown = Option.none();
    ledger.showdownDeadline = Option.none();
  }

  if (
    Events.$is("PotAwarded")(table) &&
    ledger.showdown.pipe(
      Option.exists((tabled) =>
        table.winners.some((winner) => !tabled.has(winner.seat))
      )
    )
  ) {
    counts.unshownWinners += 1;
    ledger.showdown = Option.none();
  }
};

const DEALT_FROM_A_SEAL = new Set<RoomEvent["_tag"]>([
  "DealtFromBeacon",
  "DealtWithoutBeacon",
]);

const observeAttendance = (
  checker: Checker,
  ledger: Ledger,
  event: RoomEvent
) => {
  if (RoomEvents.$is("TableUnattended")(event)) {
    checker.counts.tablesUnattended += 1;
  }

  if (RoomEvents.$is("TableWentQuiet")(event)) {
    checker.counts.quietPauses += 1;
    ledger.quiet = true;
  }

  if (RoomEvents.$is("TableAttended")(event)) {
    checker.counts.quietResumes += Option.isSome(event.quietSince) ? 1 : 0;
    ledger.quiet = false;
  }

  if (
    ledger.quiet &&
    RoomEvents.$is("Table")(event) &&
    Events.$is("HandStarted")(event.event) &&
    !DEALT_FROM_A_SEAL.has(ledger.lastTag)
  ) {
    report(
      checker,
      `hand ${event.event.handNumber} started at ${event.at} while the table was quiet, and not from a seal bound before the pause`
    );
  }

  ledger.lastTag = event._tag;
};

const observeClocks = (checker: Checker, ledger: Ledger, event: RoomEvent) => {
  if (RoomEvents.$is("TurnClockStarted")(event)) {
    ledger.deadline = event.deadline;
  }

  if (RoomEvents.$is("TimeBankStarted")(event)) {
    checker.counts.bankStarts += 1;

    if (event.at < ledger.deadline) {
      report(
        checker,
        `a time bank started at ${event.at}, before the turn ended at ${ledger.deadline}`
      );
    }

    ledger.deadline = event.deadline;
  }

  if (
    RoomEvents.$is("MarkedAway")(event) ||
    RoomEvents.$is("TimedOut")(event)
  ) {
    checker.counts.timeouts += 1;

    if (event.at < ledger.deadline) {
      report(
        checker,
        `seat ${event.seat} timed out at ${event.at}, before its clock ran out at ${ledger.deadline}`
      );
    }
  }
};

const countRoomEvent = (checker: Checker, event: RoomEvent) => {
  const { counts } = checker;

  counts.approvals +=
    RoomEvents.$is("SeatApproved")(event) ||
    RoomEvents.$is("ChipsApproved")(event)
      ? 1
      : 0;
  counts.denials +=
    RoomEvents.$is("SeatDenied")(event) || RoomEvents.$is("ChipsDenied")(event)
      ? 1
      : 0;
  counts.rulesQueued += RoomEvents.$is("RulesQueued")(event) ? 1 : 0;
  counts.bombPotsCalled +=
    RoomEvents.$is("BombPotCalled")(event) && event.on ? 1 : 0;
  counts.settingsChanged += RoomEvents.$is("SettingsChanged")(event) ? 1 : 0;
  counts.closeQueued += RoomEvents.$is("CloseQueued")(event) ? 1 : 0;
};

const checkCards = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  seen: Seen,
  seq: number
) => {
  const allowed = allowedFor(ledger.known, state, seen.player);

  const leaked = seen.cards.filter((card) => !allowed.has(card));

  if (leaked.length > 0) {
    report(
      checker,
      `${seen.where} saw cards ${leaked.join(",")} it may not see at ${seq}`
    );
  }
};

const checkReceivedEvents = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  event: RoomEvent,
  seen: readonly Seen[],
  seq: number
) => {
  const expectedFor = new Map<PlayerId, string>();

  for (const item of seen) {
    const expected =
      expectedFor.get(item.player) ??
      encodeSeen(redact(event, audienceOf(state, item.player)));

    expectedFor.set(item.player, expected);

    if (item.digest !== digestOf(expected)) {
      report(
        checker,
        `${item.where} got ${item.text()} at ${seq}, not ${expected}`
      );
    }

    checkCards(checker, ledger, state, item, seq);
  }
};

const checkReceivedViews = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  seen: readonly Seen[],
  seq: number
) => {
  for (const item of seen) {
    const started = wallClock();
    const view = viewFor(state, audienceOf(state, item.player), state.now);

    ledger.viewMs += wallClock() - started;
    ledger.views += 1;
    checker.counts.viewsChecked += 1;

    const expected = encodeView(view);

    if (item.digest !== digestOf(expected)) {
      report(
        checker,
        `${item.where} was shown a view at ${seq} that differs from the log's: ${item.text()} / ${expected}`
      );
    }

    checkCards(checker, ledger, state, item, seq);

    for (const stacks of Option.toArray(stacksOf(view))) {
      if (stacks !== ledger.bought - ledger.cashed) {
        report(
          checker,
          `${item.where} sees ${stacks} chips on the table at ${seq} while ${ledger.bought - ledger.cashed} are bought in`
        );
      }
    }
  }
};

const checkWelcomes = (
  checker: Checker,
  ledger: Ledger,
  state: RoomState,
  welcomes: readonly WelcomeSeen[],
  seq: number
) => {
  for (const welcome of welcomes) {
    checkCards(
      checker,
      ledger,
      state,
      {
        cards: welcome.cards,
        digest: "",
        player: welcome.player,
        text: () => "",
        where: welcome.where,
      },
      seq
    );

    const shown = remainingShown(welcome.view);

    for (const due of Option.toArray(deadlineOf(state))) {
      for (const remaining of Option.toArray(shown)) {
        checker.counts.welcomeClockChecks += 1;

        const low = Math.max(
          0,
          due - Math.max(welcome.arrivedAt + CLOCK_TOLERANCE_MS, state.now)
        );

        const high = Math.max(
          0,
          due - Math.max(welcome.helloAt - CLOCK_TOLERANCE_MS, state.now)
        );

        if (remaining < low || remaining > high) {
          report(
            checker,
            `${welcome.where} was shown ${remaining} ms left at ${seq}; the server's clock allows ${low}..${high}`
          );
        }
      }
    }
  }
};

const shownToSender = (
  state: RoomState,
  from: PlayerId,
  signal: RoomSignal
) => {
  const view = viewFor(state, audienceOf(state, from), state.now);

  return (
    view.members.some(({ player }) => player === from) &&
    RoomSignalSchema.match(signal, {
      Peeking: () =>
        RoomViews.$is("Open")(view) &&
        view.settings.peeking &&
        view.holeCards.length > 0 &&
        view.hand.pipe(
          Option.exists((hand) =>
            hand.players.some(
              (dealt) =>
                dealt.player === from &&
                dealt.status !== "Folded" &&
                !dealt.mucked
            )
          )
        ),
      Reaction: () => true,
    })
  );
};

const checkSignals = (
  checker: Checker,
  state: RoomState,
  seen: readonly SignalSeen[],
  seq: number
) => {
  for (const { from, signal, where } of seen) {
    checker.counts.signalDeliveries += 1;
    checker.counts.peekDeliveries += RoomSignalSchema.guards.Peeking(signal)
      ? 1
      : 0;
    checker.counts.reactionDeliveries += RoomSignalSchema.guards.Reaction(
      signal
    )
      ? 1
      : 0;

    if (!shownToSender(state, from, signal)) {
      report(
        checker,
        `${where} was relayed ${describeSignal(from, signal)} at ${seq}, which the room refuses there`
      );
    }
  }
};

const withoutClocks = (view: RoomView) => {
  const json = decodeJson(encodeView(view));

  return JSON.stringify(
    isJsonObject(json)
      ? Object.fromEntries(
          Object.entries(json).filter(([key]) => key !== "clocks")
        )
      : json
  );
};

const checkClientViews = (
  checker: Checker,
  state: RoomState,
  seen: readonly ClientView[],
  seq: number
) => {
  for (const item of seen) {
    checker.counts.clientViewsChecked += 1;

    const expected = withoutClocks(
      viewFor(state, audienceOf(state, item.player), state.now)
    );

    const shown = withoutClocks(item.view);

    if (shown !== expected) {
      report(
        checker,
        `${item.where} showed a view at ${seq} that differs from the log's apart from its clocks: ${shown} / ${expected}`
      );
    }
  }
};

const batchStarts = (events: readonly RoomEvent[], to: number) => {
  const at = events[to - 1]?.at;
  const starts = [to + 1];

  for (let start = to; start >= 2 && events[start - 1]?.at === at; start -= 1) {
    starts.push(start);
  }

  return starts;
};

const isEffectOf = (
  events: readonly RoomEvent[],
  trace: Trace,
  start: number,
  before: RoomState | undefined
) => {
  if (before === undefined) {
    return false;
  }

  const at = events[trace.to - 1]?.at ?? 0;

  const decided = decide(
    before,
    pokerRoom.stamp(trace.player, at, trace.command)
  );

  const stored = events.slice(start - 1, trace.to);

  return (
    Result.isSuccess(decided) &&
    decided.success.length === stored.length &&
    decided.success.every(
      (event, offset) =>
        stored[offset] !== undefined &&
        encodeEvent(event) === encodeEvent(stored[offset])
    )
  );
};

const traceCommands = (
  checker: Checker,
  events: readonly RoomEvent[],
  traces: readonly Trace[],
  statesAfter: ReadonlyMap<number, RoomState>
) => {
  const claimed = new Set<number>();

  for (const trace of traces) {
    const start = batchStarts(events, trace.to).find((candidate) =>
      isEffectOf(events, trace, candidate, statesAfter.get(candidate - 1))
    );

    if (start === undefined) {
      report(
        checker,
        `${trace.where} was accepted at ${trace.to}, but no batch ending there is its effect`
      );
    } else {
      checker.counts.clientCommandsTraced += 1;

      if (start <= trace.to && claimed.has(trace.to)) {
        report(
          checker,
          `${trace.where} claims the batch ending at ${trace.to}, which another command already caused`
        );
      }

      if (start <= trace.to) {
        claimed.add(trace.to);
      }
    }
  }
};

const checkSettlement = (
  checker: Checker,
  finals: readonly Final[],
  net: ReadonlyMap<PlayerId, number>
) => {
  const closed = finals.flatMap(({ view }) =>
    RoomViews.$is("Closed")(view) ? [view] : []
  );

  if (closed.length !== finals.length) {
    report(
      checker,
      `${finals.length - closed.length} bots never saw the room close`
    );
  }

  for (const { player, view } of finals) {
    if (RoomViews.$is("Closed")(view) && !Option.contains(view.you, player)) {
      report(
        checker,
        `${player} was not told who they are when the room closed`
      );
    }
  }

  if (
    new Set(closed.map((view) => encodeView({ ...view, you: Option.none() })))
      .size > 1
  ) {
    report(checker, "members were shown different settlements");
  }

  const [first] = closed;

  if (first === undefined) {
    return [];
  }

  const owed = new Map<PlayerId, number>(
    first.settlement.balances.map((row) => [row.player, row.net])
  );

  for (const { amount, from, to } of first.settlement.transfers) {
    owed.set(from, (owed.get(from) ?? 0) + amount);
    owed.set(to, (owed.get(to) ?? 0) - amount);
  }

  if ([...owed.values()].some((left) => left !== 0)) {
    report(
      checker,
      `the settlement's transfers leave ${JSON.stringify([...owed])}`
    );
  }

  for (const row of first.settlement.balances) {
    if (row.net !== (net.get(row.player) ?? 0)) {
      report(
        checker,
        `${row.player} nets ${row.net} in the settlement and ${net.get(row.player) ?? 0} in the log`
      );
    }
  }

  checker.counts.transfers += first.settlement.transfers.length;

  return [first.settlement.transfers.length];
};

const checkStorage = (checker: Checker, evidence: NightEvidence) => {
  if (!evidence.seqs.every((seq, index) => seq === index + 1)) {
    report(checker, "stored sequence numbers are not 1..n");
  }

  if (!evidence.memoryMatchesLog) {
    report(
      checker,
      "the object's state differs from the replay of the log it loaded"
    );
  }

  if (evidence.ending === "Halted") {
    return;
  }

  if (Option.isSome(evidence.halted)) {
    report(checker, `the room halted: ${evidence.halted.value}`);
  }

  if (evidence.refusedAlarms > 0 && evidence.ending !== "Stalled") {
    report(
      checker,
      `the room refused the server's own answer to its next deadline at ${evidence.refusedAlarms} alarm runs`
    );
  }
};

const checkHalt = (
  checker: Checker,
  evidence: NightEvidence,
  events: readonly RoomEvent[]
) => {
  if (evidence.ending !== "Halted") {
    return;
  }

  if (Option.isNone(evidence.halt)) {
    report(checker, "the night was meant to halt mid-hand and never did");

    return;
  }

  const { lost, soundSeq, standings } = evidence.halt.value;
  const expected = `stored event ${lost.seq} has sequence number ${lost.seq + 1}`;
  const sound = events.slice(0, lost.seq - 1);
  const ledger = ledgerFromLog(sound);

  if (!Option.contains(evidence.halted, expected)) {
    report(
      checker,
      `the room lost stored event ${lost.seq} and halted with ${Option.getOrElse(evidence.halted, () => "no reason")}`
    );
  }

  if (!unfinishedHand(sound)) {
    report(checker, `stored event ${lost.seq} was not lost mid-hand`);
  }

  for (const { label, status, view } of standings) {
    const problems = Option.match(view, {
      onNone: () => [`answered ${status} with no standings`],
      onSome: (json) =>
        standingsProblems(haltedViewOf(json), ledger, {
          ledger: sound.length,
          standings: soundSeq,
        }),
    });

    for (const problem of problems) {
      report(checker, `${label}'s standings of the halted room: ${problem}`);
    }
  }

  checker.counts.endedHalted += 1;
};

const deafReplyTimes = (clients: readonly ClientBotRecord[]) =>
  clients.flatMap(({ commands }) =>
    commands.flatMap(({ answeredAt, issuedAt, issuedOnDeafLine }) =>
      issuedOnDeafLine
        ? Option.toArray(answeredAt).map((at) => at - issuedAt)
        : []
    )
  );

const devicesOf = (evidence: NightEvidence) => [
  ...evidence.bots.flatMap((bot) =>
    bot.devices
      .filter((device) => device.sockets.length > 0)
      .map((device) => ({
        arrivals: device.sockets.flatMap(({ socket }) => socket.arrivals),
        label: `${bot.label} ${device.name}`,
      }))
  ),
  ...evidence.clients.map((client) => ({
    arrivals: client.arrivals(),
    label: client.label,
  })),
];

interface SealedDeals {
  readonly fromBeacon: readonly number[];
  readonly withoutBeacon: readonly {
    readonly hand: number;
    readonly round: number;
  }[];
  readonly plain: readonly number[];
}

const sealedDealsIn = (events: readonly RoomEvent[]): SealedDeals => {
  const fromBeacon: number[] = [];
  const withoutBeacon: { hand: number; round: number }[] = [];
  const plain: number[] = [];
  let sealedDeal = false;

  for (const event of events) {
    if (RoomEvents.$is("DealtFromBeacon")(event)) {
      fromBeacon.push(event.hand);
      sealedDeal = true;
    }

    if (RoomEvents.$is("DealtWithoutBeacon")(event)) {
      withoutBeacon.push({ hand: event.hand, round: event.round });
      sealedDeal = true;
    }

    if (
      RoomEvents.$is("Table")(event) &&
      Events.$is("HandStarted")(event.event)
    ) {
      if (!sealedDeal) {
        plain.push(event.event.handNumber);
      }

      sealedDeal = false;
    }
  }

  return { fromBeacon, plain, withoutBeacon };
};

const stalledAt = (events: readonly RoomEvent[], index: number) => {
  const stalled = events.findLastIndex(
    (event, at) => at < index && RoomEvents.$is("TableStalled")(event)
  );

  const cleared = events.findLastIndex(
    (event, at) => at < index && RoomEvents.$is("StallCleared")(event)
  );

  return stalled > cleared;
};

const withdrawnWhileStalled = (events: readonly RoomEvent[]) =>
  new Set(
    events.flatMap((event, index) =>
      RoomEvents.$is("SealWithdrawn")(event) && stalledAt(events, index)
        ? [sealKeyOf(event.hand, event.round)]
        : []
    )
  );

const checkEnding = (
  checker: Checker,
  evidence: NightEvidence,
  events: readonly RoomEvent[]
) => {
  const closed = events.findIndex(RoomEvents.$is("RoomClosed"));

  if (closed === -1) {
    return;
  }

  const stalled = stalledAt(events, closed);

  checker.counts.handsCancelled += events.filter(
    RoomEvents.$is("HandCancelled")
  ).length;

  if (stalled) {
    checker.counts.endedStalled += 1;
  } else if (events.some(RoomEvents.$is("CloseQueued"))) {
    checker.counts.endedAfterHand += 1;
  } else {
    checker.counts.endedBetweenHands += 1;
  }

  if ((evidence.ending === "Stalled") !== stalled) {
    report(
      checker,
      stalled
        ? "the room closed stalled in a night nobody jammed"
        : "the night was jammed to end stalled, and the room was not stalled when it closed"
    );
  }
};

const checkFairness = (
  checker: Checker,
  evidence: NightEvidence,
  events: readonly RoomEvent[],
  folded: ReadonlyMap<string, readonly Stretch[]>
) => {
  const fairness = emptyFairness();
  const proofs: Proof[] = [];
  const checkedHands = new Set<number>();
  const now = wallClock();

  for (const device of devicesOf(evidence)) {
    const judged = judgeDevice(
      device.label,
      folded.get(device.label) ?? stretchesFrom(device.arrivals),
      evidence.code,
      now,
      withdrawnWhileStalled(events)
    );

    addFairness(fairness, judged.counts);
    proofs.push(...judged.proofs);

    for (const problem of judged.problems) {
      report(checker, problem);
    }

    for (const hand of judged.checkedHands) {
      checkedHands.add(hand);
    }
  }

  const deals = sealedDealsIn(events);
  const waits = waitBeyondPause(events);

  fairness.sealedDeals += waits.length;
  fairness.waitBeyondPauseMs += waits.reduce((total, wait) => total + wait, 0);

  for (const hand of deals.fromBeacon) {
    if (!checkedHands.has(hand)) {
      report(checker, `no bot came back with hand ${hand} checked`);
    }
  }

  for (const { hand, round } of deals.withoutBeacon) {
    if (!beaconDown(round)) {
      report(
        checker,
        `hand ${hand} was dealt as beacon round ${round} unavailable, and the test beacon was up`
      );
    }
  }

  if (evidence.checked && deals.plain.length > 0) {
    report(
      checker,
      `hands ${deals.plain.join(",")} were dealt plain in a checked room`
    );
  }

  return { fairness, proofs };
};

export const checkNight = (evidence: NightEvidence): NightVerdict => {
  const checker: Checker = {
    code: evidence.code,
    counts: emptyCounts(),
    problems: [],
  };

  const received: Received = {
    clientViews: new Map(),
    events: new Map(),
    finals: [],
    signals: new Map(),
    stretches: new Map(),
    traces: [],
    views: new Map(),
    welcomes: new Map(),
  };

  const events = evidence.events.map((text) => decodeEvent(text));

  checker.counts.events = events.length;
  checker.counts.restarts = evidence.restarts;
  checker.counts.voteRestarts = evidence.voteRestarts;
  checkStorage(checker, evidence);

  for (const bot of evidence.bots) {
    indexBot(checker, received, bot);
  }

  for (const client of evidence.clients) {
    indexClient(checker, received, client);
  }

  const [opening, ...rest] = events;

  if (opening === undefined || !RoomEvents.$is("RoomOpened")(opening)) {
    report(checker, "the stored log does not open the room");

    return {
      counts: checker.counts,
      deafReplyMs: deafReplyTimes(evidence.clients),
      fairness: emptyFairness(),
      problems: checker.problems,
      proofs: [],
      replayMs: 0,
      transfers: [],
      viewMs: 0,
      views: 0,
    };
  }

  const replayStarted = wallClock();
  const replayed = replay([opening, ...rest]);
  const replayMs = wallClock() - replayStarted;

  const ledger: Ledger = {
    bought: 0,
    bounty: NO_BOUNTY_WATCH,
    cashed: 0,
    deadline: 0,
    decks: new Set(),
    known: { holes: new Map(), shown: new Set() },
    lastTag: "RoomOpened",
    net: new Map(),
    quiet: false,
    runDeadline: Option.none(),
    showdown: Option.none(),
    showdownDeadline: Option.none(),
    viewMs: 0,
    views: 0,
  };

  let state: RoomState = replay([opening]);

  const needed = new Set(
    received.traces.flatMap((trace) =>
      batchStarts(events, trace.to).map((start) => start - 1)
    )
  );

  const statesAfter = new Map<number, RoomState>();

  for (const [index, event] of events.entries()) {
    const seq = index + 1;

    state = index === 0 ? state : evolve(state, event);

    if (RoomEvents.$is("Table")(event)) {
      observeTable(checker, ledger, state, event.event);

      const bounty = watchedBounty(ledger.bounty, state, event.event);

      ledger.bounty = bounty.watch;
      checker.counts.bounties += bounty.paid;

      for (const problem of bounty.problems) {
        report(checker, problem);
      }
    }

    observeMoney(ledger, event);
    observeClocks(checker, ledger, event);
    observeAttendance(checker, ledger, event);
    observeRunVote(checker, ledger, state, event);
    observeShowdown(checker, ledger, event);
    countRoomEvent(checker, event);
    checkReceivedEvents(
      checker,
      ledger,
      state,
      event,
      received.events.get(seq) ?? [],
      seq
    );
    checkReceivedViews(
      checker,
      ledger,
      state,
      received.views.get(seq) ?? [],
      seq
    );
    checkWelcomes(
      checker,
      ledger,
      state,
      received.welcomes.get(seq) ?? [],
      seq
    );
    checkClientViews(checker, state, received.clientViews.get(seq) ?? [], seq);
    checkSignals(checker, state, received.signals.get(seq) ?? [], seq);

    if (needed.has(seq)) {
      statesAfter.set(seq, state);
    }
  }

  for (const problem of neverPaid(ledger.bounty)) {
    report(checker, problem);
  }

  traceCommands(checker, events, received.traces, statesAfter);

  if (JSON.stringify(state) !== JSON.stringify(replayed)) {
    report(checker, "folding the log event by event differs from replay");
  }

  checkEnding(checker, evidence, events);
  checkHalt(checker, evidence, events);

  const transfers =
    evidence.ending === "Halted"
      ? []
      : checkSettlement(checker, received.finals, ledger.net);

  const fair = checkFairness(checker, evidence, events, received.stretches);

  return {
    counts: checker.counts,
    deafReplyMs: deafReplyTimes(evidence.clients),
    fairness: fair.fairness,
    problems: checker.problems,
    proofs: fair.proofs,
    replayMs,
    transfers,
    viewMs: ledger.viewMs,
    views: ledger.views,
  };
};
