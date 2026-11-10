import type { ClientSchemas } from "@nostakes/client";
import {
  MemberCommandSchema,
  RoomRejectionSchema,
  RoomViewSchema,
  SeenEventSchema,
} from "@nostakes/room";
import type {
  MemberCommand,
  RoomRejection,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import { Schema } from "effect";

export interface PokerClientTypes {
  readonly Command: MemberCommand;
  readonly Event: SeenEvent;
  readonly View: RoomView;
  readonly Rejection: RoomRejection;
}

export const pokerClientSchemas: ClientSchemas<PokerClientTypes> = {
  command: Schema.toCodecJson(MemberCommandSchema),
  event: Schema.toCodecJson(SeenEventSchema),
  rejection: Schema.toCodecJson(RoomRejectionSchema),
  view: Schema.toCodecJson(RoomViewSchema),
};

export const roomPath = (code: string) => `/r/${code}`;

export const socketPath = (code: string) => `/rooms/${code}/socket`;
