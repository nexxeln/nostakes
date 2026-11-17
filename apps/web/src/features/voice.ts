import type { PlayerId, VoiceRoster } from "@nostakes/protocol";
import { Option, Predicate } from "effect";

import type { InRoom } from "./model.js";
import { isYou, openViewOf } from "./room.js";
import type { OpenView } from "./room.js";
import type { Voice } from "./voice-model.js";

export type VoiceAccess = "None" | "Listen" | "Talk";

const seated = (view: OpenView, player: PlayerId) =>
  view.seats.some(({ occupant }) =>
    Option.exists(occupant, (sitting) => sitting.player === player)
  );

export const voiceAccessIn = (view: OpenView): VoiceAccess =>
  Option.match(view.you, {
    onNone: () => "None",
    onSome: (you) => {
      if (
        view.settings.voice === "Off" ||
        Predicate.isTagged(view.attendance, "Quiet") ||
        !view.members.some(({ player }) => player === you)
      ) {
        return "None";
      }

      return view.host === you ||
        view.settings.voice === "Everyone" ||
        seated(view, you)
        ? "Talk"
        : "Listen";
    },
  });

export const voiceAccessOf = (room: InRoom): VoiceAccess =>
  Option.match(openViewOf(room), {
    onNone: () => "None",
    onSome: voiceAccessIn,
  });

export interface VoiceTarget {
  readonly code: string;
  readonly player: PlayerId;
  readonly talk: boolean;
}

export const voiceTargetOf = (room: InRoom): Option.Option<VoiceTarget> => {
  const access = voiceAccessOf(room);

  return room.connected && room.voice.on && access !== "None"
    ? Option.some({
        code: room.code,
        player: room.player,
        talk: access === "Talk",
      })
    : Option.none();
};

export const mutedForEveryone = (roster: VoiceRoster, player: PlayerId) =>
  roster.some((seat) => seat.player === player && seat.muted);

export const micLive = (voice: Voice, you: PlayerId) =>
  voice.status.phase === "Live" &&
  (voice.micOpen || voice.held) &&
  !voice.status.micBlocked &&
  !mutedForEveryone(voice.roster, you);

export const inVoice = (roster: VoiceRoster, player: PlayerId) =>
  roster.some((seat) => seat.player === player);

export interface PullPlan {
  readonly pull: readonly PlayerId[];
  readonly drop: readonly PlayerId[];
}

export const pullPlan = (
  roster: VoiceRoster,
  you: PlayerId,
  pulled: readonly PlayerId[]
): PullPlan => {
  const talking = roster
    .filter(({ player, talking: on }) => on && player !== you)
    .map(({ player }) => player);

  return {
    drop: pulled.filter((player) => !talking.includes(player)),
    pull: talking.filter((player) => !pulled.includes(player)),
  };
};

export const speakingIn = (room: InRoom, player: PlayerId) =>
  room.voice.status.speaking.includes(player) &&
  Option.exists(
    openViewOf(room),
    (view) => !isYou(view, player) || micLive(room.voice, player)
  );

export const TALK_KEY = "t";

export const VOICE_TAP_ATTRIBUTE = "voice-tap";

export const talkKeyWanted = (room: InRoom) =>
  room.voice.on && room.voice.status.phase === "Live";
