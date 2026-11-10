import {
  Actions,
  Antes,
  ChipsSchema,
  Events,
  PendingDecisions,
  pendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShowdownEntries,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
} from "@nostakes/engine";
import type {
  Action,
  Ante,
  Card,
  Event,
  LegalActions,
  PlayerId,
  SeatIndex,
  TableConfig,
} from "@nostakes/engine";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@nostakes/protocol";
import {
  Actors,
  Audiences,
  Deadlines,
  RoomCodeSchema,
  RoomCommandSchema,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  SEATS,
  SeenEvents,
  TimeBankRefills,
  decide,
  evolve,
  invariants,
  millis,
  nextDeadline,
  openRoom,
  redact,
  replay,
  settlement,
  viewFor,
} from "@nostakes/room";
import type {
  Audience,
  Deadline,
  Open,
  Opening,
  RoomCommand,
  RoomEvent,
  RoomRejection,
  RoomSettings,
  RoomState,
  RoomView,
  SeenEvent,
  SeenTableEvent,
} from "@nostakes/room";
import {
  Console,
  Effect,
  Match,
  Option,
  Predicate,
  Result,
  Schema,
} from "effect";

const CODE_BASE = ROOM_CODE_ALPHABET.length;

const nightCode = (night: number) =>
  RoomCodeSchema.make(
    Array.from(
      night.toString(CODE_BASE).padStart(ROOM_CODE_LENGTH, "0"),
      (digit) => ROOM_CODE_ALPHABET.charAt(Number.parseInt(digit, CODE_BASE))
    ).join("")
  );

const DEFAULT_SEED = 20_261_110;

const DEFAULT_HANDS = 100_000;

class SoakViolation extends Schema.TaggedError<
  SoakViolation,
  { readonly brand: unique symbol }
>()("SoakViolation", {
  detail: Schema.String,
  night: Schema.Int,
  seed: Schema.Int,
}) {
  override get message() {
    return `Night ${this.night} of seed ${this.seed} broke the room: ${this.detail}. The opening and every command since the room opened are printed above. Replay them through openRoom and decide, or rerun with --seed ${this.seed}.`;
  }
}

const argument = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = Number(process.argv[index + 1]);

  return index !== -1 && Number.isSafeInteger(value) ? value : fallback;
};

const randomSource = (seed: number) => {
  let state = (Math.abs(Math.trunc(seed)) % 2_147_483_646) + 1;

  const below = (bound: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, bound);
  };

  return {
    below,
    chance: (percent: number) => below(100) < percent,
    pick: <A>(values: readonly A[]) => values[below(values.length)],
  };
};

type Random = ReturnType<typeof randomSource>;

const chips = (amount: number) => ChipsSchema.make(amount);

const POOL: readonly PlayerId[] = Array.from({ length: 10 }, (_, index) =>
  PlayerIdSchema.make(`friend-${index}`)
);

const HOST = PlayerIdSchema.make("friend-0");

const anteOf = (random: Random, bigBlind: number): Ante => {
  const kind = random.below(3);

  if (kind === 0) {
    return Antes.NoAnte();
  }

  const amount = chips(1 + random.below(bigBlind));

  return kind === 1
    ? Antes.EveryPlayer({ amount })
    : Antes.BigBlindPays({ amount });
};

const tableConfig = (random: Random): TableConfig => {
  const smallBlind = 1 + random.below(5);
  const bigBlind = smallBlind * (1 + random.below(2));

  return TableConfigSchema.make({
    allInHands: random.chance(40) ? "Hidden" : "FaceUp",
    ante: anteOf(random, bigBlind),
    bigBlind: chips(bigBlind),
    blindPosting: random.chance(40) ? "Casino" : "HomeGame",
    maxRuns: RunCountSchema.make(1 + random.below(3)),
    rabbitHunt: random.chance(50),
    rabbitHunters: random.chance(30) ? "StillIn" : "DealtIn",
    runCount: random.chance(25) ? "Fixed" : "Vote",
    showdown: random.chance(60) ? "Interactive" : "Automatic",
    showdownOrder: random.chance(30) ? "LastAggressor" : "RiverAggressor",
    smallBlind: chips(smallBlind),
    straddle: {
      button: random.chance(50),
      underTheGun: random.chance(60) ? 2 : random.below(2),
    },
    straddleSize: random.chance(30) ? "TwoBigBlinds" : "Doubling",
    voluntaryShows: random.chance(30) ? "BothCards" : "EitherCard",
  });
};

