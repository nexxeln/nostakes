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
  RoomViews,
  audienceOf,
  chipsOnTable,
  evolve,
  redact,
  replay,
  viewFor,
} from "@nostakes/room";
import type { RoomEvent, RoomState, RoomView } from "@nostakes/room";
import { Option, Predicate, Result, Schema } from "effect";

import type { BotRecord, SocketRecord } from "./bot.js";
import { pokerCodec, wallClock } from "./poker-socket.js";
import type { Arrival } from "./poker-socket.js";

const decodeEvent = Schema.decodeSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema))
);

const seenCodec = Schema.fromJsonString(Schema.toCodecJson(SeenEventSchema));

const viewCodec = Schema.fromJsonString(Schema.toCodecJson(RoomViewSchema));

const encodeSeen = Schema.encodeSync(seenCodec);

const encodeView = Schema.encodeSync(viewCodec);

const encodeSeenResult = Schema.encodeResult(seenCodec);

const encodeViewResult = Schema.encodeResult(viewCodec);

const textOf = (encoded: Result.Result<string, Schema.SchemaError>) =>
  Result.getOrElse(encoded, (failure) => `unencodable: ${failure.message}`);

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const { guards } = pokerCodec.server;

export const CLOCK_TOLERANCE_MS = 50;

export const COUNT_NAMES = [
  "antePosts",
  "approvals",
  "bankStarts",
  "bigBlindAnteHands",
  "catchUps",
  "catchUpsSkipped",
  "closeQueued",
  "commands",
  "denials",
  "drops",
  "duplicates",
  "duplicatesConfirmed",
  "events",
  "everyPlayerAnteHands",
  "framesChecked",
  "hands",
  "handsWithApproval",
  "handsWithoutApproval",
  "illegal",
  "multiRunHands",
  "noAnteHands",
  "protocolViolations",
  "rabbitHunts",
  "reconnects",
  "rejected",
  "replyTimeouts",
  "resent",
  "restarts",
  "rulesQueued",
  "runChoices",
  "secondDevices",
  "settingsChanged",
  "shows",
  "silences",
  "straddles",
  "timeouts",
  "transfers",
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
  catchUps: 0,
  catchUpsSkipped: 0,
  closeQueued: 0,
  commands: 0,
  denials: 0,
  drops: 0,
  duplicates: 0,
  duplicatesConfirmed: 0,
  events: 0,
  everyPlayerAnteHands: 0,
  framesChecked: 0,
  hands: 0,
  handsWithApproval: 0,
  handsWithoutApproval: 0,
  illegal: 0,
  multiRunHands: 0,
  noAnteHands: 0,
  protocolViolations: 0,
  rabbitHunts: 0,
  reconnects: 0,
  rejected: 0,
  replyTimeouts: 0,
  resent: 0,
  restarts: 0,
  rulesQueued: 0,
  runChoices: 0,
  secondDevices: 0,
  settingsChanged: 0,
  shows: 0,
  silences: 0,
  straddles: 0,
  timeouts: 0,
  transfers: 0,
  viewsChecked: 0,
  voteRestarts: 0,
  welcomeClockChecks: 0,
});

export interface NightEvidence {
  readonly seed: number;
  readonly code: RoomCode;
  readonly events: readonly string[];
  readonly seqs: readonly number[];
  readonly halted: Option.Option<string>;
  readonly memoryMatchesLog: boolean;
  readonly bots: readonly BotRecord[];
  readonly restarts: number;
  readonly voteRestarts: number;
}

export interface NightVerdict {
  readonly problems: readonly string[];
  readonly counts: NightCounts;
  readonly transfers: readonly number[];
  readonly replayMs: number;
  readonly views: number;
  readonly viewMs: number;
}

interface Seen {
  readonly player: PlayerId;
  readonly text: string;
  readonly raw: Schema.Json;
  readonly where: string;
}

interface WelcomeSeen {
  readonly player: PlayerId;
  readonly view: RoomView;
  readonly raw: Schema.Json;
  readonly helloAt: number;
  readonly arrivedAt: number;
  readonly where: string;
}

interface Final {
  readonly player: PlayerId;
  readonly view: RoomView;
}

interface Received {
  readonly events: Map<number, Seen[]>;
  readonly views: Map<number, Seen[]>;
  readonly welcomes: Map<number, WelcomeSeen[]>;
  readonly finals: Final[];
}

