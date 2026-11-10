import { Schema } from "effect";

import { RoomCommandSchema } from "./commands.js";
import { AvatarSchema, NameSchema } from "./identity.js";
import { RequestedSettingsSchema } from "./settings.js";

const { cases } = RoomCommandSchema;

export const MemberCommandSchema = Schema.TaggedUnion({
  Act: { action: cases.Act.fields.action },
  ActForSeat: { player: cases.ActForSeat.fields.player },
  ApproveChips: { player: cases.ApproveChips.fields.player },
  ApproveSeat: { player: cases.ApproveSeat.fields.player },
  ChangeSettings: { settings: cases.ChangeSettings.fields.settings },
  ChoosePosting: { post: cases.ChoosePosting.fields.post },
  ChooseRuns: { runs: cases.ChooseRuns.fields.runs },
  CloseRoom: {},
  DealNextHand: {},
  DeclareStraddle: { on: cases.DeclareStraddle.fields.on },
  DenyChips: { player: cases.DenyChips.fields.player },
  DenySeat: { player: cases.DenySeat.fields.player },
  Join: { avatar: cases.Join.fields.avatar, name: cases.Join.fields.name },
  LeaveRoom: {},
  LeaveSeat: {},
  MuckHand: {},
  PauseGame: {},
  RabbitHunt: {},
  RemoveFromSeat: { player: cases.RemoveFromSeat.fields.player },
  RequestChips: { amount: cases.RequestChips.fields.amount },
  RequestSeat: {
    buyIn: cases.RequestSeat.fields.buyIn,
    seat: cases.RequestSeat.fields.seat,
  },
  SetProfile: {
    avatar: cases.SetProfile.fields.avatar,
    name: cases.SetProfile.fields.name,
  },
  ShowCards: { cards: cases.ShowCards.fields.cards },
  SitIn: {},
  SitOut: {},
  StartGame: {},
  TableHand: {},
  TransferHost: { to: cases.TransferHost.fields.to },
});

export type MemberCommand = typeof MemberCommandSchema.Type;

export const OpenRequestSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
  settings: Schema.optionalKey(RequestedSettingsSchema),
});

export type OpenRequest = typeof OpenRequestSchema.Type;

export const JoinRequestSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
});

export type JoinRequest = typeof JoinRequestSchema.Type;
