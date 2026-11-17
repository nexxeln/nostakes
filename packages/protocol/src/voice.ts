import { Schema } from "effect";

import { PlayerIdSchema, TokenSchema } from "./primitives.js";

export const MAX_VOICE_BODY_BYTES = 32_768;

export const MAX_SDP_LENGTH = 30_000;

export const MAX_VOICE_PULLS = 16;

export const MidSchema = Schema.String.check(
  Schema.isPattern(/^[\w#-]{1,64}$/u)
).pipe(Schema.brand("Mid"));

export type Mid = typeof MidSchema.Type;

export const SdpSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_SDP_LENGTH)
);

const IceText = Schema.String.check(Schema.isMaxLength(512));

export const IceServerSchema = Schema.Struct({
  credential: Schema.optionalKey(IceText),
  urls: Schema.Array(IceText).check(Schema.isMaxLength(16)),
  username: Schema.optionalKey(IceText),
});

export type IceServer = typeof IceServerSchema.Type;

export const VoiceAskSchema = Schema.TaggedUnion({
  Answer: { answer: SdpSchema },
  Drop: {
    mids: Schema.Array(MidSchema).check(Schema.isMaxLength(MAX_VOICE_PULLS)),
  },
  Join: {},
  Leave: {},
  Mute: { muted: Schema.Boolean, player: PlayerIdSchema },
  Publish: { mid: MidSchema, offer: SdpSchema },
  Pull: {
    players: Schema.Array(PlayerIdSchema).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(MAX_VOICE_PULLS)
    ),
  },
});

export type VoiceAsk = typeof VoiceAskSchema.Type;

export const VoiceRequestSchema = Schema.Struct({
  ask: VoiceAskSchema,
  token: TokenSchema,
});

export type VoiceRequest = typeof VoiceRequestSchema.Type;

export const PulledTrackSchema = Schema.Struct({
  mid: MidSchema,
  player: PlayerIdSchema,
});

export type PulledTrack = typeof PulledTrackSchema.Type;

export const VoiceReplySchema = Schema.TaggedUnion({
  Answered: {},
  Dropped: {},
  Joined: { iceServers: Schema.Array(IceServerSchema) },
  Left: {},
  Muted: {},
  Published: { answer: SdpSchema },
  Pulled: {
    offer: Schema.OptionFromNullOr(SdpSchema),
    tracks: Schema.Array(PulledTrackSchema),
  },
});

export type VoiceReply = typeof VoiceReplySchema.Type;

export const VoiceRefusalSchema = Schema.Struct({
  refusal: Schema.Literals(["VoiceUnavailable", "VoiceRefused"]),
});

export type VoiceRefusal = typeof VoiceRefusalSchema.Type;

export const VoiceSeatSchema = Schema.Struct({
  muted: Schema.Boolean,
  player: PlayerIdSchema,
  talking: Schema.Boolean,
});

export type VoiceSeat = typeof VoiceSeatSchema.Type;

export const VoiceRosterSchema = Schema.Array(VoiceSeatSchema);

export type VoiceRoster = typeof VoiceRosterSchema.Type;