const roomSettings = (random: Random): RoomSettings => {
  const min = 40 + random.below(60);

  return {
    approval: { chips: random.chance(50), seats: random.chance(50) },
    betweenHandsSeconds: random.below(4),
    buyIn: { max: chips(min * (3 + random.below(5))), min: chips(min) },
    dealing: random.chance(30) ? "Host" : "Automatic",
    leavingMidHand: random.chance(40) ? "PlaysOn" : "ActedFor",
    runChoiceSeconds: 2 + random.below(10),
    seats: random.chance(50) ? 9 : 2 + random.below(8),
    showdownSeconds: 2 + random.below(15),
    shuffle: "Plain",
    sitOutAfterTimeouts: random.pick([1, 1, 0, 2, 3]) ?? 1,
    table: tableConfig(random),
    timeBankRefill: random.chance(50)
      ? TimeBankRefills.NoRefill()
      : TimeBankRefills.Refill({
          everyHands: 1 + random.below(4),
          seconds: 1 + random.below(10),
          upTo: 5 + random.below(40),
        }),
    timeBankSeconds: random.pick([0, 5, 30]) ?? 0,
    topUps:
      random.pick(["UpToMax", "UpToMax", "BelowMin", "WhenBust"] as const) ??
      "UpToMax",
    turnSeconds: random.pick([0, 10, 20, 30]) ?? 0,
  };
};

const shuffleBytes = (random: Random) => {
  const bytes = new Uint8Array(128);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = random.below(256);
  }

  return bytes;
};

const newCounts = () => ({
  approvals: 0,
  automaticDealCallsRefused: 0,
  bankRefills: 0,
  bankStarts: 0,
  closedDuringHand: 0,
  closedRooms: 0,
  deadBlindsPosted: 0,
  dealsWaitingForHost: 0,
  denials: 0,
  earlyExpiriesRefused: 0,
  entryPosts: 0,
  fixedRunOuts: 0,
  hostChanges: 0,
  hostDeals: 0,
  leaversPlayedOn: 0,
  midHandLeaves: 0,
  queuedAdds: 0,
  rebuys: 0,
  rulesQueued: 0,
  runVotesExpiredWithoutTurnClock: 0,
  seatsBeyondTableRefused: 0,
  settlements: 0,
  showdownConcessions: 0,
  showdownExpiries: 0,
  showdownMucks: 0,
  showdownMucksRefused: 0,
  showdownTables: 0,
  shrinksRefused: 0,
  staleExpiriesRefused: 0,
  straddlesApplied: 0,
  straddlesIgnored: 0,
  tablesShrunk: 0,
  timeoutStreaksEnded: 0,
  timeouts: 0,
  timeoutsKeptIn: 0,
  topUpsRefused: 0,
  transfers: 0,
  unshownWinners: 0,
});

type Counts = ReturnType<typeof newCounts>;

interface Knowledge {
  readonly holes: Map<
    SeatIndex,
    { readonly cards: readonly Card[]; readonly player: PlayerId }
  >;
  readonly shown: Set<number>;
}

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

const occupants = (state: Open) =>
  SEATS.flatMap((seat) => {
    const occupant = state.table.seats[seat];

    return occupant !== undefined && Seats.$is("Occupied")(occupant)
      ? [{ occupant, seat }]
      : [];
  });

const audiencesOf = (state: RoomState): readonly Audience[] =>
  RoomStates.$is("Open")(state)
    ? [
        Audiences.Spectator(),
        ...occupants(state).map(({ occupant, seat }) =>
          Audiences.Seated({ player: occupant.player, seat })
        ),
      ]
    : [Audiences.Spectator()];

const EVERY_CARD = Array.from({ length: 52 }, (_, card) => card);

const tableCards = (table: SeenTableEvent): readonly number[] =>
  Match.value(table).pipe(
    Match.tag("HoleCardsDealt", ({ cards }) => cards),
    Match.tag("StreetDealt", ({ cards }) => cards),
    Match.tag("CardsShown", ({ cards }) => cards),
    Match.tag("RabbitHunted", ({ cards }) => cards),
    Match.tag("HandsTabled", ({ hands }) =>
      hands.flatMap((hand) => hand.cards)
    ),
    Match.tag("ShowdownReached", ({ order }) =>
      order.flatMap((entry) =>
        ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
      )
    ),
    Match.orElse(() => [])
  );

const seenCards = (event: SeenEvent): readonly number[] => {
  if (!SeenEvents.$is("Table")(event)) {
    return [];
  }

  return Object.keys(event.event).includes("deck")
    ? EVERY_CARD
    : tableCards(event.event);
};

const viewCards = (view: RoomView): readonly number[] => {
  if (!RoomViews.$is("Open")(view)) {
    return [];
  }

  const hand = Option.toArray(view.hand).flatMap((current) => [
    ...current.boards.flat(),
    ...current.players.flatMap((player) => player.shown),
  ]);

  const last = Option.toArray(view.lastHand).flatMap((previous) => [
    ...previous.boards.flat(),
    ...previous.rabbit,
    ...previous.yourCards,
    ...previous.shown.flatMap((entry) => entry.cards),
  ]);

  return [...view.holeCards, ...hand, ...last];
};

const allowedFor = (known: Knowledge, audience: Audience) => {
  if (!Audiences.$is("Seated")(audience)) {
    return known.shown;
  }

  const own = known.holes.get(audience.seat);

  return own === undefined || own.player !== audience.player
    ? known.shown
    : new Set([...known.shown, ...own.cards]);
};

