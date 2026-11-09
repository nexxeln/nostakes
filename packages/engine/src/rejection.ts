import { Schema } from "effect";

import { AmountNotPositive } from "./rejections/amount-not-positive.js";
import { HandInProgress } from "./rejections/hand-in-progress.js";
import { PlayerAlreadySeated } from "./rejections/player-already-seated.js";
import { SeatEmpty } from "./rejections/seat-empty.js";
import { SeatInHand } from "./rejections/seat-in-hand.js";
import { SeatTaken } from "./rejections/seat-taken.js";

export const RejectionSchema = Schema.Union([
  AmountNotPositive,
  HandInProgress,
  PlayerAlreadySeated,
  SeatEmpty,
  SeatInHand,
  SeatTaken,
]);

export type Rejection = typeof RejectionSchema.Type;

export { AmountNotPositive } from "./rejections/amount-not-positive.js";

export { HandInProgress } from "./rejections/hand-in-progress.js";

export { PlayerAlreadySeated } from "./rejections/player-already-seated.js";

export { SeatEmpty } from "./rejections/seat-empty.js";

export { SeatInHand } from "./rejections/seat-in-hand.js";

export { SeatTaken } from "./rejections/seat-taken.js";
