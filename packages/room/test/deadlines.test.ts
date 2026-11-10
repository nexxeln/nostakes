import { describe, expect, it } from "@effect/vitest";

import type { RoomSettings } from "../src/index.js";
import { deadlineProblems } from "./observers.js";
import { playSession, session } from "./sessions.js";

const CHECKED_ROOMS_TIMEOUT_MS = 120_000;

const checkedCasino = (settings: RoomSettings): RoomSettings => ({
  ...settings,
  shuffle: "Checked",
  table: { ...settings.table, blindPosting: "Casino" },
});

describe("deadlines in generated checked rooms with casino blinds", () => {
  it.prop(
    "in every state a night reaches, the server's own answer to the next deadline is accepted, so the room never waits on a deadline it cannot meet",
    { source: session },
    ({ source }) => {
      const played = playSession(source, undefined, checkedCasino);

      expect(played.steps.flatMap(deadlineProblems)).toStrictEqual([]);
    },
    { timeout: CHECKED_ROOMS_TIMEOUT_MS }
  );
});
