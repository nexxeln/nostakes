import { Schema } from "effect";

import { AmountNotPositive } from "./rejections/amount-not-positive.js";
import { HandInProgress } from "./rejections/hand-in-progress.js";
import { NotEnoughPlayers } from "./rejections/not-enough-players.js";
import { PlayerAlreadySeated } from "./rejections/player-already-seated.js";
import { SeatEmpty } from "./rejections/seat-empty.js";
import { SeatInHand } from "./rejections/seat-in-hand.js";
import { SeatTaken } from "./rejections/seat-taken.js";
import { StraddleNotAllowed } from "./rejections/straddle-not-allowed.js";

export const RejectionSchema = Schema.Union([
  AmountNotPositive,
  HandInProgress,
  NotEnoughPlayers,
  PlayerAlreadySeated,
  SeatEmpty,
  SeatInHand,
  SeatTaken,
  StraddleNotAllowed,
]);

export type Rejection = typeof RejectionSchema.Type;

export { AmountNotPositive } from "./rejections/amount-not-positive.js";

export { HandInProgress } from "./rejections/hand-in-progress.js";

export { NotEnoughPlayers } from "./rejections/not-enough-players.js";

export { PlayerAlreadySeated } from "./rejections/player-already-seated.js";

export { SeatEmpty } from "./rejections/seat-empty.js";

export { SeatInHand } from "./rejections/seat-in-hand.js";

export { SeatTaken } from "./rejections/seat-taken.js";

export {
  StraddleNotAllowed,
  StraddleProblemSchema,
  type StraddleProblem,
} from "./rejections/straddle-not-allowed.js";
