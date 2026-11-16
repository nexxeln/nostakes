import { Schema } from "effect";

export const FEEDBACK_ROUTE = "/rooms/feedback";

export const FEEDBACK_READ_ROUTE = "/rooms/feedback/read";

export const FEEDBACK_SCREENS = [
  "Home",
  "Create",
  "Invitation",
  "Room",
  "Settled",
  "Other",
] as const;

export const MAX_NOTE_LENGTH = 1000;

export const MAX_AGENT_LENGTH = 300;

export const MOST_NOTES_KEPT = 5000;

export const NOTES_PER_READ = 200;

export const FEEDBACK_SECRET = "FEEDBACK_SECRET";

const NoteTextSchema = Schema.String.check(
  Schema.isMaxLength(MAX_NOTE_LENGTH),
  Schema.isPattern(/^\S(?:[\s\S]*\S)?$/u),
  Schema.isPattern(/^(?:[^\p{Cc}\p{Cs}]|[\n\t])*$/u)
);

const BuildSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._-]{1,64}$/u)
);

const AgentSchema = Schema.String.check(
  Schema.isPattern(new RegExp(`^[ -~]{0,${MAX_AGENT_LENGTH}}$`, "u"))
);

const PixelsSchema = Schema.Int.check(
  Schema.isBetween({ maximum: 100_000, minimum: 0 })
);

export const FeedbackNoteSchema = Schema.Struct({
  agent: AgentSchema,
  build: BuildSchema,
  height: PixelsSchema,
  note: NoteTextSchema,
  screen: Schema.Literals(FEEDBACK_SCREENS),
  width: PixelsSchema,
});

export type FeedbackNote = typeof FeedbackNoteSchema.Type;

export const KeptNoteSchema = Schema.Struct({
  ...FeedbackNoteSchema.fields,
  at: Schema.Int,
  id: Schema.Int,
});

export type KeptNote = typeof KeptNoteSchema.Type;

export const FeedbackReadSchema = Schema.Struct({
  after: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  since: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type FeedbackRead = typeof FeedbackReadSchema.Type;

export const FeedbackPageSchema = Schema.Struct({
  more: Schema.Boolean,
  notes: Schema.Array(KeptNoteSchema),
});

export type FeedbackPage = typeof FeedbackPageSchema.Type;