const legalAnswer = (legal: LegalActions, random: Random): Action => {
  const roll = random.below(100);

  if (roll < 15) {
    return Actions.Fold();
  }

  if (roll < 60 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 80 && Option.isSome(legal.call)) {
    return Actions.Call();
  }

  return Option.match(legal.raise, {
    onNone: () => (legal.canCheck ? Actions.Check() : Actions.Call()),
    onSome: ({ maxTo, minTo }) =>
      Actions.RaiseTo({
        to: random.chance(60)
          ? minTo
          : chips(minTo + random.below(maxTo - minTo + 1)),
      }),
  });
};

interface NightLog {
  readonly commands: RoomCommand[];
  readonly opening: Opening;
}

interface Run {
  broken: string[];
  readonly counts: Counts;
  hand: Event[];
  handsPlayed: number;
  known: Knowledge;
  readonly log: NightLog;
  readonly net: Map<PlayerId, number>;
  now: number;
  posted: number;
  readonly random: Random;
  state: RoomState;
  straddling: number;
  readonly transfers: Map<number, number>;
}

const fail = (run: Run, detail: string) => {
  run.broken.push(detail);
};

const member = (player: PlayerId) => Actors.Member({ player });

const at = (run: Run) => millis(run.now);

const ownerOf = (open: Open, seat: SeatIndex) => {
  const occupant = open.table.seats[seat];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? Option.some(occupant.player)
    : Option.none();
};

const checkSettlement = (run: Run, open: Open) => {
  const settled = settlement(open);

  if (Result.isFailure(settled)) {
    fail(run, `settlement refused between hands: ${settled.failure._tag}`);

    return;
  }

  const owed = new Map(
    settled.success.balances.map((row) => [row.player, Number(row.net)])
  );

  for (const transfer of settled.success.transfers) {
    owed.set(transfer.from, (owed.get(transfer.from) ?? 0) + transfer.amount);
    owed.set(transfer.to, (owed.get(transfer.to) ?? 0) - transfer.amount);
  }

  if ([...owed.values()].some((left) => left !== 0)) {
    fail(run, "settlement transfers leave someone owing");
  }
};

const learn = (run: Run, event: Event) => {
  if (Events.$is("HandStarted")(event)) {
    run.known = { holes: new Map(), shown: new Set() };

    return;
  }

  if (
    Events.$is("HoleCardsDealt")(event) &&
    RoomStates.$is("Open")(run.state)
  ) {
    Option.map(ownerOf(run.state, event.seat), (player) =>
      run.known.holes.set(event.seat, { cards: event.cards, player })
    );

    return;
  }

  for (const card of publicCards(event)) {
    run.known.shown.add(card);
  }
};

const checkSecrecy = (run: Run, event: RoomEvent) => {
  for (const audience of audiencesOf(run.state)) {
    const allowed = allowedFor(run.known, audience);

    const leaked = seenCards(redact(event, audience)).filter(
      (card) => !allowed.has(card)
    );

    if (leaked.length > 0) {
      fail(
        run,
        `${event._tag} shows ${leaked.join(",")} to ${JSON.stringify(audience)}`
      );
    }
  }
};

const tallyMoney = (run: Run, event: RoomEvent) => {
  if (RoomEvents.$is("BoughtIn")(event)) {
    run.net.set(event.player, (run.net.get(event.player) ?? 0) - event.amount);
  }

  if (RoomEvents.$is("CashedOut")(event)) {
    run.net.set(event.player, (run.net.get(event.player) ?? 0) + event.amount);
  }
};

const movesMoney = (event: RoomEvent) =>
  RoomEvents.$is("BoughtIn")(event) ||
  RoomEvents.$is("CashedOut")(event) ||
  (RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event));

const declaredAt = (before: Open, dealtIn: readonly SeatIndex[]) =>
  dealtIn.filter((seat) =>
    Option.exists(ownerOf(before, seat), (player) =>
      before.straddlers.includes(player)
    )
  ).length;

const countStraddles = (run: Run, before: RoomState, event: Event) => {
  if (Events.$is("HandStarted")(event) && RoomStates.$is("Open")(before)) {
    run.straddling = declaredAt(before, event.dealtIn);
    run.posted = 0;
  }

  if (Events.$is("StraddlePosted")(event)) {
    run.counts.straddlesApplied += 1;
    run.posted += 1;
  }

  if (Events.$is("HoleCardsDealt")(event) && run.straddling > 0) {
    run.counts.straddlesIgnored += run.straddling - run.posted;
    run.straddling = 0;
  }
};

