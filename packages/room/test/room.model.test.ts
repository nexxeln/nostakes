import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import {
  RoomEvents,
  RoomStates,
  audienceOf,
  evolve,
  invariants,
  nextDeadline,
  redact,
  replay,
  settlement,
  viewFor,
} from "../src/index.js";
import {
  allowedFor,
  audiencesOf,
  authorityProblems,
  clockProblems,
  cardsIn,
  commandRoundTrips,
  deadlineRoundTrips,
  asSent,
  eventRoundTrips,
  inHand,
  isOpen,
  leaks,
  learn,
  queueProblems,
  topUpProblems,
  rejectionRoundTrips,
  seenRoundTrips,
  settingsRoundTrip,
  viewRoundTrips,
} from "./observers.js";
import type { Knowledge } from "./observers.js";
import { POOL, playSession, session } from "./sessions.js";

const CHECKED_ROOMS_TIMEOUT_MS = 120_000;

describe("generated rooms", () => {
  it.prop(
    "money: rule 18 and every invariant hold after every event, between hands the settlement balances and its transfers bring everyone to zero, and a closed room nets each player's cash-outs minus buy-ins",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];
      const net = new Map<PlayerId, number>();

      const played = playSession(source, (state, event) => {
        for (const found of invariants(state)) {
          broken.push(`${event._tag}: ${found.invariant} ${found.detail}`);
        }

        if (RoomEvents.$is("BoughtIn")(event)) {
          net.set(event.player, (net.get(event.player) ?? 0) - event.amount);
        }

        if (RoomEvents.$is("CashedOut")(event)) {
          net.set(event.player, (net.get(event.player) ?? 0) + event.amount);
        }
      });

      for (const step of played.steps) {
        if (isOpen(step.after) && !inHand(step.after)) {
          const settled = settlement(step.after);

          if (Result.isFailure(settled)) {
            broken.push(`unsettled after ${step.command._tag}`);
          } else {
            const owed = new Map(
              settled.success.balances.map((row) => [
                row.player,
                Number(row.net),
              ])
            );

            for (const transfer of settled.success.transfers) {
              owed.set(
                transfer.from,
                (owed.get(transfer.from) ?? 0) + transfer.amount
              );
              owed.set(
                transfer.to,
                (owed.get(transfer.to) ?? 0) - transfer.amount
              );
            }

            if ([...owed.values()].some((left) => left !== 0)) {
              broken.push(`transfers leave ${JSON.stringify([...owed])}`);
            }
          }
        }
      }

      if (RoomStates.$is("Closed")(played.state)) {
        for (const row of played.state.settlement.balances) {
          if (row.net !== (net.get(row.player) ?? 0)) {
            broken.push(
              `${row.player} nets ${row.net}, not ${net.get(row.player)}`
            );
          }
        }
      }

      expect(broken).toStrictEqual([]);
    }
  );

  it.prop(
    "secrecy: every audience sees only its own hole cards and cards the engine made public, in every redacted event and every view",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];
      let known: Knowledge = { hands: 0, holes: new Map(), shown: new Set() };

      const played = playSession(source, (state, event) => {
        known = learn(known, state, event);

        for (const audience of audiencesOf(state)) {
          const leaked = leaks(
            cardsIn(asSent(redact(event, audience)), false),
            allowedFor(known, audience)
          );

          if (leaked.length > 0) {
            broken.push(
              `${event._tag} shows ${leaked.join(",")} to ${JSON.stringify(audience)}`
            );
          }
        }
      });

      known = { hands: 0, holes: new Map(), shown: new Set() };

      for (const step of played.steps) {
        let during = step.before;

        for (const event of step.events) {
          during = evolve(during, event);
          known = learn(known, during, event);
        }

        for (const audience of audiencesOf(step.after)) {
          const view = asSent(viewFor(step.after, audience, step.command.at));

          const leaked = leaks(
            cardsIn(view, false),
            allowedFor(known, audience)
          );

          if (leaked.length > 0) {
            broken.push(
              `view after ${step.command._tag} shows ${leaked.join(",")} to ${JSON.stringify(audience)}`
            );
          }
        }
      }

      expect(broken).toStrictEqual([]);
    },
    { timeout: CHECKED_ROOMS_TIMEOUT_MS }
  );

  it.prop(
    "audience: a seat never changes hands inside a batch that deals hole cards, so redacting a batch for each player's audience after it equals redacting each event for that player's audience right after the event",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];
      const played = playSession(source);

      for (const step of played.steps) {
        let during = step.before;

        for (const event of step.events) {
          during = evolve(during, event);

          for (const player of POOL) {
            const atEvent = redact(event, audienceOf(during, player));
            const atBatch = redact(event, audienceOf(step.after, player));

            if (JSON.stringify(atEvent) !== JSON.stringify(atBatch)) {
              broken.push(`${step.command._tag}: ${event._tag} for ${player}`);
            }
          }
        }
      }

      expect(broken).toStrictEqual([]);
    }
  );

  it.prop(
    "authority: hosting commands come from the host, server commands from the server, and a member's command touches only their own seat",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      expect(played.steps.flatMap(authorityProblems)).toStrictEqual([]);
    }
  );

  it.prop(
    "clocks: an expiry acts or starts the bank only at or after its deadline, a stale one changes nothing, every bank started is spent exactly once within what is left, and a clocked hand always has a deadline",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      expect(clockProblems(played.steps, played.state)).toStrictEqual([]);
    }
  );

  it.prop(
    "queue: each queued chip add, leave, rules change, and close takes effect exactly once, in the batch that ends its hand, after the hand ends",
    { source: session },
    ({ source }) => {
      expect(queueProblems(playSession(source).steps)).toStrictEqual([]);
    }
  );

  it.prop(
    "top-ups: a chip request passes the room's top-up rule exactly when the rule allows it",
    { source: session },
    ({ source }) => {
      expect(playSession(source).steps.flatMap(topUpProblems)).toStrictEqual(
        []
      );
    }
  );

  it.prop(
    "replay: folding the emitted events from the opening gives the same room at every command",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      expect(replay(played.log)).toStrictEqual(played.state);

      let events = 0;

      for (const [index, step] of played.steps.entries()) {
        events += step.events.length;

        if (index % 40 === 0) {
          const [opened, ...rest] = played.log;

          expect(replay([opened, ...rest.slice(0, events + 1)])).toStrictEqual(
            step.after
          );
        }
      }
    }
  );

  it.prop(
    "schemas: every command, event, redacted event, rejection, setting, and deadline round-trips through JSON, and so does each step's view for the next audience in turn",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];
      const played = playSession(source);

      for (const [index, step] of played.steps.entries()) {
        if (!commandRoundTrips(step.command)) {
          broken.push(`command ${step.command._tag}`);
        }

        if (
          Result.isFailure(step.decision) &&
          !rejectionRoundTrips(step.decision.failure)
        ) {
          broken.push(`rejection ${step.decision.failure._tag}`);
        }

        for (const event of step.events) {
          if (!eventRoundTrips(event)) {
            broken.push(`event ${event._tag}`);
          }

          for (const audience of audiencesOf(step.after)) {
            if (!seenRoundTrips(redact(event, audience))) {
              broken.push(`redacted ${event._tag}`);
            }
          }
        }

        const audiences = audiencesOf(step.after);
        const inTurn = audiences[index % audiences.length];

        if (
          inTurn !== undefined &&
          !viewRoundTrips(viewFor(step.after, inTurn, step.command.at))
        ) {
          broken.push(`view after ${step.command._tag}`);
        }

        if (isOpen(step.after) && !settingsRoundTrip(step.after.settings)) {
          broken.push("settings");
        }

        if (
          Option.exists(
            nextDeadline(step.after),
            (deadline) => !deadlineRoundTrips(deadline)
          )
        ) {
          broken.push("deadline");
        }
      }

      expect(broken).toStrictEqual([]);
    },
    { timeout: CHECKED_ROOMS_TIMEOUT_MS }
  );
});
