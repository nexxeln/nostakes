import {
  Actions,
  Antes,
  CHIP_LIMIT,
  ChipsSchema,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  Phases,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShowdownEntries,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
  decide,
  evolve,
  initialTable,
  invariants,
  pendingDecisions,
} from "@nostakes/engine";
import type {
  Ante,
  Command,
  Event,
  LegalActions,
  PendingDecision,
  Rejection,
  TableConfig,
  TableState,
} from "@nostakes/engine";
import { Console, Effect, Option, Predicate, Result, Schema } from "effect";

const DEFAULT_SEED = 20_261_110;

const DEFAULT_HANDS = 1_000_000;

const HANDS_PER_TABLE = 400;

const DEEP_STACK = 900_719_925_474_099;

const DEEP_POT = 2 ** 50;

class SimulationViolation extends Schema.TaggedError<
  SimulationViolation,
  { readonly brand: unique symbol }
>()("SimulationViolation", {
  detail: Schema.String,
  hand: Schema.Int,
  seed: Schema.Int,
}) {
  override get message() {
    return `Seed ${this.seed} broke the table on hand ${this.hand}: ${this.detail}. Rerun with --seed ${this.seed} to reproduce. The command log printed above replays the failing table from initialTable with any config, because it starts with the table's ChangeRules.`;
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

const chipCount = (amount: number) => ChipsSchema.make(amount);

const seatAt = (index: number) => SeatIndexSchema.make(index);

const runCount = (count: number) => RunCountSchema.make(count);

const anteOf = (random: Random, bigBlind: number): Ante => {
  const kind = random.below(3);

  if (kind === 0) {
    return Antes.NoAnte();
  }

  const amount = chipCount(1 + random.below(bigBlind));

  return kind === 1
    ? Antes.EveryPlayer({ amount })
    : Antes.BigBlindPays({ amount });
};

const randomConfig = (random: Random): TableConfig => {
  const smallBlind = 1 + random.below(5);
  const bigBlind = smallBlind * (1 + random.below(2));

  return TableConfigSchema.make({
    allInHands: random.chance(40) ? "Hidden" : "FaceUp",
    ante: anteOf(random, bigBlind),
    bigBlind: chipCount(bigBlind),
    maxRuns: runCount(1 + random.below(4)),
    rabbitHunt: random.chance(50),
    runCount: random.chance(25) ? "Fixed" : "Vote",
    showdown: random.chance(50) ? "Interactive" : "Automatic",
    smallBlind: chipCount(smallBlind),
    straddle: {
      button: random.chance(50),
      underTheGun: random.chance(60) ? 2 : random.below(2),
    },
  });
};

const ORDERED_DECK = Schema.decodeSync(DeckSchema)(
  Array.from({ length: 52 }, (_, index) => index)
);

const shuffledDeck = (random: Random) => {
  const cards = [...ORDERED_DECK];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = random.below(index + 1);
    const held = cards[index];
    const swapped = cards[other];

    if (held !== undefined && swapped !== undefined) {
      cards[index] = swapped;
      cards[other] = held;
    }
  }

  return DeckSchema.make(cards, { disableChecks: true });
};

const occupied = (state: TableState) =>
  state.seats.flatMap((seat, index) =>
    Seats.$is("Occupied")(seat) ? [{ index, seat }] : []
  );

const empties = (state: TableState) =>
  state.seats.flatMap((seat, index) =>
    Seats.$is("Empty")(seat) ? [index] : []
  );

const dealtIn = (state: TableState) =>
  occupied(state)
    .filter(({ seat }) => !seat.sittingOut && seat.stack > 0)
    .map(({ index }) => index);

const plannedStraddles = (state: TableState, random: Random) => {
  const seats = dealtIn(state);

  const previous = TableStates.$is("BetweenHands")(state)
    ? Option.getOrElse(state.button, () => -1)
    : -1;

  const after = (from: number) => [
    ...seats.filter((index) => index > from),
    ...seats.filter((index) => index <= from),
  ];

  const button = after(previous)[0] ?? 0;
  const small = seats.length === 2 ? button : (after(button)[0] ?? 0);
  const afterBig = after(after(small)[0] ?? 0);
  const line = afterBig.slice(0, afterBig.indexOf(button) + 1);
  const roll = random.below(100);

  if (roll < 12) {
    return line.slice(0, 1);
  }

  if (roll < 30) {
    return line.slice(0, 2);
  }

  return roll < 33 ? [button] : [];
};

const legalAnswer = (legal: LegalActions, random: Random) => {
  const roll = random.below(100);

  if (roll < 14) {
    return Actions.Fold();
  }

  if (roll < 60 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 75 && Option.isSome(legal.call)) {
    return Actions.Call();
  }

  if (Option.isSome(legal.raise)) {
    const { maxTo, minTo } = legal.raise.value;
    const style = random.below(10);

    if (style < 4) {
      return Actions.RaiseTo({ to: minTo });
    }

    return Actions.RaiseTo({
      to:
        style < 7 ? maxTo : chipCount(minTo + random.below(maxTo - minTo + 1)),
    });
  }

  return legal.canCheck ? Actions.Check() : Actions.Call();
};

const answer = (state: TableState, random: Random): Option.Option<Command> =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        Commands.Act({ action: legalAnswer(legal, random), seat: legal.seat })
      ),
    ChooseRuns: ({ maxRuns, seats }) =>
      Option.some(
        Commands.ChooseRuns({
          runs: random.chance(65)
            ? maxRuns
            : runCount(1 + random.below(maxRuns)),
          seat: seats[0] ?? seatAt(0),
        })
      ),
    Nothing: () => Option.none(),
    Show: ({ choices }) =>
      Option.some(Commands.TableHand({ seat: choices.seat })),
  });

