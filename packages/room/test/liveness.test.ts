import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  Events,
  PlayerIdSchema,
  SeatIndexSchema,
  Seats,
  TableStates,
} from "@nostakes/engine";
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
import type { Deadline, RoomCommand, RoomState } from "../src/index.js";
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

const dealable = (state: RoomState) =>
  RoomStates.$is("Open")(state)
    ? state.table.seats.filter(
        (seat) =>
          Seats.$is("Occupied")(seat) && !seat.sittingOut && seat.stack > 0
      ).length
    : 0;

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

        return decision;
      };

      const seated = POOL.slice(0, players);

      for (const [index, player] of seated.entries()) {
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
                random.below(settings.buyIn.max - settings.buyIn.min + 1)
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
});
