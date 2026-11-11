import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import {
  EpochMillisSchema,
  SealArrivals,
  Verdicts,
  judgeHand,
} from "@nostakes/shuffle";
import type { HandEvidence, Verdict } from "@nostakes/shuffle";
import { MutableHashMap, Option, Result } from "effect";

import {
  Audiences,
  MissingEvidences,
  RoomEvents,
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
import { generated } from "./scale.js";
import { POOL, playSession, session } from "./sessions.js";

const ROOM = "GNRTD2";

const WITHOUT_A_SEALED_DEAL = (missing: MissingEvidence) =>
  MissingEvidences.$is("NoDeal")(missing) ||
  MissingEvidences.$is("NotSealed")(missing);

const membersOf = (state: RoomState): readonly PlayerId[] =>
  RoomStates.$is("Open")(state)
    ? state.members.map((member) => member.player)
    : [];

const judgeOnce = () => {
  const judged = MutableHashMap.empty<HandEvidence, Verdict>();

  return (evidence: HandEvidence) =>
    Option.getOrElse(MutableHashMap.get(judged, evidence), () => {
      const verdict = judgeHand(evidence);

      MutableHashMap.set(judged, evidence, verdict);

      return verdict;
    });
};

const verdictKind = (verdict: Verdict) =>
  Verdicts.$match(verdict, {
    Checked: ({ timing }) => `Checked ${timing._tag}`,
    Failed: ({ reason }) => `Failed ${reason._tag}`,
    NotChecked: () => "NotChecked",
  });

describe("what a device sees of a checked hand", () => {
  it.prop(
    "lets every member and a spectator check every sealed hand they saw, from redacted events and views alone, in time unless their device started watching after that hand was sealed",
    { source: session },
    ({ source }) => {
      const witnesses = new Map<string, Witness>();
      const startedAt = new Map<string, number>();
      const sealedAt = new Map<number, number>();
      const spectator = "spectator";

      const played = playSession(source, undefined, (settings) => ({
        ...settings,
        shuffle: "Checked",
      }));

      for (const [index, step] of played.steps.entries()) {
        if (Result.isFailure(step.decision)) {
          continue;
        }

        for (const event of step.events) {
          if (RoomEvents.$is("HandSealed")(event)) {
            sealedAt.set(event.hand, index);
          }
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
          if (!startedAt.has(name)) {
            startedAt.set(name, index);
          }

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
      const judge = judgeOnce();
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
              const kind = verdictKind(judge(evidence));

              const joinedAfterTheSeal =
                (sealedAt.get(hand) ?? -1) < (startedAt.get(name) ?? 0);

              kinds.add(kind);

              if (
                kind !== "Checked InTime" &&
                kind !== "NotChecked" &&
                !(joinedAfterTheSeal && kind === "Checked NotWatched")
              ) {
                problems.push(`${name} hand ${hand}: ${kind}`);
              }
            },
          });
        }
      }

      expect(problems).toStrictEqual([]);
    },
    generated(2, 6)
  );

  it.prop(
    "lets a device that was away and came back with only the view check every hand it saw whole, and never files a later hand's cards under the hand it saw last",
    { source: session },
    ({ source }) => {
      const witnesses = new Map<string, Witness>();
      const spectator = "spectator";
      const AWAY_EVERY = 30;
      const AWAY_FOR = 12;

      const played = playSession(source, undefined, (settings) => ({
        ...settings,
        shuffle: "Checked",
      }));

      const awayAt = (watcher: number, step: number) =>
        (step + watcher * 7) % AWAY_EVERY < AWAY_FOR;

      const away = new Set<string>();

      for (const [index, step] of played.steps.entries()) {
        if (Result.isFailure(step.decision)) {
          continue;
        }

        const at = EpochMillisSchema.make(step.command.at);
        const arrival = SealArrivals.Live({ at });

        const watchers: readonly (readonly [string, Audience])[] = [
          [spectator, Audiences.Spectator()],
          ...[...new Set([...POOL, ...membersOf(step.after)])].map(
            (player) => [player, audienceOf(step.after, player)] as const
          ),
        ];

        for (const [watcher, [name, audience]] of watchers.entries()) {
          if (awayAt(watcher, index)) {
            away.add(name);
            continue;
          }

          let witness = witnesses.get(name) ?? emptyWitness;

          if (!away.delete(name)) {
            for (const event of step.events) {
              witness = witnessEvent(witness, redact(event, audience), arrival);
            }
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
      const judge = judgeOnce();

      for (const [name, witness] of witnesses) {
        for (const hand of handsWitnessed(witness)) {
          Result.match(evidenceFor(witness, hand, ROOM, drand.chain), {
            onFailure: (missing) => {
              if (
                MissingEvidences.$is("Unopened")(missing) ||
                MissingEvidences.$is("NoSeal")(missing)
              ) {
                problems.push(`${name} hand ${hand}: ${missing._tag}`);
              }
            },
            onSuccess: (evidence) => {
              const kind = verdictKind(judge(evidence));

              if (
                kind !== "Checked InTime" &&
                kind !== "Checked NotWatched" &&
                kind !== "NotChecked"
              ) {
                problems.push(`${name} hand ${hand}: ${kind}`);
              }
            },
          });
        }
      }

      expect(problems).toStrictEqual([]);
    },
    generated(2, 6)
  );
});
