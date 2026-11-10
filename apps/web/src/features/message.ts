import { ActionSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MemberCommandSchema } from "@nostakes/room";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { defineTaggedUnion } from "foldkit/schema";

import { CopiedSchema, LinkSchema } from "./model.js";

export const ReplyOutcomes = defineTaggedUnion({
  Accepted: { seq: Schema.Int },
  Lost: { reason: Schema.String },
  Rejected: { reason: Schema.String },
});

export type ReplyOutcome = typeof ReplyOutcomes.Type;

export const DraftFieldSchema = Schema.Literals(["buyIn", "chips", "raiseTo"]);

export type DraftField = typeof DraftFieldSchema.Type;

export const Messages = defineMessageUnion({
  AcquiredConnection: {},
  ChangedDraft: { field: DraftFieldSchema, value: Schema.String },
  ChangedJoinCode: { value: Schema.String },
  ChangedName: { value: Schema.String },
  ChangedSetting: { path: Schema.String, value: Schema.String },
  ClickedAction: { action: ActionSchema },
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
  CompletedWake: {},
  EnteredRoom: { code: RoomCodeSchema, player: PlayerIdSchema },
  FailedConnection: { problem: Schema.String },
  FailedEntry: { problem: Schema.String },
  GotLink: { link: LinkSchema },
  GotReply: { key: Schema.Int, outcome: ReplyOutcomes },
  PickedAvatar: { avatar: Schema.String },
  ReleasedConnection: {},
  SubmittedCreate: {},
  SubmittedInvite: {},
  SubmittedJoin: {},
  Ticked: { now: Schema.Int },
  WokePage: { visible: Schema.Boolean },
});

export type Message = typeof Messages.Type;
