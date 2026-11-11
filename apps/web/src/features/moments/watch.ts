import { Events, SeatIndexSchema } from "@nostakes/engine";
import { RoomViews, SeenEvents, SeenTableEventSchema } from "@nostakes/room";
import type { RoomView, SeenEvent, SeenTableEvent } from "@nostakes/room";
import { Match, Option, Schema } from "effect";

export const SeatStackSchema = Schema.Struct({
  seat: SeatIndexSchema,
  stack: Schema.Int,
});

export type SeatStack = typeof SeatStackSchema.Type;

export const MomentWatchSchema = Schema.Struct({
  record: Schema.Array(SeenTableEventSchema),
  seq: Schema.Int,
  stacks: Schema.Array(SeatStackSchema),
});

export type MomentWatch = typeof MomentWatchSchema.Type;

export const NO_MOMENTS: MomentWatch = { record: [], seq: -1, stacks: [] };

export const seatStacksOf = (view: RoomView): readonly SeatStack[] =>
  RoomViews.$is("Open")(view)
    ? view.seats.flatMap(({ occupant, seat }) =>
        Option.match(occupant, {
          onNone: () => [],
          onSome: ({ stack }) => [{ seat, stack }],
        })
      )
    : [];

const movedBy = (event: SeenTableEvent, seat: number) =>
  Match.value(event).pipe(
    Match.tags({
      AntePosted: (posted) => (posted.seat === seat ? posted.amount : 0),
      BlindPosted: (posted) => (posted.seat === seat ? posted.amount : 0),
      BountyPaid: ({ payers, seat: winner }) =>
        payers.reduce(
          (moved, payer) =>
            moved +
            (payer.seat === seat ? payer.amount : 0) -
            (winner === seat ? payer.amount : 0),
          0
        ),
      Called: (called) => (called.seat === seat ? called.amount : 0),
      PotAwarded: ({ winners }) =>
        0 -
        winners
          .filter((winner) => winner.seat === seat)
          .reduce((total, winner) => total + winner.amount, 0),
      RaisedTo: (raised) => (raised.seat === seat ? raised.added : 0),
      StraddlePosted: (posted) => (posted.seat === seat ? posted.amount : 0),
      UncalledBetReturned: (returned) =>
        returned.seat === seat ? 0 - returned.amount : 0,
    }),
    Match.orElse(() => 0)
  );

export const startingStacks = (
  record: readonly SeenTableEvent[],
  seats: readonly SeatStack[]
): readonly SeatStack[] => {
  const [first] = record;

  if (first === undefined || !Events.$is("HandStarted")(first)) {
    return [];
  }

  return first.dealtIn.flatMap((seat) => {
    const now = seats.find((each) => each.seat === seat);

    if (now === undefined) {
      return [];
    }

    let { stack } = now;

    for (const event of record) {
      stack += movedBy(event, seat);
    }

    return [{ seat, stack }];
  });
};

interface Applied {
  readonly event: SeenEvent;
  readonly seq: number;
}

const recorded = (
  record: readonly SeenTableEvent[],
  event: SeenEvent,
  contiguous: boolean
): readonly SeenTableEvent[] => {
  if (!SeenEvents.$is("Table")(event)) {
    return contiguous ? record : [];
  }

  if (Events.$is("HandStarted")(event.event)) {
    return [event.event];
  }

  return contiguous && record.length > 0 ? [...record, event.event] : [];
};

export const watchedMoments = (
  watch: MomentWatch,
  applied: readonly Applied[],
  seats: readonly SeatStack[] = []
): MomentWatch => {
  let { record, seq, stacks } = watch;

  for (const { event, seq: at } of applied) {
    record = recorded(record, event, seq < 0 || at === seq + 1);
    seq = at;

    if (
      SeenEvents.$is("Table")(event) &&
      Events.$is("HandStarted")(event.event)
    ) {
      stacks = [];
    }
  }

  if (record.length === 0) {
    stacks = [];
  } else if (stacks.length === 0) {
    stacks = startingStacks(record, seats);
  }

  return { record, seq, stacks };
};

export const handEnded = (record: readonly SeenTableEvent[]) =>
  record.some(Events.$is("HandEnded"));
