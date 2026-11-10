import {
  Antes,
  ChipsSchema,
  PlayerIdSchema,
  SeatIndexSchema,
} from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Result } from "effect";

import {
  Actors,
  RoomCodeSchema,
  RoomCommands,
  RoomStates,
  decide,
  evolveAll,
  millis,
  openRoom,
  replay,
} from "../src/index.js";
import type {
  RoomCommand,
  RoomEvent,
  RoomRejection,
  RoomSettings,
  RoomState,
} from "../src/index.js";

export const player = (name: string) => PlayerIdSchema.make(name);

export const chipCount = (amount: number) => ChipsSchema.make(amount);

export const seat = (index: number) => SeatIndexSchema.make(index);

export const ms = (amount: number) => millis(amount);

export const as = (who: PlayerId) => Actors.Member({ player: who });

export const server = Actors.Server();

export const ann = player("ann");

export const bob = player("bob");

export const cat = player("cat");

export const dan = player("dan");

export const settings: RoomSettings = {
  approval: { chips: false, seats: false },
  betweenHandsSeconds: 0,
  buyIn: { max: chipCount(1000), min: chipCount(100) },
  runChoiceSeconds: 10,
  table: {
    ante: Antes.NoAnte(),
    bigBlind: chipCount(10),
    maxRuns: 1,
    rabbitHunt: false,
    smallBlind: chipCount(5),
    straddle: { button: false, underTheGun: 0 },
  },
  timeBankSeconds: 0,
  turnSeconds: 0,
};

export const roomCode = RoomCodeSchema.make("night");

export const openedBy = (host: PlayerId, chosen: RoomSettings = settings) =>
  replay(
    openRoom({
      at: ms(0),
      avatar: "spade",
      code: roomCode,
      host,
      name: host,
      settings: chosen,
    })
  );

export interface Step {
  readonly events: readonly RoomEvent[];
  readonly state: RoomState;
}

export const run = (state: RoomState, command: RoomCommand): Step => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw decision.failure;
  }

  return {
    events: decision.success,
    state: evolveAll(state, decision.success),
  };
};

export const runAll = (state: RoomState, commands: readonly RoomCommand[]) => {
  let current = state;

  for (const command of commands) {
    current = run(current, command).state;
  }

  return current;
};

export const rejection = (
  state: RoomState,
  command: RoomCommand
): RoomRejection => {
  const decision = decide(state, command);

  if (Result.isSuccess(decision)) {
    throw new Error(`expected ${command._tag} to be rejected`);
  }

  return decision.failure;
};

export const bytesFrom = (seed: number, length = 256) => {
  const bytes = new Uint8Array(length);
  let state = (Math.abs(Math.trunc(seed)) % 2_147_483_646) + 1;

  for (let index = 0; index < length; index += 1) {
    state = (state * 48_271) % 2_147_483_647;
    bytes[index] = state % 256;
  }

  return bytes;
};

export const join = (who: PlayerId, at = 1) =>
  RoomCommands.Join({ at: ms(at), avatar: "", by: as(who), name: who });

export const sit = (who: PlayerId, index: number, buyIn = 200, at = 2) =>
  RoomCommands.RequestSeat({
    at: ms(at),
    buyIn: chipCount(buyIn),
    by: as(who),
    seat: seat(index),
  });

export const dealAt = (at: number, seed = at) =>
  RoomCommands.Deal({ at: ms(at), by: server, shuffleBytes: bytesFrom(seed) });

export const openOf = (state: RoomState) => {
  if (!RoomStates.$is("Open")(state)) {
    throw new Error("expected an open room");
  }

  return state;
};

const ORDER = "23456789TJQKA";

const SUITS_IN_ORDER = "cdhs";

const cardNumber = (text: string) =>
  ORDER.indexOf(text.charAt(0)) * 4 + SUITS_IN_ORDER.indexOf(text.charAt(1));

export const bytesForDeck = (leading: string) => {
  const wanted = leading
    .split(" ")
    .filter((word) => word.length > 0)
    .map(cardNumber);

  const deck = [
    ...wanted,
    ...Array.from({ length: 52 }, (_, card) => card).filter(
      (card) => !wanted.includes(card)
    ),
  ];

  const cards = Array.from({ length: 52 }, (_, card) => card);
  const bytes = new Uint8Array(51);

  for (let top = 51; top > 0; top -= 1) {
    const drawn = cards.indexOf(deck[top] ?? 0);
    const held = cards[top] ?? 0;

    bytes[51 - top] = drawn;
    cards[top] = cards[drawn] ?? 0;
    cards[drawn] = held;
  }

  return bytes;
};