const countClose = (run: Run, event: RoomEvent) => {
  if (!RoomEvents.$is("RoomClosed")(event)) {
    return;
  }

  const { balances, transfers } = event.settlement;

  run.counts.closedRooms += 1;
  run.counts.settlements += 1;
  run.counts.transfers += transfers.length;
  run.transfers.set(
    transfers.length,
    (run.transfers.get(transfers.length) ?? 0) + 1
  );

  for (const row of balances) {
    if (row.net !== (run.net.get(row.player) ?? 0)) {
      fail(
        run,
        `${row.player} nets ${row.net} at close, not ${run.net.get(row.player) ?? 0}`
      );
    }
  }
};

const countShowdown = (run: Run, event: Event) => {
  run.hand = Events.$is("HandStarted")(event) ? [event] : [...run.hand, event];

  if (
    !Events.$is("HandEnded")(event) ||
    !run.hand.some(Events.$is("ShowdownStarted"))
  ) {
    return;
  }

  const first = run.hand.find(
    (choice) =>
      Events.$is("HandTabled")(choice) || Events.$is("HandMucked")(choice)
  );

  const tabled = new Set(
    run.hand.flatMap((choice) =>
      Events.$is("HandTabled")(choice) ? [choice.seat] : []
    )
  );

  run.counts.showdownConcessions +=
    first !== undefined && Events.$is("HandMucked")(first) ? 1 : 0;
  run.counts.unshownWinners += run.hand.some(
    (award) =>
      Events.$is("PotAwarded")(award) &&
      award.winners.some((winner) => !tabled.has(winner.seat))
  )
    ? 1
    : 0;
};

const refusedWinningMuck = (rejection: RoomRejection) =>
  Predicate.isTagged(rejection, "TableRejected") &&
  Predicate.isTagged(rejection.rejection, "WinningHandMustTable");

const REFUSALS: readonly (readonly [
  keyof Counts,
  (rejection: RoomRejection) => boolean,
])[] = [
  ["showdownMucksRefused", refusedWinningMuck],
  ["seatsBeyondTableRefused", Predicate.isTagged("SeatBeyondTable")],
  ["shrinksRefused", Predicate.isTagged("SeatsStillTaken")],
  ["topUpsRefused", Predicate.isTagged("TopUpNotAllowed")],
  ["automaticDealCallsRefused", Predicate.isTagged("DealingIsAutomatic")],
  [
    "dealsWaitingForHost",
    (rejection) =>
      Predicate.isTagged(rejection, "DealNotDue") &&
      rejection.reason === "WaitingForHost",
  ],
];

const tableEventIs = (
  event: RoomEvent,
  matches: (tableEvent: Event) => boolean
) => RoomEvents.$is("Table")(event) && matches(event.event);

const COUNTED: readonly (readonly [
  keyof Counts,
  (event: RoomEvent) => boolean,
])[] = [
  [
    "approvals",
    (event) =>
      RoomEvents.$is("SeatApproved")(event) ||
      RoomEvents.$is("ChipsApproved")(event),
  ],
  [
    "denials",
    (event) =>
      RoomEvents.$is("SeatDenied")(event) ||
      RoomEvents.$is("ChipsDenied")(event),
  ],
  ["queuedAdds", RoomEvents.$is("ChipsQueued")],
  ["midHandLeaves", RoomEvents.$is("LeaveQueued")],
  ["bankStarts", RoomEvents.$is("TimeBankStarted")],
  ["bankRefills", RoomEvents.$is("TimeBankRefilled")],
  ["timeouts", RoomEvents.$is("MarkedAway")],
  ["timeoutsKeptIn", RoomEvents.$is("TimedOut")],
  ["timeoutStreaksEnded", RoomEvents.$is("TimeoutStreakEnded")],
  ["hostChanges", RoomEvents.$is("HostChanged")],
  ["hostDeals", RoomEvents.$is("NextHandCalled")],
  [
    "deadBlindsPosted",
    (event) =>
      tableEventIs(
        event,
        (tableEvent) =>
          Events.$is("BlindPosted")(tableEvent) && tableEvent.dead === true
      ),
  ],
  ["rulesQueued", RoomEvents.$is("RulesQueued")],
  ["closedDuringHand", RoomEvents.$is("CloseQueued")],
  ["showdownTables", (event) => tableEventIs(event, Events.$is("HandTabled"))],
  ["showdownMucks", (event) => tableEventIs(event, Events.$is("HandMucked"))],
];

const seatCount = (state: RoomState) =>
  RoomStates.$is("Open")(state) ? state.settings.seats : 0;

const fixedRuns = (state: RoomState) =>
  RoomStates.$is("Open")(state) && state.table.config.runCount === "Fixed";

const postedToEnter = (before: RoomState, event: RoomEvent) =>
  RoomEvents.$is("Table")(event) &&
  Events.$is("BlindPosted")(event.event) &&
  event.event.blind === "Big" &&
  event.event.dead !== true &&
  RoomStates.$is("Open")(before) &&
  TableStates.$is("InHand")(before.table) &&
  before.table.hand.bigBlindSeat !== event.event.seat;

