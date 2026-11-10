import { AvatarSchema } from "@nostakes/avatar";
import {
  BuildIdSchema,
  CloseReasonSchema,
  PlayerIdSchema,
  ProtocolVersionSchema,
  RoomCodeSchema,
} from "@nostakes/protocol";
import {
  MemberCommandSchema,
  ReactionSchema,
  RoomViewSchema,
} from "@nostakes/room";
import { Option, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { RuleGroupSchema } from "./rules-copy.js";
import { HintSchema, TableEventSchema } from "./table/snapshot.js";

export const FacePartSchema = Schema.Literals([
  "Species",
  "Colour",
  "Suit",
  "Card",
  "Eyes",
  "Mouth",
  "Headwear",
  "Eyewear",
  "Neck",
  "Mark",
  "Extra",
]);

export type FacePart = typeof FacePartSchema.Type;

export const ThemeSchema = Schema.Literals(["Light", "Dark"]);

export type Theme = typeof ThemeSchema.Type;

export const DeckSchema = Schema.Literals(["TwoColour", "FourColour"]);

export type Deck = typeof DeckSchema.Type;

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
  "Outdated",
  "Stopped",
]);

export type ConnectionPhase = typeof ConnectionPhaseSchema.Type;

export const LinkSchema = Schema.Struct({
  newBuild: Schema.Option(BuildIdSchema),
  phase: ConnectionPhaseSchema,
  presence: Schema.Array(PlayerIdSchema),
  receivedAt: Schema.Int,
  refusal: Schema.Option(CloseReasonSchema),
  retryDelayMs: Schema.Option(Schema.Int),
});

export type Link = typeof LinkSchema.Type;

export const ReloadTargets = defineTaggedUnion({
  NewBuild: { build: BuildIdSchema },
  NewProtocol: { outdated: ProtocolVersionSchema },
});

export type ReloadTarget = typeof ReloadTargets.Type;

export const PageUpdateSchema = Schema.Struct({
  stage: Schema.Literals(["AfterThisHand", "Reloading", "Stuck"]),
  target: ReloadTargets,
});

export type PageUpdate = typeof PageUpdateSchema.Type;

export const ShownViewSchema = Schema.Struct({
  receivedAt: Schema.Int,
  seq: Schema.Int,
  view: RoomViewSchema,
});

export type ShownView = typeof ShownViewSchema.Type;

export const PendingSchema = Schema.Struct({
  acting: Schema.Boolean,
  key: Schema.Int,
  label: Schema.String,
});

export type Pending = typeof PendingSchema.Type;

export const SettingsDraftSchema = Schema.Record(Schema.String, Schema.String);

export type SettingsDraft = typeof SettingsDraftSchema.Type;

export const RulesSheetSchema = Schema.Struct({
  draft: SettingsDraftSchema,
  help: Schema.Option(Schema.String),
  open: Schema.Option(RuleGroupSchema),
});

export type RulesSheet = typeof RulesSheetSchema.Type;

export const ConfirmSchema = Schema.Union([
  MemberCommandSchema.cases.CloseRoom,
  MemberCommandSchema.cases.LeaveRoom,
  MemberCommandSchema.cases.RemoveFromSeat,
]);

export type Confirm = typeof ConfirmSchema.Type;

export const DraftsSchema = Schema.Struct({
  buyIn: Schema.String,
  chips: Schema.String,
  seat: Schema.Option(Schema.Int),
});

export type Drafts = typeof DraftsSchema.Type;

export const CopiedSchema = Schema.Literals([
  "Nothing",
  "Link",
  "Settlement",
  "Proof",
]);

export const CheckTimingSchema = Schema.Literals([
  "InTime",
  "TooCloseToCall",
  "NotWatched",
]);

export const FairMarks = defineTaggedUnion({
  Cancelled: { round: Schema.Int },
  Checked: { cards: Schema.Int, round: Schema.Int, timing: CheckTimingSchema },
  Failed: { proof: Schema.String, reason: Schema.String },
  NotChecked: { round: Schema.Int },
});

export type FairMark = typeof FairMarks.Type;

