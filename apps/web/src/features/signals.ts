import type { PlayerId } from "@nostakes/protocol";
import { RoomSignalSchema } from "@nostakes/room";
import type { Reaction, RoomSignal } from "@nostakes/room";

import type { InRoom } from "./model.js";

export const PEEK_REFRESH_MS = 2000;

export const PEEK_LEASE_MS = 5000;

export const REACTION_SHOWN_MS = 2400;

export const KEPT_REACTIONS = 12;

export const REACTION_GLYPHS: Readonly<Record<Reaction, string>> = {
  Clap: "👏",
  Cry: "😢",
  Fire: "🔥",
  Laugh: "😂",
  Wow: "😮",
};

export const reacted = (
  room: InRoom,
  player: PlayerId,
  reaction: Reaction,
  at: number,
  id: number
): InRoom => ({
  ...room,
  reactions: [
    ...room.reactions,
    { id, player, reaction, until: at + REACTION_SHOWN_MS },
  ].slice(-KEPT_REACTIONS),
});

export const heard = (
  room: InRoom,
  from: PlayerId,
  signal: RoomSignal,
  at: number,
  id: number
): InRoom =>
  RoomSignalSchema.match(signal, {
    Peeking: ({ looking }) => ({
      ...room,
      peeks: [
        ...room.peeks.filter(({ player }) => player !== from),
        ...(looking ? [{ player: from, until: at + PEEK_LEASE_MS }] : []),
      ],
    }),
    Reaction: ({ reaction }) => reacted(room, from, reaction, at, id),
  });

export const forgetExpired = (room: InRoom, now: number): InRoom => {
  const peeks = room.peeks.filter(({ until }) => until > now);
  const reactions = room.reactions.filter(({ until }) => until > now);

  return peeks.length === room.peeks.length &&
    reactions.length === room.reactions.length
    ? room
    : { ...room, peeks, reactions };
};

export const signalsShowing = (room: InRoom) =>
  room.peeks.length > 0 || room.reactions.length > 0;

export const isPeeking = (room: InRoom, player: PlayerId) =>
  room.peeks.some((peek) => peek.player === player);
