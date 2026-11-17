import type { PlayerId } from "@nostakes/engine";
import { Option } from "effect";

import { tableQuiet } from "./attendance.js";
import { RoomStates, isMember, seatOf } from "./state.js";
import type { RoomState } from "./state.js";

export type VoiceAccess = "None" | "Listen" | "Talk";

export const voiceAccess = (
  state: RoomState,
  player: PlayerId
): VoiceAccess => {
  if (
    !RoomStates.$is("Open")(state) ||
    state.settings.voice === "Off" ||
    tableQuiet(state) ||
    !isMember(state, player)
  ) {
    return "None";
  }

  return state.host === player ||
    state.settings.voice === "Everyone" ||
    Option.isSome(seatOf(state, player))
    ? "Talk"
    : "Listen";
};

export const voiceModerator = (state: RoomState, player: PlayerId) =>
  RoomStates.$is("Open")(state) && state.host === player;
