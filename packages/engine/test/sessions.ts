import { Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Actions,
  Antes,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  Seats,
  TableStates,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "../src/index.js";
import type {
  Ante,
  Command,
  Event,
  LegalActions,
  TableConfig,
  TableState,
} from "../src/index.js";
import { chipCount, player, runCount, seat } from "./fixtures.js";
import { seededRandom } from "./random.js";
import type { SeededRandom } from "./random.js";

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

export const IntentSchema = Schema.Struct({
  pick: between(0, 1_000_000_000),
  roll: between(0, 99),
});

export type Intent = typeof IntentSchema.Type;

export const SessionSchema = Schema.Struct({
  anteAmount: between(1, 12),
  anteKind: between(0, 2),
  bigBlindExtra: between(0, 12),
  button: Schema.Boolean,
  intents: Schema.Array(IntentSchema).check(
    Schema.isMinLength(300),
    Schema.isMaxLength(600)
  ),
  maxRuns: between(1, 4),
  rabbitHunt: Schema.Boolean,
  smallBlind: between(1, 10),
  stacks: Schema.Array(between(0, 300)).check(
    Schema.isMinLength(9),
    Schema.isMaxLength(9)
  ),
  underTheGun: between(0, 3),
});

export type Session = typeof SessionSchema.Type;

export const session = Arbitrary.schema(SessionSchema);

const anteOf = (kind: number, amount: number): Ante => {
  if (kind === 1) {
    return Antes.EveryPlayer({ amount: chipCount(amount) });
  }

  return kind === 2
    ? Antes.BigBlindPays({ amount: chipCount(amount) })
    : Antes.NoAnte();
};

export const configOf = (source: Session): TableConfig => ({
  ante: anteOf(source.anteKind, source.anteAmount),
  bigBlind: chipCount(source.smallBlind + source.bigBlindExtra),
  maxRuns: runCount(source.maxRuns),
  rabbitHunt: source.rabbitHunt,
  smallBlind: chipCount(source.smallBlind),
  straddle: { button: source.button, underTheGun: source.underTheGun },
});

const randomConfig = (random: SeededRandom): TableConfig => {
  const small = 1 + random.below(10);

  return {
    ante: anteOf(random.below(3), 1 + random.below(12)),
    bigBlind: chipCount(small + random.below(12)),
    maxRuns: runCount(1 + random.below(4)),
    rabbitHunt: random.chance(1, 2),
    smallBlind: chipCount(small),
    straddle: { button: random.chance(1, 2), underTheGun: random.below(4) },
  };
};

const decodeDeck = Schema.decodeSync(DeckSchema);

export const shuffledDeck = (random: SeededRandom) => {
  const cards = Array.from({ length: 52 }, (_, index) => index);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = random.below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return decodeDeck(cards);
};

const occupiedSeats = (state: TableState) =>
  state.seats.flatMap((current, index) =>
    Seats.$is("Occupied")(current) ? [{ index, occupant: current }] : []
  );

const plannedStraddles = (state: TableState, random: SeededRandom) => {
  const dealtIn = occupiedSeats(state)
    .filter(({ occupant }) => !occupant.sittingOut && occupant.stack > 0)
    .map(({ index }) => index);

  const previous = TableStates.$is("BetweenHands")(state)
    ? Option.getOrElse(state.button, () => -1)
    : -1;

  const after = (from: number) => [
    ...dealtIn.filter((index) => index > from),
    ...dealtIn.filter((index) => index <= from),
  ];

  const button = after(previous)[0] ?? 0;
  const small = dealtIn.length === 2 ? button : (after(button)[0] ?? 0);
  const afterBig = after(after(small)[0] ?? 0);
  const line = afterBig.slice(0, afterBig.indexOf(button) + 1);
  const style = random.below(10);

  if (style < 5) {
    return [];
  }

  if (style < 8) {
    return line.slice(0, 1 + random.below(3));
  }

  return style === 8 ? [button] : [random.below(9), random.below(9)];
};

const legalAnswer = (legal: LegalActions, random: SeededRandom) => {
  const roll = random.below(100);

  if (roll < 8) {
    return Actions.Fold();
  }

  if (roll < 55 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 72 && Option.isSome(legal.call)) {
    return Actions.Call();
  }

  if (Option.isSome(legal.raise)) {
    const { maxTo, minTo } = legal.raise.value;
    const style = random.below(10);
    const spread = random.below(maxTo - minTo + 1);

    if (style < 5) {
      return Actions.RaiseTo({ to: minTo });
    }

    return Actions.RaiseTo({
      to: chipCount(style < 7 ? maxTo : minTo + spread),
    });
  }

  return legal.canCheck ? Actions.Check() : Actions.Call();
};

export const answerPending = (
  state: TableState,
  random: SeededRandom
): Option.Option<Command> =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        Commands.Act({ action: legalAnswer(legal, random), seat: legal.seat })
      ),
    ChooseRuns: ({ maxRuns, seats }) =>
      Option.some(
        Commands.ChooseRuns({
          runs: random.chance(7, 10)
            ? maxRuns
            : runCount(1 + random.below(maxRuns)),
          seat: seats[random.below(seats.length)] ?? seat(0),
        })
      ),
    Nothing: () => Option.none(),
  });