type PendingShow = Extract<PendingDecision, { readonly _tag: "Show" }>;

interface ShowdownChoice {
  readonly byClock: boolean;
  readonly command: Command;
}

const SILENT_PERCENT = 25;

const MUCK_PERCENT = 45;

const showdownChoice = (turn: PendingShow, random: Random): ShowdownChoice => {
  const { seat } = turn.choices;

  if (random.chance(SILENT_PERCENT)) {
    return {
      byClock: true,
      command: turn.beatenInEveryPot
        ? Commands.MuckHand({ seat })
        : Commands.TableHand({ seat }),
    };
  }

  return {
    byClock: false,
    command:
      turn.choices.canMuck && random.chance(MUCK_PERCENT)
        ? Commands.MuckHand({ seat })
        : Commands.TableHand({ seat }),
  };
};

const illegalShowdownChoice = (turn: PendingShow, random: Random) => {
  const { canMuck, seat } = turn.choices;
  const other = seatAt((seat + 1 + random.below(8)) % 9);

  if (!canMuck) {
    return Commands.MuckHand({ seat });
  }

  return random.chance(50)
    ? Commands.TableHand({ seat: other })
    : Commands.MuckHand({ seat: other });
};

const illegalInHand = (state: TableState, random: Random): Command => {
  const pending = pendingDecisions(state);
  const roll = random.below(4);

  if (PendingDecisions.$is("Show")(pending) && roll < 2) {
    return illegalShowdownChoice(pending, random);
  }

  if (PendingDecisions.$is("Bet")(pending) && roll === 0) {
    return Commands.Act({
      action: Actions.Call(),
      seat: seatAt((pending.legal.seat + 1 + random.below(8)) % 9),
    });
  }

  if (PendingDecisions.$is("Bet")(pending) && roll === 1) {
    return Commands.Act({
      action: Actions.RaiseTo({
        to: Option.match(pending.legal.raise, {
          onNone: () => chipCount(1_000_000),
          onSome: (range) => chipCount(range.maxTo + 1),
        }),
      }),
      seat: pending.legal.seat,
    });
  }

  if (roll === 2 && TableStates.$is("InHand")(state)) {
    return Commands.StandUp({
      seat: random.pick(state.hand.players)?.seat ?? seatAt(0),
    });
  }

  return Commands.ChangeRules({ config: randomConfig(random) });
};