const observe = (run: Run, before: RoomState, event: RoomEvent) => {
  run.counts.entryPosts += postedToEnter(before, event) ? 1 : 0;
  run.counts.fixedRunOuts +=
    fixedRuns(before) &&
    tableEventIs(
      event,
      (tableEvent) =>
        Events.$is("RunsAgreed")(tableEvent) && tableEvent.runs > 1
    )
      ? 1
      : 0;

  run.counts.tablesShrunk +=
    RoomEvents.$is("SettingsChanged")(event) &&
    event.settings.seats < seatCount(before)
      ? 1
      : 0;

  if (RoomEvents.$is("Table")(event)) {
    learn(run, event.event);
    countStraddles(run, before, event.event);
    countShowdown(run, event.event);
    run.handsPlayed += Events.$is("HandStarted")(event.event) ? 1 : 0;
  }

  for (const found of invariants(run.state)) {
    fail(run, `${event._tag}: ${found.invariant} ${found.detail}`);
  }

  checkSecrecy(run, event);
  tallyMoney(run, event);
  countClose(run, event);

  for (const [name, counted] of COUNTED) {
    run.counts[name] += counted(event) ? 1 : 0;
  }
};

const checkViews = (run: Run, command: RoomCommand) => {
  const { state } = run;

  if (!RoomStates.$is("Open")(state)) {
    return;
  }

  for (const audience of audiencesOf(state)) {
    const allowed = allowedFor(run.known, audience);

    const leaked = viewCards(viewFor(state, audience, at(run))).filter(
      (card) => !allowed.has(card)
    );

    if (leaked.length > 0) {
      fail(
        run,
        `the view after ${command._tag} shows ${leaked.join(",")} to ${JSON.stringify(audience)}`
      );
    }
  }

  const waitingOn = pendingDecisions(state.table);

  if (
    (state.settings.turnSeconds > 0 ||
      PendingDecisions.$is("ChooseRuns")(waitingOn) ||
      PendingDecisions.$is("Show")(waitingOn)) &&
    TableStates.$is("InHand")(state.table) &&
    Option.isNone(nextDeadline(state))
  ) {
    fail(run, `a hand waiting on ${waitingOn._tag} has no deadline`);
  }
};

const leaverActing = (state: RoomState, command: RoomCommand) =>
  RoomCommands.$is("Act")(command) &&
  Actors.$is("Member")(command.by) &&
  RoomStates.$is("Open")(state) &&
  state.queued.leaving.includes(command.by.player);

const send = (run: Run, command: RoomCommand) => {
  run.log.commands.push(command);
  run.now = Math.max(run.now, command.at);

  const decision = decide(run.state, command);

  run.counts.leaversPlayedOn +=
    Result.isSuccess(decision) && leaverActing(run.state, command) ? 1 : 0;

  if (Result.isFailure(decision)) {
    for (const [name, refused] of REFUSALS) {
      run.counts[name] += refused(decision.failure) ? 1 : 0;
    }

    return decision;
  }

  for (const event of decision.success) {
    const before = run.state;

    run.state = evolve(run.state, event);
    observe(run, before, event);
  }

  checkViews(run, command);

  if (
    decision.success.some(movesMoney) &&
    RoomStates.$is("Open")(run.state) &&
    TableStates.$is("BetweenHands")(run.state.table)
  ) {
    checkSettlement(run, run.state);
  }

  return decision;
};

const actFor = (
  run: Run,
  open: Open,
  seat: SeatIndex,
  act: (owner: PlayerId) => RoomCommand
) => {
  Option.map(ownerOf(open, seat), (owner) => send(run, act(owner)));
};

const play = (run: Run, open: Open) => {
  PendingDecisions.$match(pendingDecisions(open.table), {
    Bet: ({ legal }) => {
      run.now += run.random.below(4000);
      actFor(run, open, legal.seat, (owner) =>
        RoomCommands.Act({
          action: legalAnswer(legal, run.random),
          at: at(run),
          by: member(owner),
        })
      );
    },
    ChooseRuns: ({ maxRuns, seats }) => {
      actFor(
        run,
        open,
        run.random.pick(seats) ?? SeatIndexSchema.make(0),
        (owner) =>
          RoomCommands.ChooseRuns({
            at: at(run),
            by: member(owner),
            runs: RunCountSchema.make(1 + run.random.below(maxRuns)),
          })
      );
    },
    Nothing: () => Option.none(),
    Show: ({ choices }) => {
      run.now += run.random.below(3000);
      actFor(run, open, choices.seat, (owner) => {
        const roll = run.random.below(100);
        const by = member(owner);

        if (roll < 10 && !choices.canMuck) {
          return RoomCommands.MuckHand({ at: at(run), by });
        }

        return choices.canMuck && roll < 55
          ? RoomCommands.MuckHand({ at: at(run), by })
          : RoomCommands.TableHand({ at: at(run), by });
      });
    },
  });
};

