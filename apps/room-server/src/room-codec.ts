import {
  clientFrame,
  clientMessage,
  replyResult,
  serverMessage,
} from "@nostakes/protocol";
import { Schema } from "effect";

import type { HostedRoom, RoomTypes } from "./hosted-room.js";

export const roomCodec = <T extends RoomTypes>(core: HostedRoom<T>) => {
  const reply = replyResult(core.schemas.rejection);

  const server = serverMessage({
    event: core.schemas.redacted,
    rejection: core.schemas.rejection,
    signal: core.schemas.signal,
    view: core.schemas.view,
  });

  const client = clientMessage(core.schemas.memberCommand, core.schemas.signal);

  return {
    catchUp: server.cases.Welcome.fields.catchUp,
    client,
    decodeClientFrame: Schema.decodeUnknownResult(
      clientFrame(core.schemas.memberCommand, core.schemas.signal)
    ),
    decodeEvent: Schema.decodeSync(Schema.fromJsonString(core.schemas.event)),
    decodeReply: Schema.decodeSync(Schema.fromJsonString(reply)),
    encodeEvent: Schema.encodeSync(Schema.fromJsonString(core.schemas.event)),
    encodeFrame: Schema.encodeSync(Schema.fromJsonString(server)),
    encodeReply: Schema.encodeSync(Schema.fromJsonString(reply)),
    reply,
    server,
  };
};

export type RoomCodec<T extends RoomTypes> = ReturnType<typeof roomCodec<T>>;

export type Reply<T extends RoomTypes> = RoomCodec<T>["reply"]["Type"];

export type ServerMessage<T extends RoomTypes> = RoomCodec<T>["server"]["Type"];

export type CatchUp<T extends RoomTypes> = RoomCodec<T>["catchUp"]["Type"];

export type ClientMessage<T extends RoomTypes> = RoomCodec<T>["client"]["Type"];