const chipsOnTable = (state: TableState) => {
  let total = 0;

  if (TableStates.$is("InHand")(state)) {
    total += state.hand.deadMoney;

    for (const player of state.hand.players) {
      total += player.committedTotal - player.won;
    }
  }

  for (const seat of state.seats) {
    total += Seats.$is("Occupied")(seat) ? seat.stack : 0;
  }

  return total;
};

const pastTheLimit = (
  state: TableState,
  random: Random,
  nextPlayer: () => string
): Option.Option<Command> => {
  const onTable = chipsOnTable(state);
  const empty = random.pick(empties(state));
  const seated = random.pick(occupied(state));

  if (onTable === 0) {
    return Option.none();
  }

  if (random.chance(30)) {
    return Option.some(
      Commands.ChangeRules({
        config: TableConfigSchema.make({
          ...randomConfig(random),
          bigBlind: chipCount(2 ** 52),
          straddle: { button: true, underTheGun: 1 + random.below(2) },
        }),
      })
    );
  }

  const tooMany = chipCount(CHIP_LIMIT - onTable + 1);

  if (empty !== undefined && random.chance(50)) {
    return Option.some(
      Commands.SitDown({
        buyIn: tooMany,
        player: PlayerIdSchema.make(nextPlayer()),
        seat: seatAt(empty),
      })
    );
  }

  return Option.some(
    Commands.AddChips({ amount: tooMany, seat: seatAt(seated?.index ?? 0) })
  );
};

const cappedCall = (before: TableState, event: Event) => {
  if (
    !Events.$is("Called")(event) ||
    event.allIn ||
    !TableStates.$is("InHand")(before) ||
    !Phases.$is("Betting")(before.hand.phase)
  ) {
    return false;
  }

  const committed =
    before.hand.players.find((player) => player.seat === event.seat)
      ?.committedThisStreet ?? 0;

  return event.amount < before.hand.phase.currentBet - committed;
};

const closesStreet = (event: Event) =>
  Events.$is("Folded")(event) ||
  Events.$is("Checked")(event) ||
  Events.$is("Called")(event) ||
  Events.$is("RaisedTo")(event) ||
  Events.$is("HoleCardsDealt")(event);

const skippedDecision = (after: TableState, event: Event) => {
  if (
    !closesStreet(event) ||
    !TableStates.$is("InHand")(after) ||
    after.hand.street !== "Preflop" ||
    Phases.$is("Betting")(after.hand.phase) ||
    after.hand.players.some((player) => player.holeCards.length === 0)
  ) {
    return false;
  }

  const bet = after.hand.straddles.at(-1)?.amount ?? after.config.bigBlind;

  const live = after.hand.players.filter(
    (player) => player.status !== "Folded"
  );

  return (
    live.length > 1 &&
    live.some(
      (player) => player.status === "Active" && player.committedThisStreet < bet
    )
  );
};

const churn = (state: TableState, random: Random, nextPlayer: () => string) => {
  const seated = occupied(state);
  const roll = random.below(4);
  const somebody = random.pick(seated);

  if (roll === 0 && empties(state).length > 0) {
    return Commands.SitDown({
      buyIn: chipCount(20 + random.below(400)),
      player: PlayerIdSchema.make(nextPlayer()),
      seat: seatAt(random.pick(empties(state)) ?? 0),
    });
  }

  if (somebody === undefined) {
    return Commands.ChangeRules({ config: randomConfig(random) });
  }

  if (roll === 1 && seated.length > 2) {
    return Commands.StandUp({ seat: seatAt(somebody.index) });
  }

  if (roll === 2) {
    return Commands.SetSittingOut({
      seat: seatAt(somebody.index),
      sittingOut: !somebody.seat.sittingOut && random.chance(30),
    });
  }

  return Commands.AddChips({
    amount: chipCount(10 + random.below(300)),
    seat: seatAt(somebody.index),
  });
};

