import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MemberCommandSchema, SeenEventSchema } from "@nostakes/room";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { defineTaggedUnion } from "foldkit/schema";

import { CopiedSchema, LinkSchema, ThemeSchema } from "./model.js";
import { TableIntentSchema } from "./table/snapshot.js";

export const ReplyOutcomes = defineTaggedUnion({
  Accepted: { seq: Schema.Int },
  Lost: { reason: Schema.String },
  Rejected: { reason: Schema.String },
});

export type ReplyOutcome = typeof ReplyOutcomes.Type;

export const DraftFieldSchema = Schema.Literals(["buyIn", "chips"]);

export type DraftField = typeof DraftFieldSchema.Type;

export const Messages = defineMessageUnion({
  AcquiredConnection: {},
  AppliedEvent: { event: SeenEventSchema, seq: Schema.Int },
  ChangedDraft: { field: DraftFieldSchema, value: Schema.String },
  ChangedJoinCode: { value: Schema.String },
  ChangedName: { value: Schema.String },
  ChangedSetting: { path: Schema.String, value: Schema.String },
  ChoseTheme: { theme: ThemeSchema },
  ClickedCancelSeat: {},
  ClickedCloseSettings: {},
  ClickedCopyLink: {},
  ClickedCopySettlement: {},
  ClickedHome: {},
  ClickedOpenSettings: {},
  ClickedRequestChips: {},
  ClickedRoomCommand: { command: MemberCommandSchema, label: Schema.String },
  ClickedSaveSettings: {},
  ClickedSeat: { seat: Schema.Int },
  ClickedSit: { seat: Schema.Int },
  CompletedCopy: { copied: CopiedSchema },
  CompletedForget: { code: RoomCodeSchema },
  CompletedNavigation: { path: Schema.String },
  CompletedPreference: {},
  CompletedWake: {},
  EnteredRoom: { code: RoomCodeSchema, player: PlayerIdSchema },
  FailedConnection: { problem: Schema.String },
  FailedEntry: { problem: Schema.String },
  GotLink: { link: LinkSchema },
  GotReply: { key: Schema.Int, outcome: ReplyOutcomes },
  GotTableIntent: { intent: TableIntentSchema },
  PickedAvatar: { avatar: Schema.String },
  ReleasedConnection: {},
  SubmittedCreate: {},
  SubmittedInvite: {},
  SubmittedJoin: {},
  SwitchedSound: { on: Schema.Boolean },
  Ticked: { now: Schema.Int },
  WokePage: { visible: Schema.Boolean },
});

export type Message = typeof Messages.Type;
