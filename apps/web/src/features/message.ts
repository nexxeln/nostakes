import { AvatarSchema } from "@nostakes/avatar";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  MemberCommandSchema,
  RemovedViewSchema,
  RoomRejectionSchema,
  RoomSignalSchema,
  RoomViewSchema,
  SeenEventSchema,
} from "@nostakes/room";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { defineTaggedUnion } from "foldkit/schema";

import {
  ConfirmSchema,
  CopiedSchema,
  DeckSchema,
  FacePartSchema,
  FairMarks,
  LinkSchema,
  ThemeSchema,
} from "./model.js";
import { PresetSchema, RuleGroupSchema } from "./rules-copy.js";
import { TableIntentSchema } from "./table/snapshot.js";

export const ReplyOutcomes = defineTaggedUnion({
  Accepted: { seq: Schema.Int },
  Lost: { reason: Schema.String },
  Rejected: { rejection: RoomRejectionSchema },
});

export type ReplyOutcome = typeof ReplyOutcomes.Type;

export const DraftFieldSchema = Schema.Literals(["buyIn", "chips"]);

export type DraftField = typeof DraftFieldSchema.Type;

export const Messages = defineMessageUnion({
  AcquiredConnection: {},
  CaughtError: { message: Schema.String, name: Schema.String },
  ChangedDraft: { field: DraftFieldSchema, value: Schema.String },
  ChangedJoinCode: { value: Schema.String },
  ChangedName: { value: Schema.String },
  ChangedSetting: { path: Schema.String, value: Schema.String },
  ChangedSystemTheme: { theme: ThemeSchema },
  CheckedRoom: { code: RoomCodeSchema, gone: Schema.Boolean },
  ChoseDeck: { deck: DeckSchema },
  ChoseFacePart: { part: FacePartSchema },
  ChosePreset: { preset: PresetSchema },
  ChoseTheme: { theme: ThemeSchema },
  ClickedAddChips: {},
  ClickedCancelFace: {},
  ClickedCheckResult: {},
  ClickedConfirm: { confirm: ConfirmSchema },
  ClickedCopyLink: {},
  ClickedCopyProof: { hand: Schema.Int },
  ClickedCopySettlement: {},
  ClickedEditFace: {},
  ClickedFairness: {},
  ClickedHome: {},
  ClickedHouseRules: {},
  ClickedKnownRoom: { code: RoomCodeSchema },
  ClickedMember: { player: PlayerIdSchema },
  ClickedMenu: {},
  ClickedRequestChips: {},
  ClickedRoomCommand: { command: MemberCommandSchema, label: Schema.String },
  ClickedRuleGroup: { group: RuleGroupSchema },
  ClickedRuleHelp: { path: Schema.String },
  ClickedSaveFace: {},
  ClickedSaveSettings: {},
  ClickedSeat: { seat: Schema.Int },
  ClickedShuffleFace: {},
  ClickedSit: { seat: Schema.Int },
  ClickedUseHere: {},
  ClosedSheet: {},
  CompletedCopy: { copied: CopiedSchema },
  CompletedForget: { code: RoomCodeSchema },
  CompletedNavigation: { path: Schema.String },
  CompletedPreference: {},
  CompletedWake: {},
  EnteredRoom: { code: RoomCodeSchema, player: PlayerIdSchema },
  FailedConnection: { problem: Schema.String },
  FailedEntry: { problem: Schema.String },
  GotLink: { link: LinkSchema },
  GotOwnResult: { result: RemovedViewSchema },
  GotReply: { key: Schema.Int, outcome: ReplyOutcomes },
  GotStandings: { view: RoomViewSchema },
  GotTableIntent: { intent: TableIntentSchema },
  GotUpdate: {
    events: Schema.Array(
      Schema.Struct({ event: SeenEventSchema, seq: Schema.Int })
    ),
    receivedAt: Schema.Int,
    seq: Schema.Int,
    view: RoomViewSchema,
  },
  HeardSignal: {
    from: PlayerIdSchema,
    receivedAt: Schema.Int,
    signal: RoomSignalSchema,
  },
  JudgedHand: { hand: Schema.Int, mark: FairMarks },
  MissedOwnResult: { reason: Schema.String },
  MissedStandings: { reason: Schema.String },
  PickedAvatar: { avatar: AvatarSchema },
  ReleasedConnection: {},
  SentSignal: {
    at: Schema.Int,
    sent: Schema.Boolean,
    signal: RoomSignalSchema,
  },
  ShuffledFace: { avatar: AvatarSchema },
  StartedReload: {},
  SubmittedCreate: {},
  SubmittedInvite: {},
  SubmittedJoin: {},
  SwitchedCounting: { on: Schema.Boolean },
  SwitchedSound: { on: Schema.Boolean },
  Ticked: { now: Schema.Int },
  WokePage: { visible: Schema.Boolean },
});

export type Message = typeof Messages.Type;