const afterHand = (
  state: TableState,
  random: Random
): Option.Option<Command> => {
  if (!TableStates.$is("BetweenHands")(state)) {
    return Option.none();
  }

  return state.lastHand.pipe(
    Option.flatMap((lastHand) => {
      const shower = random.pick(lastHand.players);

      if (shower === undefined) {
        return Option.none();
      }

      if (random.chance(40)) {
        return Option.some(Commands.RabbitHunt({ seat: shower.seat }));
      }

      const hidden = shower.holeCards.filter(
        (card) => !shower.publicCards.includes(card)
      );

      const cards = hidden.filter(() => random.chance(50));

      return hidden.length === 0
        ? Option.none()
        : Option.some(
            Commands.ShowCards({
              cards: ShownCardsSchema.make(
                cards.length > 0 ? cards : hidden.slice(0, 1)
              ),
              seat: shower.seat,
            })
          );
    })
  );
};

const bankrollChange = (event: Event) => {
  if (Events.$is("PlayerSat")(event)) {
    return event.buyIn;
  }

  if (Events.$is("ChipsAdded")(event)) {
    return event.amount;
  }

  return Events.$is("PlayerStood")(event) ? 0 - event.stack : 0;
};

const newCounts = () => ({
  bigBlindAntes: 0,
  boardsRunFour: 0,
  boardsRunThree: 0,
  boardsRunTwo: 0,
  buttonStraddles: 0,
  cappedCalls: 0,
  chipLimitRejected: 0,
  clockShowdownsLikeAutomatic: 0,
  deadDecisionsSkipped: 0,
  deepPots: 0,
  doubleStraddles: 0,
  everyPlayerAntes: 0,
  fixedRunOuts: 0,
  hiddenRunOuts: 0,
  hiddenShowdownWinners: 0,
  illegalRejected: 0,
  interactiveShowdowns: 0,
  mucks: 0,
  mustTableRefused: 0,
  noAntes: 0,
  oddChips: 0,
  oneRunCutShort: 0,
  rabbitHunts: 0,
  runOuts: 0,
  shortAllIns: 0,
  showdownConcessions: 0,
  showdownsEndedOnClock: 0,
  sidePots: 0,
  singleStraddles: 0,
  splitPots: 0,
  straddleLimitRejected: 0,
  voluntaryShows: 0,
  walks: 0,
});

type Counts = ReturnType<typeof newCounts>;

interface Broken {
  readonly detail: string;
  readonly hand: number;
  readonly log: readonly Command[];
}

interface Finished {
  readonly counts: Counts;
  readonly hands: number;
}

interface Seen {
  readonly cappedCall: boolean;
  readonly skippedDecision: boolean;
}

const countFixedCases = (
  counts: Counts,
  hand: readonly Event[],
  seen: Seen
) => {
  const runs = hand.find(Events.$is("RunsAgreed"))?.runs ?? 0;
  const chosen = hand.filter(Events.$is("RunsChosen")).length;
  const tabled = hand.find(Events.$is("HandsTabled"))?.hands.length ?? 0;

  counts.oneRunCutShort += runs === 1 && chosen > 0 && chosen < tabled ? 1 : 0;
  counts.cappedCalls += seen.cappedCall ? 1 : 0;
  counts.deadDecisionsSkipped += seen.skippedDecision ? 1 : 0;
  counts.deepPots += hand.some(
    (event) => Events.$is("PotAwarded")(event) && event.amount > DEEP_POT
  )
    ? 1
    : 0;
};

const countInteractive = (counts: Counts, hand: readonly Event[]) => {
  if (!hand.some(Events.$is("ShowdownStarted"))) {
    return;
  }

  const firstTabled = hand.findIndex(Events.$is("HandTabled"));
  const firstMucked = hand.findIndex(Events.$is("HandMucked"));

  const tabled = new Set(
    hand.flatMap((event) =>
      Events.$is("HandTabled")(event) ? [event.seat] : []
    )
  );

  counts.interactiveShowdowns += 1;
  counts.showdownConcessions +=
    firstMucked !== -1 && (firstTabled === -1 || firstMucked < firstTabled)
      ? 1
      : 0;
  counts.hiddenShowdownWinners += hand.some(
    (event) =>
      Events.$is("PotAwarded")(event) &&
      event.winners.some((winner) => !tabled.has(winner.seat))
  )
    ? 1
    : 0;
};

