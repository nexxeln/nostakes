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
  "OpenedElsewhere",
  "Removed",
  "Knocking",
]);

export type CloseReason = typeof CloseReasonSchema.Type;

export const CLOSE_CODES: Readonly<Record<CloseReason, number>> = {
  ClientOutdated: 4011,
  FrameTooLarge: 1009,
  HelloTimeout: 4001,
  Knocking: 4015,
  NotAuthorized: 4003,
  NotFound: 4004,
  OpenedElsewhere: 4013,
  ProtocolViolation: 4002,
  Removed: 4014,
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
  "RoomFault",
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

export const clientMessage = <
  Command extends WireSchema,
  Signal extends WireSchema,
>(
  command: Command,
  signal: Signal
) =>
  Schema.TaggedUnion({
    Command: { command, id: CommandIdSchema },
    Hello: {
      after: Schema.OptionFromNullOr(SeqSchema),
      protocol: helloProtocol,
      token: TokenSchema,
    },
    Ping: {},
    Signal: { signal },
  });

export const clientFrame = <
  Command extends WireSchema,
  Signal extends WireSchema,
>(
  command: Command,
  signal: Signal
) => Schema.fromJsonString(clientMessage(command, signal));

export interface ServerSchemas<
  Event extends WireSchema,
  View extends WireSchema,
  Rejection extends WireSchema,
  Signal extends WireSchema,
> {
  readonly event: Event;
  readonly view: View;
  readonly rejection: Rejection;
  readonly signal: Signal;
}

export const serverMessage = <
  Event extends WireSchema,
  View extends WireSchema,
  Rejection extends WireSchema,
  Signal extends WireSchema,
>(
  schemas: ServerSchemas<Event, View, Rejection, Signal>
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
    Signal: { from: PlayerIdSchema, signal: schemas.signal },
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
  Signal extends WireSchema,
>(
  schemas: ServerSchemas<Event, View, Rejection, Signal>
) => Schema.fromJsonString(serverMessage(schemas));
