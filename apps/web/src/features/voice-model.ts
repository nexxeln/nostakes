import { PlayerIdSchema, VoiceRosterSchema } from "@nostakes/protocol";
import { Schema } from "effect";

export const VoicePhaseSchema = Schema.Literals([
  "Off",
  "Joining",
  "Live",
  "Retrying",
  "Refused",
  "Unavailable",
]);

export type VoicePhase = typeof VoicePhaseSchema.Type;

export const VoiceStatusSchema = Schema.Struct({
  deaf: Schema.Boolean,
  micBlocked: Schema.Boolean,
  phase: VoicePhaseSchema,
  speaking: Schema.Array(PlayerIdSchema),
});

export type VoiceStatus = typeof VoiceStatusSchema.Type;

export const VoiceSchema = Schema.Struct({
  held: Schema.Boolean,
  line: Schema.Boolean,
  micOpen: Schema.Boolean,
  on: Schema.Boolean,
  roster: VoiceRosterSchema,
  status: VoiceStatusSchema,
});

export type Voice = typeof VoiceSchema.Type;

export const VOICE_OFF: VoiceStatus = {
  deaf: false,
  micBlocked: false,
  phase: "Off",
  speaking: [],
};

export const NO_VOICE: Voice = {
  held: false,
  line: false,
  micOpen: false,
  on: false,
  roster: [],
  status: VOICE_OFF,
};