const countRunOuts = (counts: Counts, hand: readonly Event[]) => {
  const runs = hand.find(Events.$is("RunsAgreed"))?.runs ?? 0;

  counts.runOuts += runs > 0 ? 1 : 0;
  counts.fixedRunOuts +=
    runs > 1 && !hand.some(Events.$is("RunsChosen")) ? 1 : 0;
  counts.hiddenRunOuts +=
    runs > 0 && !hand.some(Events.$is("HandsTabled")) ? 1 : 0;
  counts.boardsRunTwo += runs === 2 ? 1 : 0;
  counts.boardsRunThree += runs === 3 ? 1 : 0;
  counts.boardsRunFour += runs === 4 ? 1 : 0;
};

const countHand = (counts: Counts, hand: readonly Event[], seen: Seen) => {
  const started = hand.find(Events.$is("HandStarted"));
  const straddles = hand.filter(Events.$is("StraddlePosted"));
  const awards = hand.filter(Events.$is("PotAwarded"));

  countFixedCases(counts, hand, seen);

  const acted = hand.some(
    (event) => Events.$is("Called")(event) || Events.$is("RaisedTo")(event)
  );

  counts.singleStraddles += straddles.length === 1 ? 1 : 0;
  counts.doubleStraddles += straddles.length >= 2 ? 1 : 0;
  counts.buttonStraddles += straddles.some(
    (straddle) => straddle.seat === started?.button
  )
    ? 1
    : 0;
  counts.sidePots += awards.some((award) => award.pot > 1) ? 1 : 0;
  counts.splitPots += awards.some((award) => award.winners.length > 1) ? 1 : 0;
  counts.oddChips += awards.some(
    (award) => new Set(award.winners.map((winner) => winner.amount)).size > 1
  )
    ? 1
    : 0;
  counts.shortAllIns += hand.some(
    (event) => Events.$is("RaisedTo")(event) && event.allIn && !event.full
  )
    ? 1
    : 0;
  countRunOuts(counts, hand);
  counts.walks +=
    !acted &&
    !hand.some(Events.$is("StreetDealt")) &&
    awards.some((award) => award.winners[0]?.seat === started?.bigBlindSeat)
      ? 1
      : 0;
  counts.mucks +=
    hand
      .filter(Events.$is("ShowdownReached"))
      .flatMap((showdown) => showdown.order)
      .filter(ShowdownEntries.$is("Mucked")).length +
    hand.filter(Events.$is("HandMucked")).length;
  countInteractive(counts, hand);
  counts.voluntaryShows += hand.filter(Events.$is("CardsShown")).length;
  counts.rabbitHunts += hand.filter(Events.$is("RabbitHunted")).length;
};

const awardsText = (events: readonly Event[]) =>
  JSON.stringify(events.filter(Events.$is("PotAwarded")));

const seatsText = (seats: readonly number[]) =>
  seats.toSorted((left, right) => left - right).join(",");

const sameShowdown = (
  interactive: readonly Event[],
  automatic: readonly Event[]
) => {
  const order = automatic
    .filter(Events.$is("ShowdownReached"))
    .flatMap((showdown) => showdown.order);

  const tabled = interactive.flatMap((event) =>
    Events.$is("HandTabled")(event) ? [event.seat] : []
  );

  const mucked = interactive.flatMap((event) =>
    Events.$is("HandMucked")(event) ? [event.seat] : []
  );

  const shown = order.flatMap((entry) =>
    ShowdownEntries.$is("Shown")(entry) ? [entry.seat] : []
  );

  const hidden = order.flatMap((entry) =>
    ShowdownEntries.$is("Mucked")(entry) ? [entry.seat] : []
  );

  return (
    awardsText(interactive) === awardsText(automatic) &&
    seatsText(tabled) === seatsText(shown) &&
    seatsText(mucked) === seatsText(hidden)
  );
};

