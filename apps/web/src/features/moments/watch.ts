import { Events } from "@nostakes/engine";
import { SeenEvents, SeenTableEventSchema } from "@nostakes/room";
import type { SeenEvent, SeenTableEvent } from "@nostakes/room";
import { Schema } from "effect";

export const MomentWatchSchema = Schema.Struct({
  record: Schema.Array(SeenTableEventSchema),
  seq: Schema.Int,
});

export type MomentWatch = typeof MomentWatchSchema.Type;

export const NO_MOMENTS: MomentWatch = { record: [], seq: -1 };

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
  applied: readonly Applied[]
): MomentWatch => {
  let { record, seq } = watch;

  for (const { event, seq: at } of applied) {
    record = recorded(record, event, seq < 0 || at === seq + 1);
    seq = at;
  }

  return { record, seq };
};

export const handEnded = (record: readonly SeenTableEvent[]) =>
  record.some(Events.$is("HandEnded"));
