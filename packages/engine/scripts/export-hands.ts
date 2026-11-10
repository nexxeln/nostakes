import {
  Actions,
  Antes,
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
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "@nostakes/engine";
import type {
  Action,
  Ante,
  Command,
  Event,
  LegalActions,
  PendingDecision,
  Rejection,
  ShowdownChoices,
  TableConfig,
  TableState,
} from "@nostakes/engine";
import { Console, Effect, Option, Result, Schema } from "effect";

const DEFAULT_SEED = 20_261_110;

const DEFAULT_HANDS = 1000;

const HANDS_PER_TABLE = 120;

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
  const bigBlind = smallBlind * (1 + random.below(3));

  return TableConfigSchema.make({
    allInHands: random.chance(40) ? "Hidden" : "FaceUp",
    ante: anteOf(random, bigBlind),
    bigBlind: chipCount(bigBlind),
    maxRuns: runCount(1 + random.below(4)),
    rabbitHunt: random.chance(50),
    runCount: random.chance(25) ? "Fixed" : "Vote",
    showdown: random.chance(50) ? "Interactive" : "Automatic",
    showdownOrder: random.chance(30) ? "LastAggressor" : "RiverAggressor",
    smallBlind: chipCount(smallBlind),
    straddle: {
      button: random.chance(50),
      underTheGun: random.chance(60) ? 2 : random.below(3),
    },
    straddleSize: random.chance(30) ? "TwoBigBlinds" : "Doubling",
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

const previousButton = (state: TableState) =>
  TableStates.$is("BetweenHands")(state)
    ? Option.getOrNull(state.button)
    : null;

const plannedStraddles = (state: TableState, random: Random) => {
  const seats = dealtIn(state);
  const previous = previousButton(state) ?? -1;

  const after = (from: number) => [
    ...seats.filter((index) => index > from),
    ...seats.filter((index) => index <= from),
  ];

  const button = after(previous)[0] ?? 0;
  const small = seats.length === 2 ? button : (after(button)[0] ?? 0);
  const afterBig = after(after(small)[0] ?? 0);
  const line = afterBig.slice(0, afterBig.indexOf(button) + 1);
  const roll = random.below(100);

  if (roll < 14) {
    return line.slice(0, 1);
  }

  if (roll < 30) {
    return line.slice(0, 2);
  }

  if (roll < 33) {
    return line.slice(0, 3);
  }

  if (roll < 40) {
    return [button];
  }

  return roll < 43 ? [random.pick(seats) ?? 0] : [];
};

const legalAnswer = (legal: LegalActions, random: Random): Action => {
  const roll = random.below(100);

  if (roll < 14) {
    return Actions.Fold();
  }

  if (roll < 58 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 72 && Option.isSome(legal.call)) {
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

const roundOf = (state: TableState) =>
  TableStates.$is("InHand")(state) && Phases.$is("Betting")(state.hand.phase)
    ? Option.some(state.hand.phase)
    : Option.none();

const illegalAction = (
  state: TableState,
  legal: LegalActions,
  random: Random
): Command => {
  const roll = random.below(6);
  const round = roundOf(state);

  const currentBet = Option.match(round, {
    onNone: () => 0,
    onSome: (betting) => betting.currentBet,
  });

  const fullRaise = Option.match(round, {
    onNone: () => 0,
    onSome: (betting) => betting.lastFullRaise,
  });

  if (roll === 0) {
    return Commands.Act({
      action: Actions.Call(),
      seat: seatAt((legal.seat + 1 + random.below(8)) % 9),
    });
  }

  const raiseTo = (to: number) =>
    Commands.Act({
      action: Actions.RaiseTo({ to: chipCount(Math.max(0, to)) }),
      seat: legal.seat,
    });

  if (roll === 1) {
    return raiseTo(
      Option.match(legal.raise, {
        onNone: () => currentBet + fullRaise,
        onSome: (range) => range.maxTo + 1,
      })
    );
  }

  if (roll === 2) {
    return raiseTo(
      Option.match(legal.raise, {
        onNone: () => currentBet + fullRaise,
        onSome: (range) => range.minTo - 1,
      })
    );
  }

  if (roll === 3) {
    return raiseTo(currentBet);
  }

  return Commands.Act({
    action: legal.canCheck ? Actions.Call() : Actions.Check(),
    seat: legal.seat,
  });
};

const showdownChoice = (choices: ShowdownChoices, random: Random) => {
  const { canMuck, seat } = choices;

  if (random.chance(10)) {
    const other = seatAt((seat + 1 + random.below(8)) % 9);

    return {
      command:
        canMuck || random.chance(30)
          ? Commands.TableHand({ seat: other })
          : Commands.MuckHand({ seat }),
      probe: true,
    };
  }

  return {
    command:
      canMuck && random.chance(45)
        ? Commands.MuckHand({ seat })
        : Commands.TableHand({ seat }),
    probe: false,
  };
};

const decision = (
  state: TableState,
  random: Random
): Option.Option<{ readonly command: Command; readonly probe: boolean }> =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        random.chance(10)
          ? { command: illegalAction(state, legal, random), probe: true }
          : {
              command: Commands.Act({
                action: legalAnswer(legal, random),
                seat: legal.seat,
              }),
              probe: false,
            }
      ),
    ChooseRuns: ({ maxRuns, seats }) => {
      const owed = seats[0] ?? seatAt(0);

      if (random.chance(8)) {
        return Option.some({
          command: random.chance(50)
            ? Commands.ChooseRuns({ runs: runCount(maxRuns + 1), seat: owed })
            : Commands.ChooseRuns({
                runs: runCount(1),
                seat: seatAt((owed + 1 + random.below(8)) % 9),
              }),
          probe: true,
        });
      }

      return Option.some({
        command: Commands.ChooseRuns({
          runs: random.chance(55)
            ? maxRuns
            : runCount(1 + random.below(maxRuns)),
          seat: random.pick(seats) ?? owed,
        }),
        probe: false,
      });
    },
    Nothing: () => Option.none(),
    Show: ({ choices }) => Option.some(showdownChoice(choices, random)),
  });

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

      return Option.some(
        Commands.ShowCards({
          cards: ShownCardsSchema.make(
            cards.length > 0
              ? cards
              : shower.holeCards.slice(0, 1 + random.below(2))
          ),
          seat: shower.seat,
        })
      );
    })
  );
};

