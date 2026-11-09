import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AmountNotPositive,
  Antes,
  Commands,
  PlayerAlreadySeated,
  SeatEmpty,
  SeatTaken,
  Events,
  Seats,
  decide,
  initialTable,
} from "../src/index.js";
import type { Command, TableState } from "../src/index.js";
import {
  baseConfig,
  chipCount,
  fold,
  player,
  rejection,
  run,
  runAll,
  seat,
} from "./fixtures.js";

const table = initialTable(baseConfig);

describe("seating", () => {
  it("seats a player with the buy-in as the stack", () => {
    const sat = run(
      table,
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      })
    );

    expect(sat.events).toStrictEqual([
      Events.PlayerSat({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      }),
    ]);
    expect(sat.state.seats[3]).toStrictEqual(
      Seats.Occupied({
        player: player("ann"),
        sittingOut: false,
        stack: chipCount(200),
      })
    );
  });

  it("names the occupant when a seat is taken and the seat when a player is already seated", () => {
    const seated = runAll(table, [
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      }),
    ]).state;

    expect(
      rejection(
        seated,
        Commands.SitDown({
          buyIn: chipCount(50),
          player: player("bob"),
          seat: seat(3),
        })
      )
    ).toStrictEqual(new SeatTaken({ occupant: player("ann"), seat: seat(3) }));
    expect(
      rejection(
        seated,
        Commands.SitDown({
          buyIn: chipCount(50),
          player: player("ann"),
          seat: seat(5),
        })
      )
    ).toStrictEqual(
      new PlayerAlreadySeated({ player: player("ann"), seat: seat(3) })
    );
  });

  it("rejects a buy-in or top-up of zero chips", () => {
    const seated = runAll(table, [
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      }),
    ]).state;

    expect(
      rejection(
        table,
        Commands.SitDown({
          buyIn: chipCount(0),
          player: player("bob"),
          seat: seat(1),
        })
      )
    ).toStrictEqual(new AmountNotPositive({ amount: chipCount(0) }));
    expect(
      rejection(
        seated,
        Commands.AddChips({ amount: chipCount(0), seat: seat(3) })
      )
    ).toStrictEqual(new AmountNotPositive({ amount: chipCount(0) }));
  });

  it("returns the whole stack when a player stands up", () => {
    const { events, state } = runAll(table, [
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      }),
      Commands.AddChips({ amount: chipCount(75), seat: seat(3) }),
      Commands.StandUp({ seat: seat(3) }),
    ]);

    expect(events.at(-1)).toStrictEqual(
      Events.PlayerStood({
        player: player("ann"),
        seat: seat(3),
        stack: chipCount(275),
      })
    );
    expect(state.seats[3]).toStrictEqual(Seats.Empty());
    expect(rejection(state, Commands.StandUp({ seat: seat(3) }))).toStrictEqual(
      new SeatEmpty({ seat: seat(3) })
    );
  });

  it("treats sitting out as a toggle and emits nothing when it does not change", () => {
    const seated = runAll(table, [
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("ann"),
        seat: seat(3),
      }),
    ]).state;

    const unchanged = decide(
      seated,
      Commands.SetSittingOut({ seat: seat(3), sittingOut: false })
    );

    const changed = run(
      seated,
      Commands.SetSittingOut({ seat: seat(3), sittingOut: true })
    );

    expect(unchanged).toStrictEqual(Result.succeed([]));
    expect(changed.events).toStrictEqual([
      Events.SittingOutChanged({ seat: seat(3), sittingOut: true }),
    ]);
    expect(changed.state.seats[3]).toMatchObject({ sittingOut: true });
  });

  it("changes the rules between hands", () => {
    const config = {
      ...baseConfig,
      ante: Antes.EveryPlayer({ amount: chipCount(1) }),
    };

    const changed = run(table, Commands.ChangeRules({ config }));

    expect(changed.events).toStrictEqual([Events.RulesChanged({ config })]);
    expect(changed.state.config).toStrictEqual(config);
  });
});

