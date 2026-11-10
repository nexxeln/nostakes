import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  ChipsSchema,
  Events,
  PendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  TableStates,
  pendingDecisions,
} from "@nostakes/engine";
import type { Event, LegalActions, PlayerId } from "@nostakes/engine";
import { Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Actors,
  Deadlines,
  RoomCodeSchema,
  RoomCommands,
  RoomEvents,
  RoomStates,
  decide,
  evolveAll,
  millis,
  nextDeadline,
  openRoom,
  replay,
} from "../src/index.js";
import type {
  Deadline,
  Decision,
  Open,
  RoomCommand,
  RoomSettings,
  RoomState,
} from "../src/index.js";
import { bytesFrom } from "./fixtures.js";
import { seededRandom } from "./random.js";
import { POOL, settingsFrom } from "./sessions.js";

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const NightSchema = Schema.Struct({
  players: between(2, 9),
  returns: between(0, 12),
  setup: between(0, 1_000_000_000),
});

const night = Arbitrary.schema(NightSchema);

const STEP_LIMIT = 5000;

const host = POOL[0] ?? PlayerIdSchema.make("p0");

const serverAnswer = (deadline: Deadline, seed: number): RoomCommand =>
  Deadlines.$match(deadline, {
    DealDue: ({ at }) =>
      RoomCommands.Deal({
        at,
        by: Actors.Server(),
        shuffleBytes: bytesFrom(seed),
      }),
    RunChoiceClock: ({ at }) =>
      RoomCommands.ExpireClock({ at, by: Actors.Server(), deadline: at }),
    TurnClock: ({ at }) =>
      RoomCommands.ExpireClock({ at, by: Actors.Server(), deadline: at }),
  });

const awayPlayers = (state: RoomState) =>
  RoomStates.$is("Open")(state)
    ? state.away.flatMap((seat) => {
        const occupant = state.table.seats[seat];

        return occupant !== undefined && Seats.$is("Occupied")(occupant)
          ? [occupant.player]
          : [];
      })
    : [];

const shove = (legal: LegalActions) =>
  Option.match(legal.raise, {
    onNone: () =>
      Option.match(legal.call, {
        onNone: () => Actions.Check(),
        onSome: () => Actions.Call(),
      }),
    onSome: ({ maxTo }) => Actions.RaiseTo({ to: maxTo }),
  });

const ownerOf = (state: Open, seat: number): Option.Option<PlayerId> => {
  const occupant = state.table.seats[seat];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? Option.some(occupant.player)
    : Option.none();
};

const tableEvents = (decision: Decision, counted: (event: Event) => boolean) =>
  Result.isSuccess(decision)
    ? decision.success.filter(
        (event) => RoomEvents.$is("Table")(event) && counted(event.event)
      ).length
    : 0;

const dealable = (state: RoomState) =>
  RoomStates.$is("Open")(state)
    ? state.table.seats.filter(
        (seat) =>
          Seats.$is("Occupied")(seat) && !seat.sittingOut && seat.stack > 0
      ).length
    : 0;

const startedRoom = (
  settings: RoomSettings,
  players: number,
  below: (bound: number) => number
) => {
  let state = replay(
    openRoom({
      at: millis(0),
      avatar: "",
      code: RoomCodeSchema.make("liveness"),
      host,
      name: "host",
      settings,
    })
  );

  const run = (command: RoomCommand) => {
    const decision = decide(state, command);

    if (Result.isSuccess(decision)) {
      state = evolveAll(state, decision.success);
    }
  };

  for (const [index, player] of POOL.slice(0, players).entries()) {
    run(
      RoomCommands.Join({
        at: millis(0),
        avatar: "",
        by: Actors.Member({ player }),
        name: player,
      })
    );
    run(
      RoomCommands.RequestSeat({
        at: millis(0),
        buyIn: ChipsSchema.make(
          settings.buyIn.min +
            below(settings.buyIn.max - settings.buyIn.min + 1)
        ),
        by: Actors.Member({ player }),
        seat: SeatIndexSchema.make(index),
      })
    );
  }

  run(
    RoomCommands.StartGame({
      at: millis(0),
      by: Actors.Member({ player: host }),
    })
  );

  return state;
};

