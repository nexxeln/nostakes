import {
  Events,
  PendingDecisions,
  Seats,
  ShowdownEntries,
  TableStates,
  pendingDecisions,
} from "@nostakes/engine";
import type { Card, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Match, Option, Predicate, Result, Schema } from "effect";

import {
  Actors,
  Audiences,
  DeadlineSchema,
  DecisionClocks,
  RoomCommands,
  RoomCommandSchema,
  RoomEventSchema,
  RoomEvents,
  RoomRejectionSchema,
  RoomSettingsSchema,
  RoomStates,
  RoomViewSchema,
  SEATS,
  SeenEventSchema,
  TimeBankRefills,
  decide,
  evolve,
  nextDeadline,
  timeBankLeft,
} from "../src/index.js";
import type {
  Audience,
  RoomView,
  SeenEvent,
  Open,
  RoomCommand,
  RoomEvent,
  RoomEventOf,
  RoomState,
} from "../src/index.js";
import { serverAnswer } from "./beacon.js";
import type { Step } from "./sessions.js";

const sittingAt = (state: Open, seat: SeatIndex) =>
  Option.fromUndefinedOr(state.table.seats[seat]).pipe(
    Option.filter(Seats.$is("Occupied")),
    Option.map((occupant) => occupant.player)
  );

export const audiencesOf = (state: RoomState): readonly Audience[] =>
  RoomStates.$is("Open")(state)
    ? [
        Audiences.Spectator(),
        ...SEATS.flatMap((seat) => {
          const occupant = state.table.seats[seat];

          return occupant !== undefined && Seats.$is("Occupied")(occupant)
            ? [Audiences.Seated({ player: occupant.player, seat })]
            : [];
        }),
      ]
    : [Audiences.Spectator()];

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

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

export const cardsIn = (
  value: Schema.Json,
  holding: boolean
): readonly number[] => {
  if (Predicate.isNumber(value)) {
    return holding ? [value] : [];
  }

  if (isJsonArray(value)) {
    return value.flatMap((item) => cardsIn(item, holding));
  }

  return isJsonObject(value)
    ? Object.entries(value).flatMap(([key, item]) =>
        key === SPARE_DECK_KEY ? [] : cardsIn(item, CARD_KEYS.has(key))
      )
    : [];
};

const decodeJson = Schema.decodeSync(Schema.fromJsonString(Schema.Json));

export const asSent = (value: RoomView | SeenEvent): Schema.Json =>
  decodeJson(JSON.stringify(value));

export interface Knowledge {
  readonly hands: number;
  readonly holes: ReadonlyMap<
    SeatIndex,
    { readonly cards: readonly Card[]; readonly player: PlayerId }
  >;
  readonly shown: ReadonlySet<number>;
}

