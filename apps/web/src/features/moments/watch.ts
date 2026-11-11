import { Events, PlayerIdSchema, SeatIndexSchema } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import {
  ReactionSchema,
  RoomViews,
  SeenEvents,
  SeenTableEventSchema,
} from "@nostakes/room";
import type {
  Reaction,
  RoomView,
  SeenEvent,
  SeenTableEvent,
} from "@nostakes/room";
import { Match, Option, Schema } from "effect";

export const SeatStackSchema = Schema.Struct({
  seat: SeatIndexSchema,
  stack: Schema.Int,
});

export type SeatStack = typeof SeatStackSchema.Type;

export const HandNoteSchema = Schema.Union([
  Schema.Struct({
    after: Schema.Int,
    kind: Schema.Literals(["Tanked", "TimedOut"]),
    player: PlayerIdSchema,
  }),
  Schema.Struct({
    after: Schema.Int,
    kind: Schema.Literal("Reacted"),
    player: PlayerIdSchema,
    reaction: ReactionSchema,
  }),
]);

export type HandNote = typeof HandNoteSchema.Type;

export const MOST_NOTES = 24;

export const MomentWatchSchema = Schema.Struct({
  notes: Schema.Array(HandNoteSchema),
  record: Schema.Array(SeenTableEventSchema),
  seq: Schema.Int,
  stacks: Schema.Array(SeatStackSchema),
});

export type MomentWatch = typeof MomentWatchSchema.Type;

export const NO_MOMENTS: MomentWatch = {
  notes: [],
  record: [],
  seq: -1,
  stacks: [],
};

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

const noted = (
  notes: readonly HandNote[],
  note: HandNote
): readonly HandNote[] =>
  notes.length < MOST_NOTES ? [...notes, note] : notes;

const clockNoted = (
  notes: readonly HandNote[],
  record: readonly SeenTableEvent[],
  event: SeenEvent
): readonly HandNote[] => {
  if (record.length === 0 || record.some(Events.$is("HandEnded"))) {
    return notes;
  }

  if (SeenEvents.$is("TimeBankStarted")(event)) {
    return noted(notes, {
      after: record.length,
      kind: "Tanked",
      player: event.player,
    });
  }

  return SeenEvents.$is("TimedOut")(event)
    ? noted(notes, {
        after: record.length,
        kind: "TimedOut",
        player: event.player,
      })
    : notes;
};

export const watchedMoments = (
  watch: MomentWatch,
  applied: readonly Applied[],
  seats: readonly SeatStack[] = []
): MomentWatch => {
  let { notes, record, seq, stacks } = watch;

  for (const { event, seq: at } of applied) {
    record = recorded(record, event, seq < 0 || at === seq + 1);
    seq = at;

    if (
      SeenEvents.$is("Table")(event) &&
      Events.$is("HandStarted")(event.event)
    ) {
      stacks = [];
      notes = [];
    }

    notes = clockNoted(notes, record, event);
  }

  if (record.length === 0) {
    stacks = [];
    notes = [];
  } else if (stacks.length === 0) {
    stacks = startingStacks(record, seats);
  }

  return { notes, record, seq, stacks };
};

export const reactionNoted = (
  watch: MomentWatch,
  player: PlayerId,
  reaction: Reaction
): MomentWatch =>
  watch.record.length === 0
    ? watch
    : {
        ...watch,
        notes: noted(watch.notes, {
          after: watch.record.length,
          kind: "Reacted",
          player,
          reaction,
        }),
      };

export const handEnded = (record: readonly SeenTableEvent[]) =>
  record.some(Events.$is("HandEnded"));
