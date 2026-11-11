import { Schema } from "effect";

import { beatOf } from "./lesson.js";
import type { Lesson } from "./lesson.js";

export const GUIDE_STEPS = [
  "Started",
  "Hand2",
  "Hand3",
  "Hand4",
  "Hand5",
  "Finished",
] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export const GUIDE_TIMES = [
  "Under1m",
  "1to2m",
  "2to3m",
  "3to5m",
  "Over5m",
] as const;

export type GuideTime = (typeof GUIDE_TIMES)[number];

export const GuideReportSchema = Schema.TaggedUnion({
  GuideStep: { step: Schema.Literals(GUIDE_STEPS) },
  GuideTook: { took: Schema.Literals(GUIDE_TIMES) },
});

const encode = Schema.encodeSync(Schema.fromJsonString(GuideReportSchema));

const MINUTE_MS = 60_000;

export const timeTaken = (ms: number): GuideTime => {
  const minutes = ms / MINUTE_MS;

  if (minutes < 1) {
    return "Under1m";
  }

  if (minutes < 2) {
    return "1to2m";
  }

  if (minutes < 3) {
    return "2to3m";
  }

  return minutes < 5 ? "3to5m" : "Over5m";
};

export const stepReport = (step: GuideStep) =>
  encode(GuideReportSchema.cases.GuideStep.make({ step }));

export const tookReport = (ms: number) =>
  encode(GuideReportSchema.cases.GuideTook.make({ took: timeTaken(ms) }));

export const stepAt = (lesson: Lesson, at: string): GuideStep | undefined => {
  if (beatOf(lesson, at)?.kind === "Recap") {
    return "Finished";
  }

  const hand = lesson.hands.findIndex((each) => each.first === at);

  return hand === -1 ? undefined : GUIDE_STEPS[hand];
};