export const publicCards = (event: Event): readonly Card[] => {
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

export const learn = (
  known: Knowledge,
  state: RoomState,
  event: RoomEvent
): Knowledge => {
  if (!RoomEvents.$is("Table")(event)) {
    return known;
  }

  const table = event.event;

  if (Events.$is("HandStarted")(table)) {
    return { hands: known.hands + 1, holes: new Map(), shown: new Set() };
  }

  if (Events.$is("HoleCardsDealt")(table) && RoomStates.$is("Open")(state)) {
    const occupant = state.table.seats[table.seat];

    return occupant !== undefined && Seats.$is("Occupied")(occupant)
      ? {
          ...known,
          holes: new Map([
            ...known.holes,
            [table.seat, { cards: table.cards, player: occupant.player }],
          ]),
        }
      : known;
  }

  return {
    ...known,
    shown: new Set([...known.shown, ...publicCards(table)]),
  };
};

export const allowedFor = (known: Knowledge, audience: Audience) => {
  const allowed = new Set<number>(known.shown);

  if (Audiences.$is("Seated")(audience)) {
    const own = known.holes.get(audience.seat);

    if (own !== undefined && own.player === audience.player) {
      for (const card of own.cards) {
        allowed.add(card);
      }
    }
  }

  return allowed;
};

export const leaks = (cards: readonly number[], allowed: ReadonlySet<number>) =>
  cards.filter((card) => !allowed.has(card));

export const isOpen = (state: RoomState): state is Open =>
  RoomStates.$is("Open")(state);

export const inHand = (state: RoomState) =>
  isOpen(state) && TableStates.$is("InHand")(state.table);

const HOSTING = new Set<RoomCommand["_tag"]>([
  "ActForSeat",
  "ApproveChips",
  "ApproveSeat",
  "ChangeSettings",
  "CloseRoom",
  "DealNextHand",
  "DenyChips",
  "DenySeat",
  "PauseGame",
  "RemoveFromSeat",
  "StartGame",
  "TransferHost",
]);

const SERVER_ONLY = new Set<RoomCommand["_tag"]>([
  "Deal",
  "DealSealed",
  "ExpireClock",
  "NoteAttendance",
  "NoteStall",
  "QuietTable",
  "RunQueue",
  "SealHand",
]);

const HOSTING_EVENTS = new Set<RoomEvent["_tag"]>([
  "ChipsApproved",
  "ChipsDenied",
  "CloseQueued",
  "GamePaused",
  "GameStarted",
  "NextHandCalled",
  "RulesQueued",
  "SeatApproved",
  "SeatDenied",
  "SettingsChanged",
]);

const SERVER_EVENTS = new Set<RoomEvent["_tag"]>([
  "DealtFromBeacon",
  "DealtWithoutBeacon",
  "HandSealed",
  "MarkedAway",
  "StallCleared",
  "TableAttended",
  "TableStalled",
  "TableUnattended",
  "TableWentQuiet",
  "TimeBankStarted",
]);

const playerOf = (event: RoomEvent): Option.Option<PlayerId> =>
  "player" in event ? Option.some(event.player) : Option.none();

const seatOfTableEvent = (event: Event): Option.Option<SeatIndex> =>
  Events.$is("Checked")(event) ||
  Events.$is("Called")(event) ||
  Events.$is("RaisedTo")(event) ||
  Events.$is("Folded")(event) ||
  Events.$is("RunsChosen")(event) ||
  Events.$is("CardsShown")(event) ||
  Events.$is("SittingOutChanged")(event)
    ? Option.some(event.seat)
    : Option.none();

const ownerAt = (state: RoomState, seat: SeatIndex) => {
  if (!isOpen(state)) {
    return Option.none();
  }

  const occupant = state.table.seats[seat];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? Option.some(occupant.player)
    : Option.none();
};

export const authorityProblems = (step: Step): readonly string[] => {
  if (Result.isFailure(step.decision) || !isOpen(step.before)) {
    return [];
  }

  const { before, command } = step;
  const tag = command._tag;
  const actor = command.by;

  if (SERVER_ONLY.has(tag)) {
    return Actors.$is("Server")(actor) ? [] : [`${tag} accepted from a member`];
  }

  if (!Actors.$is("Member")(actor)) {
    return [`${tag} accepted from the server`];
  }

  const member = actor.player;

  const endsStalledNight = tag === "CloseRoom" && Option.isSome(before.stalled);

  if (HOSTING.has(tag)) {
    return member === before.host || endsStalledNight
      ? []
      : [`${tag} accepted from ${member}, not the host`];
  }

  const ended = step.events.findIndex(
    (event) =>
      RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event)
  );

  const ownTurn = ended === -1 ? step.events : step.events.slice(0, ended);

  const leaving = new Set([
    ...before.queued.leaving,
    ...(tag === "LeaveRoom" || tag === "LeaveSeat" ? [member] : []),
  ]);

  return ownTurn.flatMap((event) => {
    if (HOSTING_EVENTS.has(event._tag) || SERVER_EVENTS.has(event._tag)) {
      return [`${tag} by ${member} caused ${event._tag}`];
    }

    if (RoomEvents.$is("HostChanged")(event)) {
      const joinedEmptyRoom =
        tag === "Join" && before.members.length === 0 && event.host === member;

      const hostLeft = tag === "LeaveRoom" && member === before.host;

      return joinedEmptyRoom || hostLeft
        ? []
        : [`${tag} by ${member} changed the host`];
    }

    if (RoomEvents.$is("Table")(event)) {
      if (Events.$is("HandStarted")(event.event)) {
        return [`${tag} by ${member} dealt a hand`];
      }

      return Option.match(seatOfTableEvent(event.event), {
        onNone: () => [],
        onSome: (seat) =>
          Option.exists(
            ownerAt(before, seat),
            (owner) => owner === member || leaving.has(owner)
          )
            ? []
            : [
                `${tag} by ${member} caused ${event.event._tag} for seat ${seat}`,
              ],
      });
    }

    if (
      RoomEvents.$is("TurnClockStarted")(event) ||
      RoomEvents.$is("TimeBankSpent")(event)
    ) {
      return [];
    }

    return Option.match(playerOf(event), {
      onNone: () => [],
      onSome: (player) =>
        player === member || leaving.has(player)
          ? []
          : [`${tag} by ${member} caused ${event._tag} for ${player}`],
    });
  });
};