const optional = <A>(value: Option.Option<A>) => Option.getOrNull(value);

const pendingRecord = (pending: PendingDecision) =>
  PendingDecisions.$match(pending, {
    Bet: ({ legal }) => ({
      call: optional(legal.call),
      canCheck: legal.canCheck,
      kind: "Bet",
      raise: optional(legal.raise),
      seat: legal.seat,
    }),
    ChooseRuns: ({ maxRuns, seats }) => ({
      kind: "ChooseRuns",
      maxRuns,
      seats,
    }),
    Nothing: () => ({ kind: "Nothing" }),
    Show: ({ beatenInEveryPot, choices }) => ({
      ...choices,
      beatenInEveryPot,
      kind: "Show",
    }),
  });

const seatsRecord = (state: TableState) =>
  state.seats.map((seat) =>
    Seats.$is("Occupied")(seat)
      ? { sittingOut: seat.sittingOut, stack: seat.stack }
      : null
  );

const eventRecord = (event: Event) =>
  Events.$is("HandStarted")(event) ? { ...event, deck: [] } : event;

const rejectionRecord = (rejection: Rejection) =>
  "reason" in rejection
    ? { reason: rejection.reason, tag: rejection._tag }
    : { tag: rejection._tag };

interface Step {
  readonly accepted: boolean;
  readonly command: Command;
  readonly events: readonly ReturnType<typeof eventRecord>[];
  readonly pending: ReturnType<typeof pendingRecord>;
  readonly probe: boolean;
  readonly rejection: ReturnType<typeof rejectionRecord> | null;
}

interface TableSnapshot {
  readonly config: TableConfig;
  readonly previousButton: number | null;
  readonly seats: ReturnType<typeof seatsRecord>;
}

interface RejectedStart extends TableSnapshot {
  readonly rejection: ReturnType<typeof rejectionRecord>;
  readonly straddles: readonly number[];
}

interface HandRecord extends TableSnapshot {
  readonly after: Step[];
  readonly deck: readonly number[];
  final: ReturnType<typeof seatsRecord> | null;
  readonly hand: number;
  readonly rejectedStarts: readonly RejectedStart[];
  readonly start: readonly ReturnType<typeof eventRecord>[];
  readonly steps: Step[];
  readonly straddles: readonly number[];
}

const stepRecord = (
  command: Command,
  outcome: Result.Result<readonly Event[], Rejection>,
  pending: ReturnType<typeof pendingRecord>,
  probe: boolean
): Step => ({
  accepted: Result.isSuccess(outcome),
  command,
  events: Result.isSuccess(outcome) ? outcome.success.map(eventRecord) : [],
  pending,
  probe,
  rejection: Result.isFailure(outcome)
    ? rejectionRecord(outcome.failure)
    : null,
});