const expire = (run: Run, open: Open, deadline: Deadline, sent: number) => {
  const stale = run.random.chance(5);

  const decision = send(
    run,
    RoomCommands.ExpireClock({
      at: millis(sent),
      by: Actors.Server(),
      deadline: millis(stale ? deadline.at + 1 : deadline.at),
    })
  );

  run.counts.showdownExpiries +=
    Result.isSuccess(decision) && Deadlines.$is("ShowdownClock")(deadline)
      ? 1
      : 0;
  run.counts.runVotesExpiredWithoutTurnClock +=
    Result.isSuccess(decision) &&
    Deadlines.$is("RunChoiceClock")(deadline) &&
    open.settings.turnSeconds === 0
      ? 1
      : 0;

  if (Result.isFailure(decision)) {
    const refusal = decision.failure._tag;

    run.counts.staleExpiriesRefused +=
      stale && refusal === "NoSuchDeadline" ? 1 : 0;
    run.counts.earlyExpiriesRefused +=
      !stale && refusal === "ClockNotDue" ? 1 : 0;
  }
};

const callTheDeal = (run: Run, open: Open) => {
  if (
    open.game !== "Running" ||
    open.dealCalled ||
    TableStates.$is("InHand")(open.table)
  ) {
    return;
  }

  send(
    run,
    run.random.chance(80)
      ? RoomCommands.DealNextHand({ at: at(run), by: member(open.host) })
      : RoomCommands.Deal({
          at: at(run),
          by: Actors.Server(),
          shuffleBytes: shuffleBytes(run.random),
        })
  );
};

const serve = (run: Run, open: Open) => {
  if (Option.isNone(nextDeadline(open)) && open.settings.dealing === "Host") {
    callTheDeal(run, open);
  }

  Option.map(nextDeadline(open), (deadline) => {
    const style = run.random.below(10);

    const offset =
      style === 0
        ? -1 - run.random.below(2000)
        : run.random.below(style < 6 ? 1 : 3000);

    const sent = Math.max(run.now, deadline.at + offset);

    if (Deadlines.$is("DealDue")(deadline)) {
      send(
        run,
        RoomCommands.Deal({
          at: millis(sent),
          by: Actors.Server(),
          shuffleBytes: shuffleBytes(run.random),
        })
      );
    } else {
      expire(run, open, deadline, sent);
    }
  });
};

const sitSomeone = (run: Run, open: Open, standing: readonly PlayerId[]) => {
  const seated = new Set(occupants(open).map((entry) => entry.seat));
  const seat = run.random.pick(SEATS.filter((each) => !seated.has(each)));
  const { max, min } = open.settings.buyIn;

  if (seat !== undefined) {
    send(
      run,
      RoomCommands.RequestSeat({
        at: at(run),
        buyIn: chips(min + run.random.below(max - min + 1)),
        by: member(run.random.pick(standing) ?? HOST),
        seat,
      })
    );
  }
};

const answerRequest = (run: Run, open: Open) => {
  const [seatRequest] = open.requests.seats;
  const [chipRequest] = open.requests.chips;
  const by = member(open.host);
  const approve = run.random.chance(75);

  if (seatRequest !== undefined) {
    const { player } = seatRequest;

    send(
      run,
      approve
        ? RoomCommands.ApproveSeat({ at: at(run), by, player })
        : RoomCommands.DenySeat({ at: at(run), by, player })
    );
  } else if (chipRequest !== undefined) {
    const { player } = chipRequest;

    send(
      run,
      approve
        ? RoomCommands.ApproveChips({ at: at(run), by, player })
        : RoomCommands.DenyChips({ at: at(run), by, player })
    );
  }
};

const showOrHunt = (run: Run, open: Open, player: PlayerId) => {
  const lastHand = TableStates.$is("BetweenHands")(open.table)
    ? Option.getOrUndefined(open.table.lastHand)
    : undefined;

  const shower = lastHand?.players.find((each) => each.player === player);

  if (shower !== undefined && run.random.chance(50)) {
    send(
      run,
      RoomCommands.ShowCards({
        at: at(run),
        by: member(player),
        cards: ShownCardsSchema.make(
          shower.holeCards.slice(0, 1 + run.random.below(2))
        ),
      })
    );
  } else {
    send(run, RoomCommands.RabbitHunt({ at: at(run), by: member(player) }));
  }
};

