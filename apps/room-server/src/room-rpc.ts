import {
  PlayerIdSchema,
  RoomCodeSchema,
  TokenTextSchema,
} from "@nostakes/protocol";
import { Schema } from "effect";

export const MAX_MEMBERS = 64;

export const MAX_SOCKETS = 64;

export const OpenOutcomeSchema = Schema.TaggedUnion({
  AlreadyOpen: { code: RoomCodeSchema },
  Opened: { player: PlayerIdSchema, token: TokenTextSchema },
});

export type OpenOutcome = typeof OpenOutcomeSchema.Type;

export const JoinOutcomeSchema = Schema.TaggedUnion({
  Joined: { player: PlayerIdSchema, token: TokenTextSchema },
  NotFound: {},
  Refused: {},
  RoomFull: { members: Schema.Int },
  RoomHalted: {},
});

export type JoinOutcome = typeof JoinOutcomeSchema.Type;

export const InspectionSchema = Schema.Struct({
  alarmRuns: Schema.Array(
    Schema.Struct({ at: Schema.Int, outcome: Schema.String })
  ),
  code: Schema.OptionFromNullOr(RoomCodeSchema),
  halted: Schema.OptionFromNullOr(Schema.String),
  headSeq: Schema.Int,
  instance: Schema.String,
  members: Schema.Int,
  memoryMatchesLog: Schema.Boolean,
  replies: Schema.Int,
  seqs: Schema.Array(Schema.Int),
  sockets: Schema.Struct({ live: Schema.Int, pending: Schema.Int }),
});

export type Inspection = typeof InspectionSchema.Type;