const roundTrip = <A, I>(schema: Schema.Codec<A, I>) => {
  const codec = Schema.fromJsonString(Schema.toCodecJson(schema));
  const encode = Schema.encodeSync(codec);
  const decode = Schema.decodeSync(codec);

  return (value: A) => {
    const text = encode(value);

    return encode(decode(text)) === text;
  };
};

export const commandRoundTrips = roundTrip(RoomCommandSchema);

export const eventRoundTrips = roundTrip(RoomEventSchema);

export const seenRoundTrips = roundTrip(SeenEventSchema);

export const rejectionRoundTrips = roundTrip(RoomRejectionSchema);

export const settingsRoundTrip = roundTrip(RoomSettingsSchema);

export const viewRoundTrips = roundTrip(RoomViewSchema);

export const deadlineRoundTrips = roundTrip(DeadlineSchema);

const isHandEnded = (event: RoomEvent) =>
  RoomEvents.$is("HandCancelled")(event) ||
  (RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event));

interface QueueWatch {
  chips: { readonly amount: number; readonly player: PlayerId }[];
  close: boolean;
  readonly leaving: Set<PlayerId>;
  rules: boolean;
}

const noteQueued = (watch: QueueWatch, event: RoomEvent) => {
  if (RoomEvents.$is("ChipsQueued")(event)) {
    watch.chips.push({ amount: event.amount, player: event.player });
  }

  if (RoomEvents.$is("LeaveQueued")(event)) {
    watch.leaving.add(event.player);
  }

  watch.rules ||= RoomEvents.$is("RulesQueued")(event);
  watch.close ||= RoomEvents.$is("CloseQueued")(event);
};

const chipsArrived = (
  watch: QueueWatch,
  event: RoomEvent,
  ended: boolean
): readonly string[] => {
  if (!RoomEvents.$is("BoughtIn")(event)) {
    return [];
  }

  const queued = watch.chips.findIndex((item) => item.player === event.player);

  if (queued === -1) {
    return [];
  }

  const [arrived] = watch.chips.splice(queued, 1);

  return ended && arrived?.amount === event.amount
    ? []
    : [`${event.player}'s queued chips arrived early or changed`];
};

const standingPlayer = (event: RoomEvent): Option.Option<PlayerId> => {
  if (RoomEvents.$is("CashedOut")(event)) {
    return Option.some(event.player);
  }

  return RoomEvents.$is("Table")(event) &&
    Events.$is("PlayerStood")(event.event)
    ? Option.some(event.event.player)
    : Option.none();
};

const leftSeat = (
  watch: QueueWatch,
  event: RoomEvent,
  ended: boolean
): readonly string[] =>
  Option.match(standingPlayer(event), {
    onNone: () => [],
    onSome: (player) =>
      watch.leaving.delete(player) && !ended
        ? [`${player} stood before the hand ended`]
        : [],
  });

const rulesApplied = (
  watch: QueueWatch,
  event: RoomEvent,
  ended: boolean
): readonly string[] => {
  const applied =
    watch.rules &&
    RoomEvents.$is("Table")(event) &&
    Events.$is("RulesChanged")(event.event);

  if (!applied) {
    return [];
  }

  watch.rules = false;

  return ended ? [] : ["queued rules applied before the hand ended"];
};

const closed = (
  watch: QueueWatch,
  event: RoomEvent,
  ended: boolean
): readonly string[] => {
  if (!watch.close || !RoomEvents.$is("RoomClosed")(event)) {
    return [];
  }

  watch.close = false;

  return ended ? [] : ["queued close happened before the hand ended"];
};

const stillQueued = (watch: QueueWatch) =>
  watch.chips.length > 0 ||
  watch.leaving.size > 0 ||
  watch.rules ||
  watch.close;

const dealsHoleCards = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) && Events.$is("HoleCardsDealt")(event.event);

