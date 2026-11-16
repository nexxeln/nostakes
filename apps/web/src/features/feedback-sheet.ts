import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

export const FEEDBACK_PATH = "/rooms/feedback";

export const MAX_NOTE_LENGTH = 1000;

export const MAX_AGENT_LENGTH = 300;

export const FeedbackScreenSchema = Schema.Literals([
  "Home",
  "Create",
  "Invitation",
  "Room",
  "Settled",
  "Other",
]);

export type FeedbackScreen = typeof FeedbackScreenSchema.Type;

export const FeedbackStages = defineTaggedUnion({
  Failed: { reason: Schema.String },
  Sending: {},
  Sent: {},
  Writing: {},
});

export type FeedbackStage = typeof FeedbackStages.Type;

export const FeedbackSheetSchema = Schema.Struct({
  note: Schema.String,
  stage: FeedbackStages,
});

export type FeedbackSheet = typeof FeedbackSheetSchema.Type;

export const FeedbackNoteSchema = Schema.Struct({
  agent: Schema.String,
  build: Schema.String,
  height: Schema.Int,
  note: Schema.String,
  screen: FeedbackScreenSchema,
  width: Schema.Int,
});

export type FeedbackNote = typeof FeedbackNoteSchema.Type;

const UNSENDABLE = /[\p{Cs}\p{Cc}]/gu;

const KEPT_CONTROLS = /[\n\t]/u;

const sendable = (text: string) =>
  text
    .replaceAll(UNSENDABLE, (found) => (KEPT_CONTROLS.test(found) ? found : ""))
    .trim();

export const enteredNote = (text: string) =>
  sendable(sendable(text).slice(0, MAX_NOTE_LENGTH));

const UNPRINTABLE_ASCII = /[^ -~]/gu;

export const sentAgent = (agent: string) =>
  agent.replaceAll(UNPRINTABLE_ASCII, "?").slice(0, MAX_AGENT_LENGTH);

export const freshFeedback: FeedbackSheet = {
  note: "",
  stage: FeedbackStages.Writing(),
};
