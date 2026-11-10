import { Commands, PendingDecisions, pendingDecisions } from "@nostakes/engine";
import type { PlayerId, SeatIndex } from "@nostakes/engine";
import { Option, Result } from "effect";

import { inSequence } from "./batch.js";
import type { Step } from "./batch.js";
import { actAutomatically } from "./clocks.js";
import { closingSteps } from "./closing.js";
import type { Decision } from "./decision.js";
import { handInProgress, occupantAt, seatOf } from "./state.js";
import type { ChipRequest, Open } from "./state.js";
import { onTable } from "./table.js";
import type { Millis } from "./time.js";

const onSeatOf =
  (player: PlayerId, act: (seat: SeatIndex, state: Open) => Decision): Step =>
  (state) =>
    Option.match(seatOf(state, player), {
      onNone: () => Result.succeed([]),
      onSome: (seat) => act(seat, state),
    });

const arrival = (queued: ChipRequest, at: Millis): Step =>
  onSeatOf(queued.player, (seat, state) =>
    onTable(state.table, Commands.AddChips({ amount: queued.amount, seat }), at)
  );

const departure = (player: PlayerId, at: Millis): Step =>
  onSeatOf(player, (seat, state) =>
    onTable(state.table, Commands.StandUp({ seat }), at)
  );

export const queuedSteps = (state: Open, at: Millis): readonly Step[] => [
  ...state.queued.chips.map((queued) => arrival(queued, at)),
  ...state.queued.leaving.map((player) => departure(player, at)),
  ...Option.match(state.queued.rules, {
    onNone: () => [],
    onSome: (config): readonly Step[] => [
      (current) => onTable(current.table, Commands.ChangeRules({ config }), at),
    ],
  }),
  ...(state.queued.close
    ? [(current: Open) => inSequence(current, closingSteps(current, at))]
    : []),
];

export const endOfHand = (state: Open, at: Millis): Option.Option<Decision> => {
  const steps = queuedSteps(state, at);

  return handInProgress(state) || steps.length === 0
    ? Option.none()
    : Option.some(inSequence(state, steps));
};

const isLeaving = (state: Open, seat: SeatIndex) =>
  Option.exists(occupantAt(state.table, seat), (occupant) =>
    state.queued.leaving.includes(occupant.player)
  );

export const actForLeavingSeat = (
  state: Open,
  at: Millis
): Option.Option<Decision> =>
  PendingDecisions.$match(pendingDecisions(state.table), {
    Bet: ({ legal }) =>
      isLeaving(state, legal.seat)
        ? actAutomatically(state, legal.seat, at)
        : Option.none(),
    ChooseRuns: ({ seats }) =>
      Option.flatMap(
        Option.fromUndefinedOr(seats.find((seat) => isLeaving(state, seat))),
        (seat) => actAutomatically(state, seat, at)
      ),
    Nothing: () => Option.none(),
  });