export const FairHandSchema = Schema.Struct({
  hand: Schema.Int,
  mark: FairMarks,
});

export type FairHand = typeof FairHandSchema.Type;

export const InRoomSchema = Schema.Struct({
  addingChips: Schema.Boolean,
  clockSamples: Schema.Array(Schema.Int),
  code: RoomCodeSchema,
  confirm: Schema.Option(ConfirmSchema),
  connected: Schema.Boolean,
  copied: CopiedSchema,
  drafts: DraftsSchema,
  events: Schema.Array(TableEventSchema),
  fairness: Schema.Array(FairHandSchema),
  fairnessOpen: Schema.Boolean,
  link: Schema.Option(LinkSchema),
  member: Schema.Option(PlayerIdSchema),
  menu: Schema.Boolean,
  notice: Schema.Option(Schema.String),
  peeks: Schema.Array(
    Schema.Struct({ player: PlayerIdSchema, until: Schema.Int })
  ),
  pending: Schema.Array(PendingSchema),
  picked: Schema.Option(Schema.Int),
  player: PlayerIdSchema,
  reactions: Schema.Array(
    Schema.Struct({
      id: Schema.Int,
      player: PlayerIdSchema,
      reaction: ReactionSchema,
      until: Schema.Int,
    })
  ),
  resumed: Schema.Option(
    Schema.Struct({ player: PlayerIdSchema, receivedAt: Schema.Int })
  ),
  rules: Schema.Option(RulesSheetSchema),
  shown: Schema.Option(ShownViewSchema),
  update: Schema.Option(PageUpdateSchema),
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

export const RoomRecordSchema = Schema.Struct({
  closed: Schema.Boolean,
  code: RoomCodeSchema,
  left: Schema.Boolean,
  others: Schema.Array(Schema.String),
  seenAt: Schema.Int,
});

export type RoomRecord = typeof RoomRecordSchema.Type;

export const KnownRoomSchema = Schema.Struct({
  player: PlayerIdSchema,
  record: RoomRecordSchema,
});

export type KnownRoom = typeof KnownRoomSchema.Type;

export const ReportingSchema = Schema.Struct({
  errors: Schema.Int,
  reconnects: Schema.Int,
});

export type Reporting = typeof ReportingSchema.Type;

export const ModelSchema = Schema.Struct({
  build: Schema.String,
  counting: Schema.Boolean,
  deck: DeckSchema,
  faceDraft: Schema.Option(AvatarSchema),
  facePart: FacePartSchema,
  faceShuffled: Schema.Boolean,
  joinCode: Schema.String,
  learned: Schema.Array(HintSchema),
  nextKey: Schema.Int,
  now: Schema.Int,
  profile: ProfileSchema,
  reloadedFor: Schema.Option(ReloadTargets),
  reporting: ReportingSchema,
  rooms: Schema.Array(KnownRoomSchema),
  screen: Screens,
  sound: Schema.Boolean,
  systemTheme: ThemeSchema,
  theme: Schema.Option(ThemeSchema),
});

export type Model = typeof ModelSchema.Type;

export const pageTheme = (model: Model): Theme =>
  Option.getOrElse(model.theme, () => model.systemTheme);

export const SavedPassSchema = Schema.Struct({
  code: RoomCodeSchema,
  player: PlayerIdSchema,
});

export type SavedPass = typeof SavedPassSchema.Type;

export const FlagsSchema = Schema.Struct({
  build: Schema.optionalKey(Schema.String),
  counting: Schema.optionalKey(Schema.Boolean),
  deck: DeckSchema,
  invite: Schema.Option(RoomCodeSchema),
  learned: Schema.Array(HintSchema),
  profile: ProfileSchema,
  reloadedFor: Schema.Option(ReloadTargets),
  rooms: Schema.Array(KnownRoomSchema),
  saved: Schema.Option(SavedPassSchema),
  sound: Schema.Boolean,
  systemTheme: ThemeSchema,
  theme: Schema.Option(ThemeSchema),
});

export type Flags = typeof FlagsSchema.Type;
