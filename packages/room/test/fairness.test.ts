import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Events,
  PendingDecisions,
  Seats,
  TableStates,
  pendingDecisions,
} from "@nostakes/engine";
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
  RoomCommands,
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
  Millis,
  MissingEvidence,
  RoomCommand,
  RoomEvent,
  RoomSettings,
  RoomState,
  Witness,
} from "../src/index.js";
import { dealFromBeacon, sealAt } from "./beacon.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  drand,
  join,
  ms,
  openOf,
  openedBy,
  roomCode,
  run,
  settings,
  sit,
} from "./fixtures.js";
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

interface Watched {
  readonly after: RoomState;
  readonly at: Millis;
  readonly events: readonly RoomEvent[];
}

const handInPlay = (state: RoomState): Option.Option<number> =>
  RoomStates.$is("Open")(state) && TableStates.$is("InHand")(state.table)
    ? Option.some(state.table.handNumber)
    : Option.none();

const handsStartedBy = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) && Events.$is("HandStarted")(event.event)
      ? [event.event.handNumber]
      : []
  );

const SPECTATOR = "spectator";

const judgedLive = (
  room: string,
  steps: readonly Watched[],
  watchingFromTheStart: readonly PlayerId[]
) => {
  const witnesses = new Map<string, Witness>();
  const startedAt = new Map<string, number>();
  const sealedAt = new Map<number, number>();
  const lastOnTheTableAt = new Map<number, number>();

  for (const [index, step] of steps.entries()) {
    for (const event of step.events) {
      if (RoomEvents.$is("HandSealed")(event)) {
        sealedAt.set(event.hand, index);
      }
    }

    for (const hand of [
      ...handsStartedBy(step.events),
      ...Option.toArray(handInPlay(step.after)),
    ]) {
      lastOnTheTableAt.set(hand, index);
    }

    const at = EpochMillisSchema.make(step.at);
    const arrival = SealArrivals.Live({ at });

    const watchers: readonly (readonly [string, Audience])[] = [
      [SPECTATOR, Audiences.Spectator()],
      ...[...watchingFromTheStart, ...membersOf(step.after)].map(
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
        witnessView(witness, viewFor(step.after, audience, step.at), at)
      );
    }
  }

  const problems: string[] = [];
  const outcomes: string[] = [];
  const judge = judgeOnce();

  for (const [name, witness] of witnesses) {
    const started = startedAt.get(name) ?? 0;

    for (const hand of handsWitnessed(witness)) {
      Result.match(evidenceFor(witness, hand, room, drand.chain), {
        onFailure: (missing) => {
          const cameAfterTheHand =
            (lastOnTheTableAt.get(hand) ?? Number.POSITIVE_INFINITY) < started;

          outcomes.push(`${name} hand ${hand}: ${missing._tag}`);

          if (
            !WITHOUT_A_SEALED_DEAL(missing) &&
            !(cameAfterTheHand && MissingEvidences.$is("NoDealtSeats")(missing))
          ) {
            problems.push(`${name} hand ${hand}: ${missing._tag}`);
          }
        },
        onSuccess: (evidence) => {
          const kind = verdictKind(judge(evidence));
          const joinedAfterTheSeal = (sealedAt.get(hand) ?? -1) < started;

          outcomes.push(`${name} hand ${hand}: ${kind}`);

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

  return { outcomes, problems };
};

const CHECKED: RoomSettings = { ...settings, shuffle: "Checked" };

const SEALED_AT = 10_000;

const ROUND = 6;

const ROUND_DUE = 15_000;

const foldAt = (state: RoomState, at: number): RoomCommand => {
  const pending = pendingDecisions(openOf(state).table);

  if (!PendingDecisions.$is("Bet")(pending)) {
    throw new Error("expected a seat to act");
  }

  const owner = openOf(state).table.seats[pending.legal.seat];

  if (owner === undefined || !Seats.$is("Occupied")(owner)) {
    throw new Error("expected the acting seat to be taken");
  }

  return RoomCommands.Act({
    action: Actions.Fold(),
    at: ms(at),
    by: as(owner.player),
  });
};

const nightWithALateArrival = (): readonly Watched[] => {
  const steps: Watched[] = [];
  let state = openedBy(ann, CHECKED);

  const play = (command: RoomCommand) => {
    const { events, state: after } = run(state, command);

    state = after;
    steps.push({ after, at: command.at, events });
  };

  for (const command of [
    join(bob),
    join(cat),
    sit(ann, 0),
    sit(bob, 1),
    sit(cat, 2),
    RoomCommands.StartGame({ at: ms(SEALED_AT), by: as(ann) }),
    sealAt(SEALED_AT, 1),
    dealFromBeacon(ROUND_DUE, ROUND),
  ]) {
    play(command);
  }

  play(foldAt(state, ROUND_DUE + 1000));
  play(foldAt(state, ROUND_DUE + 2000));
  play(join(dan, ROUND_DUE + 3000));
  play(sit(dan, 3, 200, ROUND_DUE + 4000));

  return steps;
};

describe("what a device sees of a checked hand", () => {
  it.prop(
    "lets every member and a spectator check every sealed hand they saw, from redacted events and views alone, in time unless their device started watching after that hand was sealed, and leaves unjudged only a hand that was over before the device started watching",
    { source: session },
    ({ source }) => {
      const played = playSession(source, undefined, (drawn) => ({
        ...drawn,
        shuffle: "Checked",
      }));

      const steps = played.steps.flatMap((step) =>
        Result.isSuccess(step.decision)
          ? [{ after: step.after, at: step.command.at, events: step.events }]
          : []
      );

      expect(judgedLive(ROOM, steps, POOL).problems).toStrictEqual([]);
    },
    generated(2, 6)
  );

  it("gives someone who joined after a sealed hand was over no verdict on it, because the view no longer says who was dealt in, and never an alarm", () => {
    expect(judgedLive(roomCode, nightWithALateArrival(), [])).toStrictEqual({
      outcomes: [
        "spectator hand 1: Checked InTime",
        "ann hand 1: Checked InTime",
        "bob hand 1: Checked InTime",
        "cat hand 1: Checked InTime",
        "dan hand 1: NoDealtSeats",
      ],
      problems: [],
    });
  });

  it.prop(
    "lets a device that was away and came back with only the view check every hand it saw whole, and never files a later hand's cards under the hand it saw last",
    { source: session },
    ({ source }) => {
      const witnesses = new Map<string, Witness>();
      const spectator = SPECTATOR;
      const AWAY_EVERY = 30;
      const AWAY_FOR = 12;

      const played = playSession(source, undefined, (drawn) => ({
        ...drawn,
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
