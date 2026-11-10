import type { PlayerId } from "@nostakes/engine";
import { TableStates } from "@nostakes/engine";
import { Schema } from "effect";

import { RoomStates, isMember } from "./state.js";
import type { Open, RoomState } from "./state.js";

export const REACTIONS = ["Clap", "Laugh", "Wow", "Cry", "Fire"] as const;

export const ReactionSchema = Schema.Literals(REACTIONS);

export type Reaction = typeof ReactionSchema.Type;

export const RoomSignalSchema = Schema.TaggedUnion({
  Peeking: { looking: Schema.Boolean },
  Reaction: { reaction: ReactionSchema },
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
    Reaction: () => true,
  });
