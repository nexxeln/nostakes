import type {
  CloseReason,
  CommandId,
  PlayerId,
  Seq,
  Token,
} from "@nostakes/protocol";
import { Data } from "effect";
import type { Option } from "effect";

import type {
  CatchUp,
  ClientMessage,
  ReplyResult,
  RoomTypes,
} from "./codec.js";

export interface Link<T extends RoomTypes> {
  readonly transmit: (message: ClientMessage<T>) => void;
}

export type Activity<Event> = Data.TaggedEnum<{
  Applied: { readonly seq: Seq; readonly event: Event };
  Skipped: { readonly from: Seq; readonly to: Seq };
}>;

interface ActivityDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Activity<this["A"]>;
}

export const Activities = Data.taggedEnum<ActivityDefinition>();

export interface PendingCommand<T extends RoomTypes> {
  readonly id: CommandId;
  readonly command: T["Command"];
  readonly sent: boolean;
}

export type DropReason =
  | "ConnectTimeout"
  | "GreetingTimeout"
  | "Silent"
  | "Unanswered"
  | "Gap"
  | "Malformed"
  | "Garbled"
  | "SocketClosed"
  | CloseReason;

export interface Owed {
  readonly replies: readonly CommandId[];
  readonly pingsSent: number;
  readonly pongsHeard: number;
  readonly late: readonly CommandId[];
  readonly overdue: readonly string[];
}

export interface ClientInput {
  readonly url: string;
  readonly token: Token;
}

export interface ClientContext<T extends RoomTypes> extends ClientInput {
  readonly applied: Option.Option<Seq>;
  readonly view: Option.Option<T["View"]>;
  readonly you: Option.Option<PlayerId>;
  readonly presence: readonly PlayerId[];
  readonly pending: readonly PendingCommand<T>[];
  readonly owed: Owed;
  readonly failures: number;
  readonly retryDelayMs: number;
  readonly link: Option.Option<Link<T>>;
  readonly drop: Option.Option<DropReason>;
  readonly refusal: Option.Option<CloseReason>;
}

export interface ConnectionPayloads<T extends RoomTypes> {
  readonly Opened: { readonly link: Link<T> };
  readonly Welcome: {
    readonly catchUp: CatchUp<T>;
    readonly seq: Seq;
    readonly view: T["View"];
    readonly you: PlayerId;
  };
  readonly Batch: {
    readonly events: readonly T["Event"][];
    readonly from: Seq;
    readonly to: Seq;
    readonly view: T["View"];
  };
  readonly Reply: { readonly id: CommandId; readonly result: ReplyResult<T> };
  readonly Presence: { readonly connected: readonly PlayerId[] };
  readonly Closing: { readonly reason: CloseReason };
  readonly Closed: { readonly code: number; readonly reason: string };
}

export type ConnectionEvent<T extends RoomTypes> =
  | {
      readonly [K in keyof ConnectionPayloads<T>]: {
        readonly type: K;
      } & ConnectionPayloads<T>[K];
    }[keyof ConnectionPayloads<T>]
  | { readonly type: "Pong" }
  | { readonly type: "Garbled" }
  | { readonly type: "CommandSent"; readonly id: CommandId }
  | { readonly type: "PingSent" };
