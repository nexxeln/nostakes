import {
  CloseReasonSchema,
  PlayerIdSchema,
  RoomCodeSchema,
} from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

export const AVATARS = [
  "🦊",
  "🐻",
  "🐼",
  "🐸",
  "🦉",
  "🐙",
  "🦁",
  "🐯",
  "🐨",
  "🐧",
  "🐢",
  "🦄",
] as const;

export const ProfileSchema = Schema.Struct({
  avatar: Schema.String,
  name: Schema.String,
});

export type Profile = typeof ProfileSchema.Type;

export const ConnectionPhaseSchema = Schema.Literals([
  "Idle",
  "Connecting",
  "Greeting",
  "Live",
  "Waiting",
  "Refused",
  "Stopped",
]);

export type ConnectionPhase = typeof ConnectionPhaseSchema.Type;

export const LinkSchema = Schema.Struct({
  phase: ConnectionPhaseSchema,
  presence: Schema.Array(PlayerIdSchema),
  receivedAt: Schema.Int,
  refusal: Schema.Option(CloseReasonSchema),
  retryDelayMs: Schema.Option(Schema.Int),
  view: Schema.Option(RoomViewSchema),
});

export type Link = typeof LinkSchema.Type;

export const PendingSchema = Schema.Struct({
  acting: Schema.Boolean,
  key: Schema.Int,
  label: Schema.String,
});

export type Pending = typeof PendingSchema.Type;

export const SettingsDraftSchema = Schema.Record(Schema.String, Schema.String);

export type SettingsDraft = typeof SettingsDraftSchema.Type;

export const DraftsSchema = Schema.Struct({
  buyIn: Schema.String,
  chips: Schema.String,
  raiseTo: Schema.String,
  seat: Schema.Option(Schema.Int),
});

export type Drafts = typeof DraftsSchema.Type;

export const CopiedSchema = Schema.Literals(["Nothing", "Link", "Settlement"]);

export const InRoomSchema = Schema.Struct({
  code: RoomCodeSchema,
  connected: Schema.Boolean,
  copied: CopiedSchema,
  drafts: DraftsSchema,
  link: Schema.Option(LinkSchema),
  notice: Schema.Option(Schema.String),
  pending: Schema.Array(PendingSchema),
  player: PlayerIdSchema,
  settings: Schema.Option(SettingsDraftSchema),
});

export type InRoom = typeof InRoomSchema.Type;

export const Screens = defineTaggedUnion({
  Home: {
    busy: Schema.Boolean,
    problem: Schema.Option(Schema.String),
  },
  Invited: {
    busy: Schema.Boolean,
    code: RoomCodeSchema,
    problem: Schema.Option(Schema.String),
  },
  Room: { room: InRoomSchema },
});

export type Screen = typeof Screens.Type;

export const ModelSchema = Schema.Struct({
  joinCode: Schema.String,
  nextKey: Schema.Int,
  now: Schema.Int,
  profile: ProfileSchema,
  screen: Screens,
});

export type Model = typeof ModelSchema.Type;

export const SavedPassSchema = Schema.Struct({
  code: RoomCodeSchema,
  player: PlayerIdSchema,
});

export type SavedPass = typeof SavedPassSchema.Type;

export const FlagsSchema = Schema.Struct({
  invite: Schema.Option(RoomCodeSchema),
  profile: ProfileSchema,
  saved: Schema.Option(SavedPassSchema),
});

export type Flags = typeof FlagsSchema.Type;