export const queueProblems = (steps: readonly Step[]): readonly string[] => {
  const watch: QueueWatch = {
    chips: [],
    close: false,
    leaving: new Set(),
    rules: false,
  };

  const problems: string[] = [];
  let runQueueOwed = false;

  for (const step of steps) {
    let ended: boolean =
      runQueueOwed && RoomCommands.$is("RunQueue")(step.command);

    let endedInDeal = false;
    let dealt = false;

    for (const event of step.events) {
      dealt ||= dealsHoleCards(event);
      endedInDeal ||= dealt && isHandEnded(event);
      ended ||= !dealt && isHandEnded(event);
      noteQueued(watch, event);
      problems.push(
        ...chipsArrived(watch, event, ended),
        ...leftSeat(watch, event, ended),
        ...rulesApplied(watch, event, ended),
        ...closed(watch, event, ended)
      );
    }

    const droppedWithNight = step.events.some(RoomEvents.$is("HandCancelled"));

    if (ended && stillQueued(watch) && !droppedWithNight) {
      problems.push(
        `a hand ended with items still queued after ${step.command._tag}`
      );
    }

    runQueueOwed =
      (runQueueOwed && !ended) || (endedInDeal && stillQueued(watch));
  }

  return problems;
};

const actsOnTheClock = (event: RoomEvent) =>
  RoomEvents.$is("TimeBankStarted")(event) ||
  (RoomEvents.$is("Table")(event) &&
    (Events.$is("Checked")(event.event) ||
      Events.$is("Folded")(event.event) ||
      Events.$is("RunsChosen")(event.event) ||
      Events.$is("HandTabled")(event.event) ||
      Events.$is("HandMucked")(event.event)));

const expiryProblems = (step: Step, before: Open): readonly string[] => {
  const { after, command, decision } = step;

  if (
    !RoomCommands.$is("ExpireClock")(command) ||
    !Actors.$is("Server")(command.by)
  ) {
    return [];
  }

  const at = Math.max(command.at, before.now);

  const matches = Option.exists(
    before.clocks.decision,
    (clock) => clock.deadline === command.deadline
  );

  if (Result.isSuccess(decision)) {
    return matches && at >= command.deadline && step.events.some(actsOnTheClock)
      ? []
      : [`expiry for ${command.deadline} at ${at} accepted early or idle`];
  }

  if (matches && at >= command.deadline) {
    return [`due expiry for ${command.deadline} refused`];
  }

  return after === before ? [] : ["a refused expiry changed the room"];
};

const streakProblems = (
  during: Open,
  event: RoomEventOf<"MarkedAway"> | RoomEventOf<"TimedOut">
): readonly string[] => {
  const limit = during.settings.sitOutAfterTimeouts;

  const player = RoomEvents.$is("TimedOut")(event)
    ? Option.some(event.player)
    : sittingAt(during, event.seat);

  const inARow = Option.match(player, {
    onNone: () => 0,
    onSome: (owner) => during.clocks.timeoutsInARow.get(owner) ?? 0,
  });

  const sitsOut = limit > 0 && inARow + 1 >= limit;

  return sitsOut === RoomEvents.$is("MarkedAway")(event)
    ? []
    : [
        `${event._tag} for ${Option.getOrElse(player, () => "nobody")} after ${inARow} timeouts in a row with a limit of ${limit}`,
      ];
};

const refillProblems = (
  during: Open,
  event: RoomEventOf<"TimeBankRefilled">
): readonly string[] =>
  TimeBankRefills.$match(during.settings.timeBankRefill, {
    NoRefill: () => [`${event.player} got a refill in a room without refills`],
    Refill: ({ everyHands, seconds, upTo }) => {
      const left = timeBankLeft(during, event.player);
      const dealt = during.clocks.handsDealt.get(event.player) ?? 0;

      return [
        ...(left + event.seconds <= upTo && event.seconds <= seconds
          ? []
          : [
              `${event.player} with ${left} left got ${event.seconds} toward ${upTo}`,
            ]),
        ...(dealt % everyHands === 0
          ? []
          : [`${event.player} got a refill after ${dealt} hands`]),
      ];
    },
  });

const bankProblem = (
  during: Open,
  event: RoomEvent,
  banks: Set<PlayerId>
): readonly string[] => {
  if (RoomEvents.$is("TimeBankStarted")(event)) {
    const again = banks.has(event.player);

    banks.add(event.player);

    return again ? [`${event.player} started a second bank`] : [];
  }

  if (RoomEvents.$is("TimeBankRefilled")(event)) {
    return refillProblems(during, event);
  }

  if (
    RoomEvents.$is("TimedOut")(event) ||
    RoomEvents.$is("MarkedAway")(event)
  ) {
    return streakProblems(during, event);
  }

  if (!RoomEvents.$is("TimeBankSpent")(event)) {
    return [];
  }

  const left = timeBankLeft(during, event.player);

  return [
    ...(banks.delete(event.player)
      ? []
      : [`${event.player} spent a bank that never started`]),
    ...(event.seconds >= 0 && event.seconds <= left
      ? []
      : [`${event.player} spent ${event.seconds} of ${left}`]),
  ];
};

