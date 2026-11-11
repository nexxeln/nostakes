import { expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Commands, Seats, decide, initialTable } from "../src/index.js";
import type { Command, TableState } from "../src/index.js";
import {
  bankrollChange,
  baseConfig,
  chipCount,
  fold,
  player,
  seat,
} from "./fixtures.js";

const table = initialTable(baseConfig);

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
          bankroll += bankrollChange(event);
        }
      }

      expect(seatsOf(state)).toStrictEqual(
        [...model.entries()].toSorted(([left], [right]) => left - right)
      );
      expect(stackTotal(state)).toBe(bankroll);
    }
  }
);
