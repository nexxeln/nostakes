import { Result, Schema } from "effect";

import {
  Antes,
  CardFromText,
  ChipsSchema,
  PlayerIdSchema,
  SeatIndexSchema,
  decide,
  evolve,
} from "../src/index.js";
import type {
  Command,
  Event,
  Rejection,
  TableConfig,
  TableState,
} from "../src/index.js";

export const seat = (index: number) => SeatIndexSchema.make(index);

export const chipCount = (amount: number) => ChipsSchema.make(amount);

export const player = (name: string) => PlayerIdSchema.make(name);

const decodeCard = Schema.decodeSync(CardFromText);

export const cards = (text: string) =>
  text
    .split(" ")
    .filter((card) => card.length > 0)
    .map((card) => decodeCard(card));

export const baseConfig: TableConfig = {
  ante: Antes.NoAnte(),
  bigBlind: chipCount(10),
  maxRuns: 1,
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