const bankProblems = (
  step: Step,
  before: Open,
  banks: Set<PlayerId>
): readonly string[] => {
  const problems: string[] = [];
  let during: RoomState = before;

  for (const event of step.events) {
    if (isOpen(during)) {
      problems.push(...bankProblem(during, event, banks));
    }

    during = evolve(during, event);
  }

  return problems;
};

const unclocked = (step: Step): readonly string[] =>
  isOpen(step.after) &&
  (step.after.settings.turnSeconds > 0 ||
    PendingDecisions.$is("ChooseRuns")(pendingDecisions(step.after.table)) ||
    PendingDecisions.$is("Show")(pendingDecisions(step.after.table))) &&
  inHand(step.after) &&
  Option.isNone(nextDeadline(step.after))
    ? [
        `a hand waiting on ${pendingDecisions(step.after.table)._tag} has no deadline after ${step.command._tag}`,
      ]
    : [];

const runningBank = (state: RoomState): readonly PlayerId[] =>
  isOpen(state)
    ? Option.toArray(
        state.clocks.decision.pipe(
          Option.filter(DecisionClocks.$is("Turn")),
          Option.filter((clock) => Option.isSome(clock.bankFrom)),
          Option.map((clock) => clock.player)
        )
      )
    : [];

export const clockProblems = (
  steps: readonly Step[],
  final: RoomState
): readonly string[] => {
  const banks = new Set<PlayerId>();

  const problems = steps.flatMap((step) =>
    isOpen(step.before)
      ? [
          ...expiryProblems(step, step.before),
          ...bankProblems(step, step.before, banks),
          ...unclocked(step),
        ]
      : []
  );

  const open = isOpen(final) ? [...banks].join(",") : "";

  return open === runningBank(final).join(",")
    ? problems
    : [...problems, `banks left open: ${open}`];
};

const holdingOf = (state: Open, player: PlayerId) => {
  let holding = 0;

  for (const occupied of state.table.seats) {
    holding +=
      Seats.$is("Occupied")(occupied) && occupied.player === player
        ? occupied.stack
        : 0;
  }

  for (const queued of state.queued.chips) {
    holding += queued.player === player ? queued.amount : 0;
  }

  return holding;
};

const dealtInNow = (state: Open, player: PlayerId) =>
  TableStates.$is("InHand")(state.table) &&
  state.table.hand.players.some((dealt) => dealt.player === player);

const topUpAllowed = (state: Open, player: PlayerId) => {
  const holding = holdingOf(state, player);

  return Match.value(state.settings.topUps).pipe(
    Match.when("UpToMax", () => true),
    Match.when(
      "BelowMin",
      () => !dealtInNow(state, player) && holding < state.settings.buyIn.min
    ),
    Match.when("WhenBust", () => !dealtInNow(state, player) && holding === 0),
    Match.exhaustive
  );
};

export const topUpProblems = (step: Step): readonly string[] => {
  const { before, command, decision } = step;

  if (
    !RoomCommands.$is("RequestChips")(command) ||
    !Actors.$is("Member")(command.by) ||
    !isOpen(before) ||
    !SEATS.some((seat) =>
      Option.exists(Option.fromUndefinedOr(before.table.seats[seat]), (held) =>
        Seats.$is("Occupied")(held) && Actors.$is("Member")(command.by)
          ? held.player === command.by.player
          : false
      )
    )
  ) {
    return [];
  }

  const { player } = command.by;
  const allowed = topUpAllowed(before, player);

  const refusedForTheRule =
    Result.isFailure(decision) &&
    Predicate.isTagged(decision.failure, "TopUpNotAllowed");

  if (Result.isSuccess(decision) && !allowed) {
    return [
      `${player} topped up holding ${holdingOf(before, player)} under ${before.settings.topUps}`,
    ];
  }

  return refusedForTheRule && allowed
    ? [`${player} was refused a top-up ${before.settings.topUps} allows`]
    : [];
};

export const deadlineProblems = (
  step: Step,
  index: number
): readonly string[] =>
  step.after === step.before
    ? []
    : Option.match(nextDeadline(step.after), {
        onNone: () => [],
        onSome: (deadline) => {
          const answer = decide(step.after, serverAnswer(deadline, index));

          return Result.isFailure(answer)
            ? [
                `after ${step.command._tag} the room refused its own answer to ${deadline._tag}: ${answer.failure._tag}`,
              ]
            : [];
        },
      });
