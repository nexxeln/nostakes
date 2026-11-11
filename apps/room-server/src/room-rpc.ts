import {
  PlayerIdSchema,
  RoomCodeSchema,
  TokenTextSchema,
} from "@nostakes/protocol";
import { Schema } from "effect";

export const MAX_MEMBERS = 64;

export const PENDING_SOCKETS = 16;

export const OpenOutcomeSchema = Schema.TaggedUnion({
  AlreadyOpen: { code: RoomCodeSchema },
  Invalid: {},
  Opened: { player: PlayerIdSchema, token: TokenTextSchema },
});

export type OpenOutcome = typeof OpenOutcomeSchema.Type;

export const JoinOutcomeSchema = Schema.TaggedUnion({
  Faulted: {},
  Invalid: {},
  Joined: { player: PlayerIdSchema, token: TokenTextSchema },
  NotFound: {},
  Refused: { rejection: Schema.Json },
  RoomFull: { members: Schema.Int },
  RoomHalted: {},
});

export type JoinOutcome = typeof JoinOutcomeSchema.Type;

export const CheckOutcomeSchema = Schema.TaggedUnion({
  Found: {},
  NotFound: {},
});

export type CheckOutcome = typeof CheckOutcomeSchema.Type;

export const StandingsOutcomeSchema = Schema.TaggedUnion({
  Halted: { view: Schema.Json },
  Invalid: {},
  NotAuthorized: {},
  NotFound: {},
  NotHalted: {},
  Removed: { view: Schema.Json },
});

export type StandingsOutcome = typeof StandingsOutcomeSchema.Type;

export const InspectionSchema = Schema.Struct({
  alarmRuns: Schema.Array(
    Schema.Struct({ at: Schema.Int, outcome: Schema.String })
  ),
  code: Schema.OptionFromNullOr(RoomCodeSchema),
  events: Schema.Array(Schema.String),
  faults: Schema.Array(Schema.String),
  halted: Schema.OptionFromNullOr(Schema.String),
  headSeq: Schema.Int,
  instance: Schema.String,
  logged: Schema.Array(Schema.String),
  members: Schema.Int,
  memoryMatchesLog: Schema.Boolean,
  replies: Schema.Int,
  rowsWritten: Schema.Int,
  seqs: Schema.Array(Schema.Int),
  sockets: Schema.Struct({ live: Schema.Int, pending: Schema.Int }),
});

export type Inspection = typeof InspectionSchema.Type;
