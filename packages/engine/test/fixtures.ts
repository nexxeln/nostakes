import { Option, Result, Schema } from "effect";

import {
  Actions,
  Antes,
  CardFromText,
  ChipsSchema,
  Commands,
  DeckSchema,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  TableStates,
  Events,
  decide,
  evolve,
  initialTable,
  legalActions,
} from "../src/index.js";
import type {
  Action,
  Command,
  Deck,
  Event,
  Rejection,
  TableConfig,
  TableState,
} from "../src/index.js";

export const seat = (index: number) => SeatIndexSchema.make(index);

export const chipCount = (amount: number) => ChipsSchema.make(amount);

export const player = (name: string) => PlayerIdSchema.make(name);

export const runCount = (count: number) => RunCountSchema.make(count);

const decodeCard = Schema.decodeSync(CardFromText);

export const card = (text: string) => decodeCard(text);

export const cards = (text: string) =>
  text
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => decodeCard(word));

export const baseConfig: TableConfig = {
  ante: Antes.NoAnte(),
  bigBlind: chipCount(10),
  maxRuns: runCount(1),
  rabbitHunt: false,
  smallBlind: chipCount(5),
  straddle: { button: false, underTheGun: 0 },
};

export const fold = (state: TableState, events: readonly Event[]) => {
  let current = state;

  for (const event of events) {
    current = evolve(current, event);
  }

  return current;
};

export interface Step {
  readonly events: readonly Event[];
  readonly state: TableState;
}

export const run = (state: TableState, command: Command): Step => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw decision.failure;
  }

  return { events: decision.success, state: fold(state, decision.success) };
};

export const runAll = (state: TableState, commands: readonly Command[]) => {
  let current: Step = { events: [], state };
  const events: Event[] = [];

  for (const command of commands) {
    current = run(current.state, command);
    events.push(...current.events);
  }

  return { events, state: current.state };
};

export const rejection = (
  state: TableState,
  command: Command
): Rejection | undefined => {
  const decision = decide(state, command);

  return Result.isFailure(decision) ? decision.failure : undefined;
};

export const bankrollChange = (event: Event) => {
  if (Events.$is("PlayerSat")(event)) {
    return event.buyIn;
  }

  if (Events.$is("ChipsAdded")(event)) {
    return event.amount;
  }

  return Events.$is("PlayerStood")(event) ? 0 - event.stack : 0;
};

export const occupiedTable = (
  config: TableConfig,
  stacks: Readonly<Record<number, number>>
) =>
  runAll(
    initialTable(config),
    Object.entries(stacks).map(([index, stack]) =>
      Commands.SitDown({
        buyIn: chipCount(stack),
        player: player(`p${index}`),
        seat: seat(Number(index)),
      })
    )
  ).state;

const decodeDeck = Schema.decodeSync(DeckSchema);

export const deckStartingWith = (text: string) => {
  const top = cards(text);

  return decodeDeck([
    ...top,
    ...Array.from({ length: 52 }, (_, index) => index).filter(
      (index) => !top.some((chosen) => chosen === index)
    ),
  ]);
};

export const startHand = (
  state: TableState,
  deck: Deck,
  straddles: readonly number[] = []
) =>
  run(
    state,
    Commands.StartHand({
      deck,
      straddles: straddles.map((index) => seat(index)),
    })
  );

export const handOf = (state: TableState) => {
  if (!TableStates.$is("InHand")(state)) {
    throw new Error("expected a hand in progress");
  }

  return state.hand;
};

export const stacksOf = (state: TableState) =>
  state.seats.map((current) =>
    Seats.$is("Occupied")(current) ? current.stack : null
  );

export const folds = Actions.Fold();

export const checks = Actions.Check();

export const calls = Actions.Call();

export const raisesTo = (to: number) => Actions.RaiseTo({ to: chipCount(to) });

export const actAs = (index: number, action: Action) =>
  Commands.Act({ action, seat: seat(index) });

export const play = (
  state: TableState,
  moves: readonly (readonly [number, Action])[]
) =>
  runAll(
    state,
    moves.map(([index, action]) => actAs(index, action))
  );

export const legalOf = (state: TableState) =>
  Option.getOrThrowWith(
    legalActions(state),
    () => new Error("expected a seat to bet")
  );

export const configWithBlinds = (small: number, big: number): TableConfig => ({
  ...baseConfig,
  bigBlind: chipCount(big),
  smallBlind: chipCount(small),
});