describe("liveness", () => {
  it.prop(
    "a server that only answers nextDeadline, with players who never act, finishes every hand and keeps dealing while two seats can be dealt in",
    { night },
    ({ night: { players, returns, setup } }) => {
      const random = seededRandom(setup);
      const base = settingsFrom(random);

      const settings = {
        ...base,
        approval: { chips: false, seats: false },
        turnSeconds: 1 + random.below(30),
      };

      let state = startedRoom(settings, players, random.below);

      const run = (command: RoomCommand) => {
        const decision = decide(state, command);

        if (Result.isSuccess(decision)) {
          state = evolveAll(state, decision.success);
        }

        return decision;
      };

      const refused: string[] = [];
      let started = 0;
      let ended = 0;
      let comebacks = returns;
      let steps = 0;

      for (; steps < STEP_LIMIT; steps += 1) {
        const deadline = nextDeadline(state);

        if (Option.isNone(deadline)) {
          const away = awayPlayers(state);

          if (
            comebacks === 0 ||
            away.length === 0 ||
            !RoomStates.$is("Open")(state)
          ) {
            break;
          }

          comebacks -= 1;

          for (const player of away) {
            run(
              RoomCommands.SitIn({
                at: state.now,
                by: Actors.Member({ player }),
              })
            );
          }

          continue;
        }

        const decision = run(serverAnswer(deadline.value, steps));

        if (Result.isFailure(decision)) {
          refused.push(decision.failure._tag);
        } else {
          for (const event of decision.success) {
            started +=
              RoomEvents.$is("Table")(event) &&
              Events.$is("HandStarted")(event.event)
                ? 1
                : 0;
            ended +=
              RoomEvents.$is("Table")(event) &&
              Events.$is("HandEnded")(event.event)
                ? 1
                : 0;
          }
        }

        if (
          RoomStates.$is("Open")(state) &&
          TableStates.$is("InHand")(state.table) &&
          Option.isNone(nextDeadline(state))
        ) {
          refused.push("a hand in progress has no deadline");
        }
      }

      expect(refused).toStrictEqual([]);
      expect(steps).toBeLessThan(STEP_LIMIT);
      expect(started).toBeGreaterThan(0);
      expect(ended).toBe(started);
      expect(dealable(state)).toBeLessThan(2);
    }
  );

  it.prop(
    "with no turn clock, a hand in progress waits without a deadline only on a bet, never on a run vote, so players who answer bets and never vote still finish every hand",
    { night },
    ({ night: { players, setup } }) => {
      const random = seededRandom(setup);
      const base = settingsFrom(random);

      const settings: RoomSettings = {
        ...base,
        approval: { chips: false, seats: false },
        table: {
          ...base.table,
          maxRuns: RunCountSchema.make(2 + random.below(2)),
        },
        turnSeconds: 0,
      };

      let state = startedRoom(settings, players, random.below);

      const run = (command: RoomCommand) => {
        const decision = decide(state, command);

        if (Result.isSuccess(decision)) {
          state = evolveAll(state, decision.success);
        }

        return decision;
      };

      const stalled: string[] = [];
      let started = 0;
      let ended = 0;
      let votesExpired = 0;
      let steps = 0;

      for (; steps < STEP_LIMIT; steps += 1) {
        const deadline = nextDeadline(state);

        if (Option.isSome(deadline)) {
          const decision = run(serverAnswer(deadline.value, steps));

          started += tableEvents(decision, Events.$is("HandStarted"));
          ended += tableEvents(decision, Events.$is("HandEnded"));
          votesExpired += Deadlines.$is("RunChoiceClock")(deadline.value)
            ? tableEvents(decision, Events.$is("RunsAgreed"))
            : 0;
          continue;
        }

        if (
          !RoomStates.$is("Open")(state) ||
          !TableStates.$is("InHand")(state.table)
        ) {
          break;
        }

        const open = state;

        const answer = PendingDecisions.$match(pendingDecisions(open.table), {
          Bet: ({ legal }) =>
            Option.map(ownerOf(open, legal.seat), (player) =>
              RoomCommands.Act({
                action: shove(legal),
                at: open.now,
                by: Actors.Member({ player }),
              })
            ),
          ChooseRuns: () => Option.none(),
          Nothing: () => Option.none(),
          Show: () => Option.none(),
        });

        if (Option.isNone(answer)) {
          stalled.push(
            `${pendingDecisions(open.table)._tag} waits with no deadline`
          );
          break;
        }

        const decision = run(answer.value);

        started += tableEvents(decision, Events.$is("HandStarted"));
        ended += tableEvents(decision, Events.$is("HandEnded"));
      }

      expect(stalled).toStrictEqual([]);
      expect(steps).toBeLessThan(STEP_LIMIT);
      expect(started).toBeGreaterThan(0);
      expect(ended).toBe(started);
      expect(votesExpired).toBeGreaterThan(0);
      expect(dealable(state)).toBeLessThan(2);
    }
  );
});
