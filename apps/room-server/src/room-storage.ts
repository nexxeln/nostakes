import type { CommandId, PlayerId, RoomCode } from "@nostakes/protocol";
import type { Effect, Option } from "effect";

export const REPLIES_KEPT_PER_PLAYER = 64;

export const STORAGE_SCHEMA_VERSION = 1;

export interface StoredEvent {
  readonly seq: number;
  readonly at: number;
  readonly event: string;
}

export interface Credential {
  readonly player: PlayerId;
  readonly hash: string;
}

export interface RoomMeta {
  readonly code: RoomCode;
  readonly halted: Option.Option<string>;
}

export interface RoomStorage {
  readonly transaction: <A>(write: () => A) => A;
  readonly create: (code: RoomCode) => void;
  readonly meta: () => Option.Option<RoomMeta>;
  readonly halt: (reason: string) => void;
  readonly appendEvent: (row: StoredEvent) => void;
  readonly eventsAfter: (after: number) => readonly StoredEvent[];
  readonly countEventsAfter: (after: number) => number;
  readonly findReply: (
    player: PlayerId,
    id: CommandId
  ) => Option.Option<string>;
  readonly storeReply: (player: PlayerId, id: CommandId, reply: string) => void;
  readonly countReplies: () => number;
  readonly grant: (credential: Credential) => void;
  readonly credentials: () => readonly Credential[];
  readonly setAlarm: (at: Option.Option<number>) => void;
  readonly forget: Effect.Effect<void>;
}
