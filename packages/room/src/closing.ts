import { Commands, TableStates } from "@nostakes/engine";
import { Match, Option, Result, Schema } from "effect";

import { inSequence } from "./batch.js";
import type { Step } from "./batch.js";
import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import { settlementOf } from "./money.js";
import { CloseAlreadyQueued, SettlesAfterHand } from "./rejection.js";
import { sealIsBinding, withdrawal } from "./sealed-hand.js";
import { isStalled } from "./stalls.js";
import { SEATS, occupantAt } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";
import type { Millis } from "./time.js";

export const ClosingSchema = Schema.Literals([
  "Now",
  "AfterHand",
  "CancelsHand",
]);

export type Closing = typeof ClosingSchema.Type;

export const closingOf = (state: Open, at: Millis): Closing => {
  const inHand = TableStates.$is("InHand")(state.table);

  if (isStalled(state)) {
    return inHand ? "CancelsHand" : "Now";
  }

  return inHand || sealIsBinding(state, at) ? "AfterHand" : "Now";
};

export const closingSteps = (state: Open, at: Millis): readonly Step[] => [
  (current) =>
    Result.succeed(
      Option.match(current.sealed, {
        onNone: () => [],
        onSome: (sealed) => [withdrawal(sealed, "RoomClosing", at)],
      })
    ),
  ...SEATS.filter((seat) => Option.isSome(occupantAt(state.table, seat))).map(
    (seat): Step =>
      (current) =>
        onTable(current.table, Commands.StandUp({ seat }), at)
  ),
  (current) =>
    Result.map(settlementOf(current), (settlement) => [
      RoomEvents.RoomClosed({ at, settlement }),
    ]),
];

const cancelling =
  (at: Millis): Step =>
  (state) => {
    const { table } = state;

    if (!TableStates.$is("InHand")(table)) {
      return Result.succeed([]);
    }

    const restored = Option.all(
      table.hand.players.map(({ player, seat }) =>
        Option.fromUndefinedOr(state.handStacks.get(seat)).pipe(
          Option.map((stack) => ({ player, seat, stack }))
        )
      )
    );

    return Option.match(restored, {
      onNone: () =>
        Result.fail(new SettlesAfterHand({ handNumber: table.handNumber })),
      onSome: (stacks) =>
        Result.succeed([
          RoomEvents.HandCancelled({
            at,
            hand: table.handNumber,
            restored: stacks,
          }),
        ]),
    });
  };

export const closeRoom = (
  state: Open,
  command: RoomCommandOf<"CloseRoom">
): Decision =>
  Match.value(closingOf(state, command.at)).pipe(
    Match.when("AfterHand", (): Decision =>
      state.queued.close
        ? Result.fail(
            new CloseAlreadyQueued({ handNumber: state.table.handNumber })
          )
        : Result.succeed([RoomEvents.CloseQueued({ at: command.at })])
    ),
    Match.when("CancelsHand", () =>
      inSequence(state, [
        cancelling(command.at),
        ...closingSteps(state, command.at),
      ])
    ),
    Match.when("Now", () => inSequence(state, closingSteps(state, command.at))),
    Match.exhaustive
  );
