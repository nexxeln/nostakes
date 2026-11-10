import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import {
  EpochMillisSchema,
  SealArrivals,
  Verdicts,
  judgeHand,
} from "@nostakes/shuffle";
import type { Verdict } from "@nostakes/shuffle";
import { Result } from "effect";

import {
  Audiences,
  MissingEvidences,
  RoomStates,
  audienceOf,
  emptyWitness,
  evidenceFor,
  handsWitnessed,
  redact,
  viewFor,
  witnessEvent,
  witnessView,
} from "../src/index.js";
import type {
  Audience,
  MissingEvidence,
  RoomState,
  Witness,
} from "../src/index.js";
import { drand } from "./fixtures.js";
import { POOL, playSession, session } from "./sessions.js";

const ROOM = "generated";

const WITHOUT_A_SEALED_DEAL = (missing: MissingEvidence) =>
  MissingEvidences.$is("NoDeal")(missing) ||
  MissingEvidences.$is("NotSealed")(missing);

const membersOf = (state: RoomState): readonly PlayerId[] =>
  RoomStates.$is("Open")(state)
    ? state.members.map((member) => member.player)
    : [];

const verdictKind = (verdict: Verdict) =>
  Verdicts.$match(verdict, {
    Checked: ({ timing }) => `Checked ${timing._tag}`,
    Failed: ({ reason }) => `Failed ${reason._tag}`,
    NotChecked: () => "NotChecked",
  });

describe("what a device sees of a checked hand", () => {
  it.prop(
    "lets every member and a spectator check every sealed hand they saw, from redacted events and views alone",
    { source: session },
    ({ source }) => {
      const witnesses = new Map<string, Witness>();
      const spectator = "spectator";

      const played = playSession(source, undefined, (settings) => ({
        ...settings,
        shuffle: "Checked",
      }));

      for (const step of played.steps) {
        if (Result.isFailure(step.decision)) {
          continue;
        }

        const at = EpochMillisSchema.make(step.command.at);
        const arrival = SealArrivals.Live({ at });

        const watchers: readonly (readonly [string, Audience])[] = [
          [spectator, Audiences.Spectator()],
          ...[...POOL, ...membersOf(step.after)].map(
            (player) => [player, audienceOf(step.after, player)] as const
          ),
        ];

        for (const [name, audience] of watchers) {
          let witness = witnesses.get(name) ?? emptyWitness;

          for (const event of step.events) {
            witness = witnessEvent(witness, redact(event, audience), arrival);
          }

          witnesses.set(
            name,
            witnessView(
              witness,
              viewFor(step.after, audience, step.command.at),
              at
            )
          );
        }
      }

      const problems: string[] = [];
      const kinds = new Set<string>();

      for (const [name, witness] of witnesses) {
        for (const hand of handsWitnessed(witness)) {
          Result.match(evidenceFor(witness, hand, ROOM, drand.chain), {
            onFailure: (missing) => {
              if (!WITHOUT_A_SEALED_DEAL(missing)) {
                problems.push(`${name} hand ${hand}: ${missing._tag}`);
              }
            },
            onSuccess: (evidence) => {
              const kind = verdictKind(judgeHand(evidence));

              kinds.add(kind);

              if (kind !== "Checked InTime" && kind !== "NotChecked") {
                problems.push(`${name} hand ${hand}: ${kind}`);
              }
            },
          });
        }
      }

      expect(problems).toStrictEqual([]);
    },
    { arbitrary: { runs: 6 }, timeout: 120_000 }
  );
});