const seatedMove = (run: Run, open: Open, seat: SeatIndex, roll: number) => {
  const occupant = open.table.seats[seat];

  if (occupant === undefined || !Seats.$is("Occupied")(occupant)) {
    return;
  }

  const { player, sittingOut, stack } = occupant;
  const when = at(run);

  if (roll < 9) {
    const room = open.settings.buyIn.max - stack;

    if (room > 0) {
      const decision = send(
        run,
        RoomCommands.RequestChips({
          amount: chips(1 + run.random.below(room)),
          at: when,
          by: member(player),
        })
      );

      run.counts.rebuys += Result.isSuccess(decision) && stack === 0 ? 1 : 0;
    }
  } else if (roll < 10) {
    send(run, RoomCommands.LeaveSeat({ at: when, by: member(player) }));
  } else if (roll < 11) {
    send(run, RoomCommands.LeaveRoom({ at: when, by: member(player) }));
  } else if (roll < 13) {
    send(
      run,
      sittingOut
        ? RoomCommands.SitIn({ at: when, by: member(player) })
        : RoomCommands.SitOut({ at: when, by: member(player) })
    );
  } else if (roll < 14) {
    send(
      run,
      RoomCommands.ChoosePosting({
        at: when,
        by: member(player),
        post: run.random.chance(50),
      })
    );
  } else if (roll < 15) {
    send(
      run,
      RoomCommands.DeclareStraddle({
        at: when,
        by: member(player),
        on: run.random.chance(70),
      })
    );
  } else {
    showOrHunt(run, open, player);
  }
};

const churn = (run: Run, open: Open) => {
  const roll = run.random.below(16);
  const seated = occupants(open);
  const members = open.members.map((each) => each.player);

  const standing = members.filter(
    (player) => !seated.some(({ occupant }) => occupant.player === player)
  );

  if (members.length < 3) {
    send(
      run,
      RoomCommands.Join({
        at: at(run),
        avatar: "",
        by: member(run.random.pick(POOL) ?? HOST),
        name: "late",
      })
    );
  } else if (roll < 4 && standing.length > 0) {
    sitSomeone(run, open, standing);
  } else if (roll < 6) {
    answerRequest(run, open);
  } else {
    Option.map(Option.fromUndefinedOr(run.random.pick(seated)), ({ seat }) => {
      seatedMove(run, open, seat, roll);
    });
  }
};

const hostMove = (run: Run, open: Open) => {
  const roll = run.random.below(10);
  const by = member(open.host);
  const target = run.random.pick(occupants(open))?.occupant.player;

  const other = run.random.pick(
    open.members.filter((each) => each.player !== open.host)
  )?.player;

  if (roll < 1 && open.settings.dealing === "Automatic") {
    send(run, RoomCommands.DealNextHand({ at: at(run), by }));
  } else if (roll < 3) {
    send(
      run,
      RoomCommands.ChangeSettings({
        at: at(run),
        by,
        settings: roomSettings(run.random),
      })
    );
  } else if (roll < 4) {
    send(run, RoomCommands.PauseGame({ at: at(run), by }));
  } else if (roll < 7) {
    send(run, RoomCommands.StartGame({ at: at(run), by }));
  } else if (roll < 8 && other !== undefined) {
    send(run, RoomCommands.TransferHost({ at: at(run), by, to: other }));
  } else if (target !== undefined) {
    send(
      run,
      run.random.chance(50)
        ? RoomCommands.ActForSeat({ at: at(run), by, player: target })
        : RoomCommands.RemoveFromSeat({ at: at(run), by, player: target })
    );
  }
};

const mischief = (run: Run, open: Open) => {
  const outsider = member(
    run.random.pick(POOL.filter((player) => player !== open.host)) ?? HOST
  );

  const victim = run.random.pick(occupants(open))?.occupant.player ?? HOST;
  const when = at(run);

  const command = run.random.pick([
    RoomCommands.ApproveSeat({ at: when, by: outsider, player: victim }),
    RoomCommands.Deal({
      at: when,
      by: outsider,
      shuffleBytes: shuffleBytes(run.random),
    }),
    RoomCommands.ExpireClock({ at: when, by: outsider, deadline: when }),
    RoomCommands.CloseRoom({ at: when, by: outsider }),
    RoomCommands.ActForSeat({ at: when, by: outsider, player: victim }),
    RoomCommands.RemoveFromSeat({ at: when, by: outsider, player: victim }),
  ]);

  if (command !== undefined && Result.isSuccess(send(run, command))) {
    fail(
      run,
      `${command._tag} from ${JSON.stringify(outsider)}, who is not the host or the server, was accepted`
    );
  }
};

const step = (run: Run, open: Open) => {
  const roll = run.random.below(100);

  const waitingOn = pendingDecisions(open.table);
  const pending = !PendingDecisions.$is("Nothing")(waitingOn);

  const clocked =
    open.settings.turnSeconds > 0 ||
    PendingDecisions.$is("ChooseRuns")(waitingOn) ||
    PendingDecisions.$is("Show")(waitingOn);

  if (roll < 55 && pending && !(clocked && run.random.chance(30))) {
    play(run, open);
  } else if (roll < 70) {
    serve(run, open);
  } else if (roll < 90) {
    churn(run, open);
  } else if (roll < 95) {
    hostMove(run, open);
  } else {
    mischief(run, open);
  }
};

