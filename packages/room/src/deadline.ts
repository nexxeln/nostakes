import { SeatIndexSchema } from "@nostakes/engine";
import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Data, Schema } from "effect";

import { MillisSchema } from "./time.js";

export const DeadlineSchema = Schema.TaggedUnion({
  DealDue: { at: MillisSchema },
  QueueDue: { at: MillisSchema },
  QuietDue: { at: MillisSchema },
  RunChoiceClock: { at: MillisSchema },
  SealDue: { at: MillisSchema },
  SealedDealDue: { at: MillisSchema, round: BeaconRoundSchema },
  ShowdownClock: { at: MillisSchema, seat: SeatIndexSchema },
  TurnClock: { at: MillisSchema, seat: SeatIndexSchema },
});

export type Deadline = typeof DeadlineSchema.Type;

export const Deadlines = Data.taggedEnum<Deadline>();
