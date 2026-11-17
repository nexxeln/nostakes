import { PlayerIdSchema, TableStates } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Effect, Option, Schema } from "effect";

import { RoomStates, isMember, seatOf } from "./state.js";
import type { Open, RoomState } from "./state.js";

export const REACTIONS = [
  "Clap",
  "Laugh",
  "Wow",
  "Cry",
  "Fire",
  "Dead",
  "Fish",
  "Eyes",
  "Bird",
] as const;

export const ReactionSchema = Schema.Literals(REACTIONS);

export type Reaction = typeof ReactionSchema.Type;

const thrownAtNobody = Effect.sync(() => Option.none<PlayerId>());

export const RoomSignalSchema = Schema.TaggedUnion({
  Peeking: { looking: Schema.Boolean },
  Reaction: {
    at: Schema.Option(PlayerIdSchema).pipe(
      Schema.withConstructorDefault(thrownAtNobody)
    ),
    reaction: ReactionSchema,
  },
});

export type RoomSignal = typeof RoomSignalSchema.Type;

const holdsHoleCards = (state: Open, player: PlayerId) =>
  TableStates.$is("InHand")(state.table) &&
  state.table.hand.players.some(
    (dealt) =>
      dealt.player === player &&
      dealt.status !== "Folded" &&
      !dealt.mucked &&
      dealt.holeCards.length > 0
  );

const canBeThrownAt = (state: RoomState, sender: PlayerId, target: PlayerId) =>
  target !== sender &&
  RoomStates.$is("Open")(state) &&
  isMember(state, target) &&
  Option.isSome(seatOf(state, target));

export const signalAllowed = (
  state: RoomState,
  sender: PlayerId,
  signal: RoomSignal
): boolean =>
  isMember(state, sender) &&
  RoomSignalSchema.match(signal, {
    Peeking: () =>
      RoomStates.$is("Open")(state) &&
      state.settings.peeking &&
      holdsHoleCards(state, sender),
    Reaction: ({ at }) =>
      Option.match(at, {
        onNone: () => true,
        onSome: (target) => canBeThrownAt(state, sender, target),
      }),
  });
