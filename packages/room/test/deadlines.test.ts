import { describe, expect, it } from "@effect/vitest";
import { Option, Result } from "effect";

import {
  Actors,
  decide,
  millis,
  nextDeadline,
  RoomCommands,
  RoomStates,
} from "../src/index.js";
import type { RoomCommand, RoomSettings, RoomState } from "../src/index.js";
import { sealAt } from "./beacon.js";
import { bytesFrom } from "./fixtures.js";
import { deadlineProblems } from "./observers.js";
import { generated } from "./scale.js";
import { playSession, session } from "./sessions.js";
import type { Step } from "./sessions.js";

const checkedCasino = (settings: RoomSettings): RoomSettings => ({
  ...settings,
  shuffle: "Checked",
  table: { ...settings.table, blindPosting: "Casino" },
});

const DAY_MS = 86_400_000;

const serverWork = (at: number, seed: number): readonly RoomCommand[] => [
  RoomCommands.RunQueue({ at: millis(at), by: Actors.Server() }),
  RoomCommands.Deal({
    at: millis(at),
    by: Actors.Server(),
    shuffleBytes: bytesFrom(seed),
  }),
  sealAt(at, seed),
];

const owedWithoutDeadline = (step: Step, index: number): readonly string[] => {
  const state: RoomState = step.after;

  if (!RoomStates.$is("Open")(state) || Option.isSome(nextDeadline(state))) {
    return [];
  }

  return serverWork(state.now + DAY_MS, index).flatMap((command) => {
    const owed = decide(state, command);

    return Result.isSuccess(owed) && owed.success.length > 0
      ? [
          `after ${step.command._tag} the room would take ${command._tag} but names no deadline`,
        ]
      : [];
  });
};

describe("deadlines in generated checked rooms with casino blinds", () => {
  it.prop(
    "in every state a night reaches, the server's own answer to the next deadline is accepted, so the room never waits on a deadline it cannot meet",
    { source: session },
    ({ source }) => {
      const played = playSession(source, undefined, checkedCasino);

      expect(played.steps.flatMap(deadlineProblems)).toStrictEqual([]);
    },
    generated(8, 100)
  );
});

describe("work the room owes", () => {
  it.prop(
    "in every state a night reaches, when the room would take a queue run, a deal, or a seal from the server, it names a deadline for it",
    { checked: session, plain: session },
    ({ checked, plain }) => {
      expect([
        ...playSession(checked, undefined, checkedCasino).steps.flatMap(
          owedWithoutDeadline
        ),
        ...playSession(plain).steps.flatMap(owedWithoutDeadline),
      ]).toStrictEqual([]);
    },
    generated(10, 100)
  );
});
