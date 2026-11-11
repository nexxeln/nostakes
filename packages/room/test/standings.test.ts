import { describe, expect, it } from "@effect/vitest";
import { Seats, TableStates } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Option, Predicate } from "effect";

import { RoomStates, SEATS, millis, standingsOf } from "../src/index.js";
import type { Open, RoomState } from "../src/index.js";
import { isOpen } from "./observers.js";
import { generated } from "./scale.js";
import { playSession, session } from "./sessions.js";

const SAMPLED_STATES = 16;

const cashedOutBefore = (state: Open, player: PlayerId) =>
  (state.entries.get(player) ?? []).reduce(
    (sum, entry) =>
      sum + (Predicate.isTagged(entry, "CashedOut") ? entry.amount : 0),
    0
  );

const heldAt = (state: Open) => {
  const held = new Map<PlayerId, number>();
  const { table } = state;

  for (const seat of SEATS) {
    const occupant = Option.fromUndefinedOr(table.seats[seat]).pipe(
      Option.filter(Seats.$is("Occupied"))
    );

    for (const { player, stack } of Option.toArray(occupant)) {
      const dealt = TableStates.$is("InHand")(table)
        ? Option.fromUndefinedOr(state.handStacks.get(seat))
        : Option.none<number>();

      held.set(
        player,
        Option.getOrElse(dealt, () => stack)
      );
    }
  }

  return held;
};

const standingsProblems = (state: Open, at: number): readonly string[] => {
  const stood = standingsOf(state, millis(at));

  if (!RoomStates.$is("Closed")(stood)) {
    return [`a table at hand ${state.table.handNumber} did not settle`];
  }

  const { balances } = stood.settlement;
  const held = heldAt(state);
  const net = balances.reduce((sum, balance) => sum + balance.net, 0);
  const bought = balances.reduce((sum, balance) => sum + balance.boughtIn, 0);
  const paid = balances.reduce((sum, balance) => sum + balance.cashedOut, 0);

  const wrong = balances.flatMap((balance) => {
    const expected =
      cashedOutBefore(state, balance.player) + (held.get(balance.player) ?? 0);

    return balance.cashedOut === expected
      ? []
      : [`${balance.player} leaves with ${balance.cashedOut}, not ${expected}`];
  });

  return [
    ...(net === 0 ? [] : [`the nets add up to ${net}`]),
    ...(paid === bought ? [] : [`${bought} bought in and ${paid} paid out`]),
    ...wrong,
  ];
};

const sampled = (states: readonly RoomState[]) => {
  const every = Math.max(1, Math.floor(states.length / SAMPLED_STATES));

  return states.filter((_, index) => index % every === 0).filter(isOpen);
};

describe("the standings of a room stopped by a fault", () => {
  it.prop(
    "settle every reachable table at once: each player leaves with what they cashed out before plus what they held when the unfinished hand was dealt, so every chip in that hand goes back and the nets add up to zero",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      const problems = sampled(played.steps.map(({ after }) => after)).flatMap(
        (state) => standingsProblems(state, state.now + 1000)
      );

      expect(problems).toStrictEqual([]);
    },
    generated(40, 100)
  );
});
