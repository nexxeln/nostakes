import { AvatarSchema, ExpressionSchema, PartSchema } from "@nostakes/avatar";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  KnockViewSchema,
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
  FairMarks,
  LinkSchema,
  ThemeSchema,
} from "./model.js";
import { TonightCountSchema } from "./moments/element.js";
import { PresetSchema, RuleGroupSchema } from "./rules-copy.js";
import { TableIntentSchema } from "./table/snapshot.js";
import { VoiceStatusSchema } from "./voice-model.js";

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
  AcquiredVoice: {},
  ChangedVoice: { status: VoiceStatusSchema },
  ClickedHearVoice: {},
  ClickedMic: {},
  ClickedMuteForEveryone: { muted: Schema.Boolean, player: PlayerIdSchema },
  ClickedVoice: {},
  FailedVoice: { problem: Schema.String },
  HeldTalkKey: { held: Schema.Boolean },
  MutedForEveryone: { done: Schema.Boolean },
  ReleasedVoice: {},
  SyncedVoice: {},
  CaughtError: { message: Schema.String, name: Schema.String },
  ChangedComeBackName: { value: Schema.String },
  ChangedDraft: { field: DraftFieldSchema, value: Schema.String },
  ChangedFeedback: { value: Schema.String },
  ChangedJoinCode: { value: Schema.String },
  ChangedName: { value: Schema.String },
  ChangedSetting: { path: Schema.String, value: Schema.String },
  ChangedSetupSetting: { path: Schema.String, value: Schema.String },
  ChangedSystemTheme: { theme: ThemeSchema },
  CheckedRoom: { code: RoomCodeSchema, gone: Schema.Boolean },
  ChoseDeck: { deck: DeckSchema },
  ChoseFaceMood: { mood: ExpressionSchema },
  ChoseFacePart: { part: PartSchema },
  ChoseHeir: { player: PlayerIdSchema },
  ChosePreset: { preset: PresetSchema },
  ChoseSetupPreset: { preset: PresetSchema },
  ChoseTheme: { theme: ThemeSchema },
  ClickedAddChips: {},
  ClickedBackToWelcome: {},
  ClickedCancelFace: {},
  ClickedCheckResult: {},
  ClickedComeBack: {},
  ClickedConfirm: { confirm: ConfirmSchema },
  ClickedCopyLink: {},
  ClickedCopyProof: { hand: Schema.Int },
  ClickedCopySettlement: {},
  ClickedEditFace: {},
  ClickedFairness: {},
  ClickedFeedback: {},
  ClickedHome: {},
  ClickedHouseRules: {},
  ClickedKnockAgain: {},
  ClickedKnownRoom: { code: RoomCodeSchema },
  ClickedLeave: {},
  ClickedMember: { player: PlayerIdSchema },
  ClickedMenu: {},
  ClickedTonight: {},
  ClickedOpenRoom: {},
  ClickedRequestChips: {},
  ClickedRoomCommand: { command: MemberCommandSchema, label: Schema.String },
  ClickedRuleGroup: { group: RuleGroupSchema },
  ClickedRuleHelp: { path: Schema.String },
  ClickedSaveFace: {},
  ClickedSaveSettings: {},
  ClickedSeat: { seat: Schema.Int },
  ClickedSetup: {},
  ClickedShareLink: {},
  ClickedShuffleFace: {},
  ClickedSit: { seat: Schema.Int },
  ClickedStandardRules: {},
  ClickedUndoFace: {},
  ClickedUseHere: {},
  ClosedSheet: {},
  CompletedCopy: { copied: CopiedSchema },
  CompletedForget: { code: RoomCodeSchema },
  CompletedNavigation: { path: Schema.String },
  CountedTonight: { count: TonightCountSchema },
  CompletedPreference: {},
  CompletedWake: {},
  EnteredRoom: {
    code: RoomCodeSchema,
    opened: Schema.Boolean,
    player: PlayerIdSchema,
    rulesDropped: Schema.Boolean,
  },
  FailedConnection: { problem: Schema.String },
  FailedEntry: { problem: Schema.String },
  FlippedFacePart: { by: Schema.Int, part: PartSchema },
  HeardSignal: {
    from: PlayerIdSchema,
    receivedAt: Schema.Int,
    signal: RoomSignalSchema,
  },
  JudgedHand: { hand: Schema.Int, mark: FairMarks },
  KnockedAtRoom: {
    at: Schema.Int,
    code: RoomCodeSchema,
    knock: KnockViewSchema,
    player: PlayerIdSchema,
  },
  LetInside: {},
  MissedFeedback: { reason: Schema.String },
  MissedKnock: { reason: Schema.String },
  MissedOwnResult: { reason: Schema.String },
  MissedStandings: { reason: Schema.String },
  PickedAvatar: { avatar: AvatarSchema },
  PolledDoor: {},
  ReceivedKnock: { at: Schema.Int, knock: KnockViewSchema },
  ReceivedLink: { link: LinkSchema },
  ReceivedOwnResult: { result: RemovedViewSchema },
  ReceivedReply: { key: Schema.Int, outcome: ReplyOutcomes },
  ReceivedStandings: { view: RoomViewSchema },
  ReceivedTableIntent: { intent: TableIntentSchema },
  ReceivedUpdate: {
    events: Schema.Array(
      Schema.Struct({ event: SeenEventSchema, seq: Schema.Int })
    ),
    receivedAt: Schema.Int,
    seq: Schema.Int,
    view: RoomViewSchema,
  },
  ReleasedConnection: {},
  ScrolledToTop: {},
  ScrubbedFacePart: { by: Schema.Int, part: PartSchema },
  SentFeedback: {},
  SentSignal: {
    at: Schema.Int,
    sent: Schema.Boolean,
    signal: RoomSignalSchema,
  },
  SettledFaceScrub: { kept: Schema.Boolean },
  SettledSetupEdit: { token: Schema.Int },
  ShuffledFace: { avatar: AvatarSchema },
  StartedReload: {},
  SubmittedCreate: {},
  SubmittedFeedback: {},
  SubmittedInvite: {},
  SubmittedJoin: {},
  SwitchedCounting: { on: Schema.Boolean },
  SwitchedSound: { on: Schema.Boolean },
  Ticked: { now: Schema.Int },
  WokePage: { visible: Schema.Boolean },
});

export type Message = typeof Messages.Type;