const illegalInHand = (state: TableState, random: SeededRandom): Command => {
  const pending = pendingDecisions(state);
  const anySeat = seat(random.below(9));

  if (PendingDecisions.$is("Bet")(pending)) {
    const { legal } = pending;
    const style = random.below(4);

    if (style === 0) {
      return Commands.Act({
        action: Actions.Call(),
        seat: seat((legal.seat + 1 + random.below(8)) % 9),
      });
    }

    if (style === 1) {
      const top = Option.match(legal.raise, {
        onNone: () => 1 + random.below(50),
        onSome: (range) => range.maxTo + 1,
      });

      return Commands.Act({
        action: Actions.RaiseTo({ to: chipCount(top) }),
        seat: legal.seat,
      });
    }

    return style === 2
      ? Commands.Act({ action: Actions.Check(), seat: legal.seat })
      : Commands.StartHand({ deck: shuffledDeck(random), straddles: [] });
  }

  return PendingDecisions.$is("ChooseRuns")(pending)
    ? Commands.ChooseRuns({
        runs: runCount(pending.maxRuns + 1),
        seat: anySeat,
      })
    : Commands.Act({ action: Actions.Fold(), seat: anySeat });
};

const churn = (state: TableState, random: SeededRandom): Command => {
  const target = seat(random.below(9));
  const kind = random.below(4);

  if (kind === 0) {
    return Commands.SitDown({
      buyIn: chipCount(random.below(300)),
      player: player(`p${random.below(14)}`),
      seat: target,
    });
  }

  if (kind === 1) {
    return Commands.StandUp({ seat: target });
  }

  if (kind === 2) {
    return Commands.AddChips({
      amount: chipCount(random.below(200)),
      seat: target,
    });
  }

  return Commands.SetSittingOut({
    seat: target,
    sittingOut: random.chance(1, 4) && occupiedSeats(state).length > 3,
  });
};

const afterHandCommand = (state: TableState, random: SeededRandom) => {
  const lastHand = TableStates.$is("BetweenHands")(state)
    ? Option.getOrUndefined(state.lastHand)
    : undefined;

  const shower = lastHand?.players[random.below(lastHand.players.length)];

  if (random.chance(1, 3)) {
    return Commands.RabbitHunt({ seat: shower?.seat ?? seat(random.below(9)) });
  }

  const hole = shower?.holeCards ?? [];
  const chosen = hole.filter(() => random.chance(1, 2));

  return Commands.ShowCards({
    cards: chosen.length > 0 ? chosen : hole.slice(0, 1),
    seat: shower?.seat ?? seat(random.below(9)),
  });
};

export const commandFor = (state: TableState, intent: Intent): Command => {
  const random = seededRandom(intent.pick);

  if (TableStates.$is("InHand")(state)) {
    if (intent.roll < 90) {
      return Option.getOrElse(answerPending(state, random), () =>
        illegalInHand(state, random)
      );
    }

    if (intent.roll < 95) {
      return illegalInHand(state, random);
    }

    return intent.roll < 98
      ? churn(state, random)
      : afterHandCommand(state, random);
  }

  if (intent.roll < 50) {
    return Commands.StartHand({
      deck: shuffledDeck(random),
      straddles: plannedStraddles(state, random).map((index) => seat(index)),
    });
  }

  if (intent.roll < 70) {
    return churn(state, random);
  }

  if (intent.roll < 76) {
    return Commands.ChangeRules({ config: randomConfig(random) });
  }

  if (intent.roll < 92) {
    return afterHandCommand(state, random);
  }

  return illegalInHand(state, random);
};

export interface Step {
  readonly after: TableState;
  readonly before: TableState;
  readonly command: Command;
  readonly events: readonly Event[];
  readonly accepted: boolean;
}

export const openingCommands = (source: Session) =>
  source.stacks.flatMap((stack, index) =>
    stack > 0
      ? [
          Commands.SitDown({
            buyIn: chipCount(stack),
            player: player(`p${index}`),
            seat: seat(index),
          }),
        ]
      : []
  );

export const playSession = (
  source: Session,
  onEvent?: (state: TableState, event: Event) => void
) => {
  const steps: Step[] = [];
  const events: Event[] = [];
  let state = initialTable(configOf(source));

  const apply = (command: Command) => {
    const decision = decide(state, command);
    const before = state;
    const emitted = Result.isSuccess(decision) ? decision.success : [];

    for (const event of emitted) {
      state = evolve(state, event);
      events.push(event);
      onEvent?.(state, event);
    }

    steps.push({
      accepted: Result.isSuccess(decision),
      after: state,
      before,
      command,
      events: emitted,
    });
  };

  for (const command of openingCommands(source)) {
    apply(command);
  }

  for (const intent of source.intents) {
    apply(commandFor(state, intent));
  }

  return { events, state, steps };
};

export const handsIn = (events: readonly Event[]) => {
  const hands: Event[][] = [];

  for (const event of events) {
    if (Events.$is("HandStarted")(event)) {
      hands.push([]);
    }

    hands.at(-1)?.push(event);
  }

  return hands;
};
