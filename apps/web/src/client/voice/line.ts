import type { VoiceRoster } from "@nostakes/protocol";
import {
  createEffectActor,
  snapshots,
  taggedState,
  waitFor,
} from "@xstate/effect";
import { Effect, Stream } from "effect";
import type { SnapshotFrom } from "xstate";

import type { VoicePhase, VoiceStatus } from "../../features/voice-model.js";
import { storedPass } from "../storage.js";
import { voiceMachine } from "./machine.js";
import type { VoiceMachine } from "./machine.js";

export const LEAVE_WAIT_MS = 3000;

export interface VoiceLine {
  readonly roster: (roster: VoiceRoster) => Effect.Effect<void>;
  readonly mic: (open: boolean) => Effect.Effect<void>;
  readonly wake: Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
  readonly statuses: Stream.Stream<VoiceStatus>;
}

const PHASES = {
  Leaving: "Off",
  Live: "Live",
  "Live.Idle": "Live",
  "Live.Syncing": "Live",
  Opening: "Joining",
  Refused: "Refused",
  Stopped: "Off",
  Waiting: "Retrying",
} as const satisfies Record<string, VoicePhase>;

const statusOf = (snapshot: SnapshotFrom<VoiceMachine>): VoiceStatus => ({
  micBlocked: snapshot.context.micBlocked,
  phase: PHASES[taggedState(snapshot)._tag],
  speaking: snapshot.context.speaking,
});

export const openVoiceLine = (code: string, talk: boolean) =>
  Effect.gen(function* openLine() {
    const pass = yield* storedPass(code);

    const actor = yield* createEffectActor(voiceMachine(), {
      input: { micOpen: false, pass, roster: [], talk },
    });

    const line: VoiceLine = {
      mic: (open) =>
        Effect.sync(() => {
          actor.send({ open, type: "Mic" });
        }),
      roster: (roster) =>
        Effect.sync(() => {
          actor.send({ roster, type: "Roster" });
        }),
      statuses: snapshots(actor).pipe(
        Stream.map(statusOf),
        Stream.changesWith(
          (before, after) =>
            before.phase === after.phase &&
            before.micBlocked === after.micBlocked &&
            before.speaking.join(" ") === after.speaking.join(" ")
        )
      ),
      stop: Effect.sync(() => {
        actor.send({ type: "Stop" });
      }).pipe(
        Effect.andThen(
          waitFor(actor, (snapshot) => snapshot.status !== "active", {
            timeout: LEAVE_WAIT_MS,
          })
        ),
        Effect.ignore
      ),
      wake: Effect.sync(() => {
        actor.send({ type: "Wake" });
      }),
    };

    return line;
  });
