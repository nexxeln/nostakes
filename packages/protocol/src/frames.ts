import { Schema } from "effect";

import {
  CommandIdSchema,
  PlayerIdSchema,
  SeqSchema,
  TokenSchema,
} from "./primitives.js";
import { helloProtocol, welcomeBuild } from "./version.js";

export type WireCodec<T> = Schema.Codec<T, Schema.Json>;

export type WireSchema = Schema.Top & { readonly Encoded: Schema.Json };

export const CloseReasonSchema = Schema.Literals([
  "HelloTimeout",
  "NotAuthorized",
  "ProtocolViolation",
  "FrameTooLarge",
  "TooManyFrames",
  "RoomHalted",
  "NotFound",
  "TooManySockets",
  "Unresponsive",
  "ClientOutdated",
  "ServerOutdated",
]);

export type CloseReason = typeof CloseReasonSchema.Type;

export const CLOSE_CODES: Readonly<Record<CloseReason, number>> = {
  ClientOutdated: 4011,
  FrameTooLarge: 1009,
  HelloTimeout: 4001,
  NotAuthorized: 4003,
  NotFound: 4004,
  ProtocolViolation: 4002,
  RoomHalted: 4010,
  ServerOutdated: 4012,
  TooManyFrames: 4008,
  TooManySockets: 4029,
  Unresponsive: 4007,
};

export const PING_FRAME = '{"_tag":"Ping"}';

export const PONG_FRAME = '{"_tag":"Pong"}';

export const ClosingSchema = Schema.TaggedStruct("Closing", {
  reason: CloseReasonSchema,
});

const encodeClosing = Schema.encodeSync(Schema.fromJsonString(ClosingSchema));

export const closingFrame = (reason: CloseReason) =>
  encodeClosing(ClosingSchema.make({ reason }));

export const UnavailableReasonSchema = Schema.Literals([
  "RoomHalted",
  "StorageFailed",
]);

export type UnavailableReason = typeof UnavailableReasonSchema.Type;

export const replyResult = <Rejection extends WireSchema>(
  rejection: Rejection
) =>
  Schema.TaggedUnion({
    Accepted: { seq: SeqSchema },
    Rejected: { rejection },
    Unavailable: { reason: UnavailableReasonSchema },
  });

export const catchUp = <Event extends WireSchema>(event: Event) =>
  Schema.TaggedUnion({
    Missed: { events: Schema.NonEmptyArray(event), from: SeqSchema },
    Skipped: { from: SeqSchema, to: SeqSchema },
    UpToDate: {},
  });

export const clientMessage = <Command extends WireSchema>(command: Command) =>
  Schema.TaggedUnion({
    Command: { command, id: CommandIdSchema },
    Hello: {
      after: Schema.OptionFromNullOr(SeqSchema),
      protocol: helloProtocol,
      token: TokenSchema,
    },
    Ping: {},
  });

export const clientFrame = <Command extends WireSchema>(command: Command) =>
  Schema.fromJsonString(clientMessage(command));

export interface ServerSchemas<
  Event extends WireSchema,
  View extends WireSchema,
  Rejection extends WireSchema,
> {
  readonly event: Event;
  readonly view: View;
  readonly rejection: Rejection;
}

export const serverMessage = <
  Event extends WireSchema,
  View extends WireSchema,
  Rejection extends WireSchema,
>(
  schemas: ServerSchemas<Event, View, Rejection>
) =>
  Schema.TaggedUnion({
    Closing: { reason: CloseReasonSchema },
    Events: {
      events: Schema.Array(schemas.event),
      from: SeqSchema,
      to: SeqSchema,
      view: schemas.view,
    },
    Pong: {},
    Presence: { connected: Schema.Array(PlayerIdSchema) },
    Reply: { id: CommandIdSchema, result: replyResult(schemas.rejection) },
    Welcome: {
      build: welcomeBuild,
      catchUp: catchUp(schemas.event),
      seq: SeqSchema,
      view: schemas.view,
      you: PlayerIdSchema,
    },
  });

export const serverFrame = <
  Event extends WireSchema,
  View extends WireSchema,
  Rejection extends WireSchema,
>(
  schemas: ServerSchemas<Event, View, Rejection>
) => Schema.fromJsonString(serverMessage(schemas));