const exportHands = (seed: number, wanted: number) =>
  Effect.gen(function* exporter() {
    const random = randomSource(seed);
    let players = 0;
    let state = initialTable(randomConfig(random));
    let rejectedStarts: RejectedStart[] = [];
    let started = 0;
    let exported = 0;
    let current: HandRecord | null = null;

    const nextPlayer = () => {
      players += 1;

      return `player-${players}`;
    };

    const apply = (
      command: Command
    ): Result.Result<readonly Event[], Rejection> => {
      const decided = decide(state, command);

      if (Result.isSuccess(decided)) {
        for (const event of decided.success) {
          state = evolve(state, event);
        }
      }

      return decided;
    };

    const finish = (hand: HandRecord, events: readonly Event[]) => {
      if (events.some(Events.$is("HandEnded"))) {
        hand.final = seatsRecord(state);
      }
    };

    const openTable = () => {
      state = initialTable(state.config);
      apply(Commands.ChangeRules({ config: randomConfig(random) }));
      const seats = 2 + random.below(8);

      for (let index = 0; index < seats; index += 1) {
        apply(
          Commands.SitDown({
            buyIn: chipCount(20 + random.below(400)),
            player: PlayerIdSchema.make(nextPlayer()),
            seat: seatAt(index),
          })
        );
      }
    };

    const playStep = (hand: HandRecord) => {
      const next = decision(state, random);

      if (Option.isNone(next)) {
        return false;
      }

      const pending = pendingRecord(pendingDecisions(state));
      const outcome = apply(next.value.command);

      hand.steps.push(
        stepRecord(next.value.command, outcome, pending, next.value.probe)
      );

      if (Result.isSuccess(outcome)) {
        finish(hand, outcome.success);
      }

      return true;
    };

    const refill = () => {
      for (const { index, seat } of occupied(state)) {
        if (seat.stack === 0 && random.chance(70)) {
          apply(
            Commands.AddChips({
              amount: chipCount(20 + random.below(400)),
              seat: seatAt(index),
            })
          );
        }
      }
    };

    const betweenHands = () => {
      if (random.below(HANDS_PER_TABLE) === 0) {
        openTable();
      }

      refill();

      if (random.chance(4)) {
        apply(Commands.ChangeRules({ config: randomConfig(random) }));
      }

      if (random.chance(8) || dealtIn(state).length < 2) {
        apply(churn(state, random, nextPlayer));
      }

      const shown = afterHand(state, random);

      if (current !== null && Option.isSome(shown) && random.chance(30)) {
        current.after.push(
          stepRecord(
            shown.value,
            apply(shown.value),
            { kind: "Nothing" },
            false
          )
        );
      }
    };

    const startHand = (): HandRecord | null => {
      const straddles = plannedStraddles(state, random).map(seatAt);
      const deck = shuffledDeck(random);

      const before: TableSnapshot = {
        config: state.config,
        previousButton: previousButton(state),
        seats: seatsRecord(state),
      };

      const outcome = apply(Commands.StartHand({ deck, straddles }));

      if (Result.isFailure(outcome)) {
        rejectedStarts.push({
          ...before,
          rejection: rejectionRecord(outcome.failure),
          straddles,
        });

        return null;
      }

      started += 1;

      const hand: HandRecord = {
        ...before,
        after: [],
        deck,
        final: null,
        hand: started,
        rejectedStarts,
        start: outcome.success.map(eventRecord),
        steps: [],
        straddles,
      };

      rejectedStarts = [];
      finish(hand, outcome.success);

      return hand;
    };

    openTable();

    while (exported < wanted) {
      if (current !== null && current.final === null) {
        if (!playStep(current)) {
          return yield* Effect.die(
            `hand ${current.hand} stopped with nothing pending and no HandEnded`
          );
        }
      } else {
        betweenHands();

        const next = dealtIn(state).length >= 2 ? startHand() : null;

        if (next !== null) {
          if (current !== null) {
            exported += 1;
            yield* Console.log(JSON.stringify(current));
          }

          current = next;
        }
      }
    }

    return exported;
  });

const program = Effect.gen(function* exportProgram() {
  const seed = argument("seed", DEFAULT_SEED);
  const wanted = argument("hands", DEFAULT_HANDS);
  const exported = yield* exportHands(seed, wanted);

  yield* Console.error(`seed ${seed}: exported ${exported} hands`);
});

await Effect.runPromise(program);
