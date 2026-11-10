import {
  clientMessage,
  MAX_FRAME_BYTES,
  replyResult,
  serverFrame,
  serverMessage,
} from "@nostakes/protocol";
import { Schema } from "effect";

export interface RoomTypes {
  readonly Command: unknown;
  readonly Event: unknown;
  readonly View: unknown;
  readonly Rejection: unknown;
}

export interface ClientSchemas<T extends RoomTypes> {
  readonly command: Schema.Codec<T["Command"], unknown>;
  readonly event: Schema.Codec<T["Event"], unknown>;
  readonly view: Schema.Codec<T["View"], unknown>;
  readonly rejection: Schema.Codec<T["Rejection"], unknown>;
}

const utf8 = new TextEncoder();

export const frameBytes = (text: string) => utf8.encode(text).byteLength;

export const fitsInFrame = (text: string) =>
  frameBytes(text) <= MAX_FRAME_BYTES;

export const clientCodec = <T extends RoomTypes>(schemas: ClientSchemas<T>) => {
  const client = clientMessage(schemas.command);
  const server = serverMessage(schemas);

  return {
    client,
    decodeServerFrame: Schema.decodeUnknownResult(serverFrame(schemas)),
    encodeClientFrame: Schema.encodeResult(Schema.fromJsonString(client)),
    reply: replyResult(schemas.rejection),
    server,
  };
};

export type ClientCodec<T extends RoomTypes> = ReturnType<
  typeof clientCodec<T>
>;

export type ClientMessage<T extends RoomTypes> =
  ClientCodec<T>["client"]["Type"];

export type ServerMessage<T extends RoomTypes> =
  ClientCodec<T>["server"]["Type"];

export type ReplyResult<T extends RoomTypes> = ClientCodec<T>["reply"]["Type"];