interface Knowledge {
  readonly shown: Set<number>;
  readonly holes: Map<
    SeatIndex,
    { readonly cards: readonly Card[]; readonly player: PlayerId }
  >;
}

interface Ledger {
  bought: number;
  cashed: number;
  deadline: number;
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
  "cards",
  "deck",
  "holeCards",
  "rabbit",
  "shown",
  "undealt",
  "yourCards",
]);

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
        cardsIn(item, CARD_KEYS.has(key))
      )
    : [];
};

const publicCards = (event: Event): readonly Card[] => {
  if (
    Events.$is("StreetDealt")(event) ||
    Events.$is("CardsShown")(event) ||
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
  counts.duplicates += stats.duplicates;
  counts.resent += stats.resent;
  counts.reconnects += stats.reconnects;
  counts.drops += stats.drops;
  counts.secondDevices += stats.secondDevices;
  counts.silences += stats.silences;
  counts.protocolViolations += stats.protocolViolations;
  counts.replyTimeouts += stats.replyTimeouts;

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

const welcomeArrived = (
  checker: Checker,
  received: Received,
  where: string,
  record: SocketRecord,
  lineage: Lineage,
  player: PlayerId,
  arrival: Arrival
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
          player,
          raw: rawMissed[offset] ?? null,
          text: textOf(encodeSeenResult(event)),
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
    helloAt: record.helloAt,
    player,
    raw: fieldOf(raw, "view"),
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
  arrival: Arrival
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
      player,
      raw: rawEvents[offset] ?? null,
      text: textOf(encodeSeenResult(event)),
      where,
    });
  }

  pushTo(received.views, message.to, {
    player,
    raw: fieldOf(raw, "view"),
    text: textOf(encodeViewResult(message.view)),
    where,
  });
  lineage.next = Option.some(message.to + 1);
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

    for (const [index, record] of device.sockets.entries()) {
      const where = `${bot.label} ${device.name} #${index + 1}`;

      lineage.welcomed = false;

      for (const problem of record.socket.problems) {
        report(checker, problem);
      }

      for (const arrival of record.socket.arrivals) {
        checker.counts.framesChecked += 1;

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
          arrival
        );
        eventsArrived(checker, received, where, lineage, player, arrival);

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

  if (RoomEvents.$is("MarkedAway")(event)) {
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

  const leaked = cardsIn(seen.raw, false).filter((card) => !allowed.has(card));

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

    if (item.text !== expected) {
      report(
        checker,
        `${item.where} got ${item.text} at ${seq}, not ${expected}`
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

    if (item.text !== expected) {
      report(
        checker,
        `${item.where} was shown a view at ${seq} that differs from the log's: ${item.text} / ${expected}`
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
        player: welcome.player,
        raw: welcome.raw,
        text: "",
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

  if (new Set(closed.map((view) => encodeView(view))).size > 1) {
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

  if (Option.isSome(evidence.halted)) {
    report(checker, `the room halted: ${evidence.halted.value}`);
  }

  if (!evidence.memoryMatchesLog) {
    report(checker, "the object's state differs from the replay of its log");
  }
};

export const checkNight = (evidence: NightEvidence): NightVerdict => {
  const checker: Checker = {
    code: evidence.code,
    counts: emptyCounts(),
    problems: [],
  };

  const received: Received = {
    events: new Map(),
    finals: [],
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

  const [opening, ...rest] = events;

  if (opening === undefined || !RoomEvents.$is("RoomOpened")(opening)) {
    report(checker, "the stored log does not open the room");

    return {
      counts: checker.counts,
      problems: checker.problems,
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
    cashed: 0,
    deadline: 0,
    decks: new Set(),
    known: { holes: new Map(), shown: new Set() },
    net: new Map(),
    viewMs: 0,
    views: 0,
  };

  let state: RoomState = replay([opening]);

  for (const [index, event] of events.entries()) {
    const seq = index + 1;

    state = index === 0 ? state : evolve(state, event);

    if (RoomEvents.$is("Table")(event)) {
      observeTable(checker, ledger, state, event.event);
    }

    observeMoney(ledger, event);
    observeClocks(checker, ledger, event);
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
  }

  if (JSON.stringify(state) !== JSON.stringify(replayed)) {
    report(checker, "folding the log event by event differs from replay");
  }

  const transfers = checkSettlement(checker, received.finals, ledger.net);

  return {
    counts: checker.counts,
    problems: checker.problems,
    replayMs,
    transfers,
    viewMs: ledger.viewMs,
    views: ledger.views,
  };
};