const automaticOutcome = (state: TableState, command: Command) =>
  Result.getOrElse(
    decide(
      { ...state, config: { ...state.config, showdown: "Automatic" } },
      command
    ),
    (): readonly Event[] => []
  );

const countRejection = (
  counts: Counts,
  rejection: Rejection,
  mustReject: boolean
) => {
  counts.illegalRejected += mustReject ? 1 : 0;
  counts.mustTableRefused += Predicate.isTagged(
    rejection,
    "WinningHandMustTable"
  )
    ? 1
    : 0;
  counts.chipLimitRejected += Predicate.isTagged(rejection, "ChipLimitExceeded")
    ? 1
    : 0;
  counts.straddleLimitRejected += Predicate.isTagged(
    rejection,
    "StraddleAboveChipLimit"
  )
    ? 1
    : 0;
};

const noticed = (
  seen: Seen,
  before: TableState,
  event: Event,
  after: TableState
): Seen => ({
  cappedCall: seen.cappedCall || cappedCall(before, event),
  skippedDecision: seen.skippedDecision || skippedDecision(after, event),
});

const countAnte = (counts: Counts, config: TableConfig) => {
  Antes.$match(config.ante, {
    BigBlindPays: () => {
      counts.bigBlindAntes += 1;
    },
    EveryPlayer: () => {
      counts.everyPlayerAntes += 1;
    },
    NoAnte: () => {
      counts.noAntes += 1;
    },
  });
};