const closeTheNight = (run: Run) => {
  if (!RoomStates.$is("Open")(run.state)) {
    return;
  }

  const { host } = run.state;

  send(run, RoomCommands.CloseRoom({ at: at(run), by: member(host) }));

  for (
    let guard = 0;
    guard < 500 && RoomStates.$is("Open")(run.state);
    guard += 1
  ) {
    const open = run.state;

    const seat = PendingDecisions.$match(pendingDecisions(open.table), {
      Bet: ({ legal }) => Option.some(legal.seat),
      ChooseRuns: ({ seats }) => Option.fromUndefinedOr(seats[0]),
      Nothing: () => Option.none(),
      Show: ({ choices }) => Option.some(choices.seat),
    });

    const owner = seat.pipe(
      Option.flatMap((pendingSeat) => ownerOf(open, pendingSeat))
    );

    if (
      Option.isNone(owner) ||
      Result.isFailure(
        send(
          run,
          RoomCommands.ActForSeat({
            at: at(run),
            by: member(open.host),
            player: owner.value,
          })
        )
      )
    ) {
      return;
    }
  }
};

const STEPS_PER_NIGHT = 40_000;

const playNight = (run: Run, handsTonight: number) => {
  for (const player of POOL.slice(1, 3 + run.random.below(POOL.length - 2))) {
    send(
      run,
      RoomCommands.Join({
        at: at(run),
        avatar: "",
        by: member(player),
        name: player,
      })
    );
  }

  send(run, RoomCommands.StartGame({ at: at(run), by: member(HOST) }));

  for (
    let steps = 0;
    steps < STEPS_PER_NIGHT && run.broken.length === 0;
    steps += 1
  ) {
    const { state } = run;

    if (!RoomStates.$is("Open")(state) || run.handsPlayed >= handsTonight) {
      break;
    }

    step(run, state);
  }

  if (run.broken.length === 0) {
    closeTheNight(run);
  }
};

interface Played {
  readonly counts: Counts;
  readonly hands: number;
  readonly nights: number;
  readonly transfers: ReadonlyMap<number, number>;
}

const playNights = (
  seed: number,
  handsWanted: number
): Result.Result<
  Played,
  { readonly detail: string; readonly log: NightLog; readonly night: number }
> => {
  const random = randomSource(seed);
  const counts = newCounts();
  const transfers = new Map<number, number>();
  let hands = 0;
  let nights = 0;

  while (hands < handsWanted) {
    nights += 1;

    const opening: Opening = {
      at: millis(0),
      avatar: "host",
      code: nightCode(nights),
      host: HOST,
      name: "host",
      settings: roomSettings(random),
    };

    const run: Run = {
      broken: [],
      counts,
      hand: [],
      handsPlayed: 0,
      known: { holes: new Map(), shown: new Set() },
      log: { commands: [], opening },
      net: new Map(),
      now: 0,
      posted: 0,
      random,
      state: replay(openRoom(opening)),
      straddling: 0,
      transfers,
    };

    playNight(run, 30 + random.below(150));
    hands += run.handsPlayed;

    const [detail] = run.broken;

    if (detail !== undefined) {
      return Result.fail({ detail, log: run.log, night: nights });
    }
  }

  return Result.succeed({ counts, hands, nights, transfers });
};

const encodeCommand = Schema.encodeSync(Schema.toCodecJson(RoomCommandSchema));

const program = Effect.gen(function* soak() {
  const seed = argument("seed", DEFAULT_SEED);
  const wanted = argument("hands", DEFAULT_HANDS);
  const started = performance.now();
  const outcome = playNights(seed, wanted);
  const seconds = (performance.now() - started) / 1000;

  if (Result.isFailure(outcome)) {
    const { detail, log, night } = outcome.failure;

    yield* Console.error(`opening: ${JSON.stringify(log.opening)}`);
    yield* Console.error(
      `commands since the room opened:\n${JSON.stringify(log.commands.map((command) => encodeCommand(command)))}`
    );

    return yield* new SoakViolation({ detail, night, seed });
  }

  const { counts, hands, nights, transfers } = outcome.success;

  yield* Console.log(
    `seed ${seed}: ${nights} nights, ${hands} hands in ${seconds.toFixed(1)} s, ${Math.round(hands / seconds)} hands per second on one thread`
  );

  for (const [name, count] of Object.entries(counts)) {
    yield* Console.log(`${name.padEnd(31)} ${String(count).padStart(9)}`);
  }

  for (const [made, settled] of [...transfers].toSorted(
    ([left], [right]) => left - right
  )) {
    yield* Console.log(
      `settlements with ${String(made).padStart(2)} transfers ${String(settled).padStart(7)}`
    );
  }

  const gaps = Object.entries(counts).filter(([, count]) => count === 0);

  if (gaps.length > 0) {
    return yield* new SoakViolation({
      detail: `never exercised ${gaps.map(([name]) => name).join(", ")}`,
      night: nights,
      seed,
    });
  }

  return yield* Console.log(
    "every invariant, the money properties, and secrecy held after every event"
  );
});

await Effect.runPromise(program);