const SeatingIntentSchema = Schema.Struct({
  amount: Schema.Int.check(Schema.isBetween({ maximum: 300, minimum: 0 })),
  flag: Schema.Boolean,
  kind: Schema.Literals(["sit", "stand", "add", "sitOut"]),
  player: Schema.Int.check(Schema.isBetween({ maximum: 11, minimum: 0 })),
  seat: Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 0 })),
});

type SeatingIntent = typeof SeatingIntentSchema.Type;

const commandFor = (intent: SeatingIntent): Command => {
  const target = seat(intent.seat);

  if (intent.kind === "sit") {
    return Commands.SitDown({
      buyIn: chipCount(intent.amount),
      player: player(`p${intent.player}`),
      seat: target,
    });
  }

  if (intent.kind === "stand") {
    return Commands.StandUp({ seat: target });
  }

  if (intent.kind === "add") {
    return Commands.AddChips({
      amount: chipCount(intent.amount),
      seat: target,
    });
  }

  return Commands.SetSittingOut({ seat: target, sittingOut: intent.flag });
};

interface ModelSeat {
  readonly player: string;
  readonly sittingOut: boolean;
  readonly stack: number;
}

const expectedOutcome = (
  model: ReadonlyMap<number, ModelSeat>,
  intent: SeatingIntent
) => {
  const occupant = model.get(intent.seat);

  if (intent.kind === "sit") {
    const elsewhere = [...model.values()].some(
      (seated) => seated.player === `p${intent.player}`
    );

    if (occupant !== undefined) {
      return "SeatTaken";
    }

    if (elsewhere) {
      return "PlayerAlreadySeated";
    }

    return intent.amount > 0 ? "accepted" : "AmountNotPositive";
  }

  if (occupant === undefined) {
    return "SeatEmpty";
  }

  return intent.kind === "add" && intent.amount === 0
    ? "AmountNotPositive"
    : "accepted";
};

const advanceModel = (model: Map<number, ModelSeat>, intent: SeatingIntent) => {
  const occupant = model.get(intent.seat);

  if (intent.kind === "sit") {
    model.set(intent.seat, {
      player: `p${intent.player}`,
      sittingOut: false,
      stack: intent.amount,
    });
  } else if (intent.kind === "stand") {
    model.delete(intent.seat);
  } else if (occupant !== undefined && intent.kind === "add") {
    model.set(intent.seat, {
      ...occupant,
      stack: occupant.stack + intent.amount,
    });
  } else if (occupant !== undefined) {
    model.set(intent.seat, { ...occupant, sittingOut: intent.flag });
  }
};

const seatsOf = (state: TableState) =>
  state.seats.flatMap((current, index) =>
    Seats.$is("Occupied")(current)
      ? [
          [
            index,
            {
              player: current.player,
              sittingOut: current.sittingOut,
              stack: current.stack,
            },
          ] as const,
        ]
      : []
  );

const stackTotal = (state: TableState) => {
  let total = 0;

  for (const [, seated] of seatsOf(state)) {
    total += seated.stack;
  }

  return total;
};

it.prop(
  "generated seating histories match a model of who sits where with what stack, and chips move only by buy-ins, top-ups, and cash-outs",
  {
    history: Arbitrary.array(Arbitrary.schema(SeatingIntentSchema), {
      maxLength: 60,
    }),
  },
  ({ history }) => {
    const model = new Map<number, ModelSeat>();
    let state = table;
    let bankroll = 0;

    for (const intent of history) {
      const command = commandFor(intent);
      const decision = decide(state, command);
      const expected = expectedOutcome(model, intent);

      expect(
        Result.isSuccess(decision) ? "accepted" : decision.failure._tag
      ).toBe(expected);

      if (Result.isSuccess(decision)) {
        advanceModel(model, intent);
        state = fold(state, decision.success);

        for (const event of decision.success) {
          bankroll += Events.$match(event, {
            ChipsAdded: (added) => added.amount,
            PlayerSat: (sat) => sat.buyIn,
            PlayerStood: (stood) => 0 - stood.stack,
            RulesChanged: () => 0,
            SittingOutChanged: () => 0,
          });
        }
      }

      expect(seatsOf(state)).toStrictEqual(
        [...model.entries()].toSorted(([left], [right]) => left - right)
      );
      expect(stackTotal(state)).toBe(bankroll);
    }
  }
);