const simulate = (
  seed: number,
  handsWanted: number
): Result.Result<Finished, Broken> => {
  const random = randomSource(seed);
  const counts = newCounts();
  let players = 0;

  const nextPlayer = () => {
    players += 1;

    return `player-${players}`;
  };

  let hands = 0;
  let state = initialTable(randomConfig(random));
  let bankroll = 0;
  let log: Command[] = [];
  let hand: Event[] = [];
  let seen: Seen = { cappedCall: false, skippedDecision: false };
  let automaticTwin: readonly Event[] = [];
  let everyChoiceByClock = true;
  let lastChoiceByClock = false;

  const violation = (detail: string): Result.Result<boolean, Broken> =>
    Result.fail({ detail, hand: hands, log });

  const apply = (
    command: Command,
    mustReject: boolean
  ): Result.Result<boolean, Broken> => {
    const decision = decide(state, command);

    log.push(command);

    if (Result.isFailure(decision)) {
      countRejection(counts, decision.failure, mustReject);

      return Result.succeed(false);
    }

    if (mustReject) {
      return violation(`accepted an illegal ${command._tag}`);
    }

    if (decision.success.some(Events.$is("ShowdownStarted"))) {
      automaticTwin = automaticOutcome(state, command);
      everyChoiceByClock = true;
    }

    for (const event of decision.success) {
      const before = state;

      state = evolve(state, event);
      bankroll += bankrollChange(event);

      if (Events.$is("HandStarted")(event)) {
        countHand(counts, hand, seen);
        countAnte(counts, state.config);
        hand = [];
        seen = { cappedCall: false, skippedDecision: false };
        hands += 1;
      }

      hand.push(event);
      seen = noticed(seen, before, event, state);

      if (
        Events.$is("HandEnded")(event) &&
        hand.some(Events.$is("ShowdownStarted"))
      ) {
        counts.showdownsEndedOnClock += lastChoiceByClock ? 1 : 0;

        if (everyChoiceByClock && !sameShowdown(hand, automaticTwin)) {
          return violation(
            "a showdown where the clock made every choice ended differently from the same hand played Automatic"
          );
        }

        counts.clockShowdownsLikeAutomatic += everyChoiceByClock ? 1 : 0;
      }

      const broken = invariants(state);

      if (broken.length > 0) {
        return violation(
          `${event._tag}: ${broken.map((found) => `${found.invariant} ${found.detail}`).join("; ")}`
        );
      }

      if (chipsOnTable(state) !== bankroll) {
        return violation(
          `${event._tag}: ${chipsOnTable(state)} chips on the table, ${bankroll} bought in`
        );
      }
    }

    return Result.succeed(true);
  };

  const openTable = () => {
    state = initialTable(state.config);
    bankroll = 0;
    log = [];
    apply(Commands.ChangeRules({ config: randomConfig(random) }), false);
    const seats = 2 + random.below(8);
    const floor = random.chance(5) ? DEEP_STACK : 20;

    for (let index = 0; index < seats; index += 1) {
      apply(
        Commands.SitDown({
          buyIn: chipCount(floor + random.below(400)),
          player: PlayerIdSchema.make(nextPlayer()),
          seat: seatAt(index),
        }),
        false
      );
    }
  };

  const step = () => {
    if (TableStates.$is("InHand")(state)) {
      if (random.chance(3)) {
        return apply(illegalInHand(state, random), true);
      }

      if (random.chance(2)) {
        return apply(churn(state, random, nextPlayer), false);
      }

      const pending = pendingDecisions(state);

      if (PendingDecisions.$is("Show")(pending)) {
        const choice = showdownChoice(pending, random);

        everyChoiceByClock &&= choice.byClock;
        lastChoiceByClock = choice.byClock;

        return apply(choice.command, false);
      }

      return apply(Option.getOrThrow(answer(state, random)), false);
    }

    if (random.below(HANDS_PER_TABLE) === 0) {
      openTable();
    }

    if (random.chance(4)) {
      apply(Commands.ChangeRules({ config: randomConfig(random) }), false);
    }

    if (random.chance(6) || dealtIn(state).length < 2) {
      apply(churn(state, random, nextPlayer), false);
    }

    if (random.chance(1)) {
      Option.map(pastTheLimit(state, random, nextPlayer), (command) =>
        apply(command, true)
      );
    }

    const shown = afterHand(state, random);

    if (Option.isSome(shown) && random.chance(25)) {
      apply(shown.value, false);
    }

    const straddled = plannedStraddles(state, random).map(seatAt);

    return apply(
      Commands.StartHand({ deck: shuffledDeck(random), straddles: straddled }),
      false
    );
  };

  openTable();

  const finished = () => hands >= handsWanted;

  while (!finished()) {
    const outcome = step();

    if (Result.isFailure(outcome)) {
      return Result.fail(outcome.failure);
    }
  }

  countHand(counts, hand, seen);

  return Result.succeed({ counts, hands });
};

const program = Effect.gen(function* simulator() {
  const seed = argument("seed", DEFAULT_SEED);
  const wanted = argument("hands", DEFAULT_HANDS);
  const started = performance.now();
  const outcome = simulate(seed, wanted);
  const seconds = (performance.now() - started) / 1000;

  if (Result.isFailure(outcome)) {
    yield* Console.error(
      `command log since the table opened:\n${JSON.stringify(outcome.failure.log)}`
    );

    return yield* new SimulationViolation({
      detail: outcome.failure.detail,
      hand: outcome.failure.hand,
      seed,
    });
  }

  const { counts, hands } = outcome.success;

  yield* Console.log(
    `seed ${seed}: ${hands} hands in ${seconds.toFixed(1)} s, ${Math.round(hands / seconds)} hands per second on one thread`
  );

  for (const [name, count] of Object.entries(counts)) {
    yield* Console.log(`${name.padEnd(28)} ${String(count).padStart(9)}`);
  }

  const gaps = Object.entries(counts).filter(([, count]) => count === 0);

  if (gaps.length > 0) {
    return yield* new SimulationViolation({
      detail: `never hit ${gaps.map(([name]) => name).join(", ")}`,
      hand: hands,
      seed,
    });
  }

  return yield* Console.log(
    "every invariant and the chip count held after every event"
  );
});

await Effect.runPromise(program);
