import { Schema } from "effect";

import { AmountNotPositive } from "./rejections/amount-not-positive.js";
import { CardAlreadyPublic } from "./rejections/card-already-public.js";
import { CardNotHeld } from "./rejections/card-not-held.js";
import { ChipLimitExceeded } from "./rejections/chip-limit-exceeded.js";
import { HandInProgress } from "./rejections/hand-in-progress.js";
import { IllegalAction } from "./rejections/illegal-action.js";
import { NoBettingRound } from "./rejections/no-betting-round.js";
import { NoRunChoiceOwed } from "./rejections/no-run-choice-owed.js";
import { NoShowdownChoiceOwed } from "./rejections/no-showdown-choice-owed.js";
import { NotEnoughPlayers } from "./rejections/not-enough-players.js";
import { NotInLastHand } from "./rejections/not-in-last-hand.js";
import { NotYourTurn } from "./rejections/not-your-turn.js";
import { NothingToHunt } from "./rejections/nothing-to-hunt.js";
import { PlayerAlreadySeated } from "./rejections/player-already-seated.js";
import { RabbitAlreadyHunted } from "./rejections/rabbit-already-hunted.js";
import { RabbitHuntOff } from "./rejections/rabbit-hunt-off.js";
import { RunsOutOfRange } from "./rejections/runs-out-of-range.js";
import { SeatEmpty } from "./rejections/seat-empty.js";
import { SeatInHand } from "./rejections/seat-in-hand.js";
import { SeatTaken } from "./rejections/seat-taken.js";
import { StraddleAboveChipLimit } from "./rejections/straddle-above-chip-limit.js";
import { StraddleNotAllowed } from "./rejections/straddle-not-allowed.js";
import { WinningHandMustTable } from "./rejections/winning-hand-must-table.js";

export const RejectionSchema = Schema.Union([
  CardAlreadyPublic,
  CardNotHeld,
  NotInLastHand,
  NothingToHunt,
  RabbitAlreadyHunted,
  RabbitHuntOff,
  AmountNotPositive,
  ChipLimitExceeded,
  HandInProgress,
  IllegalAction,
  NoBettingRound,
  NoRunChoiceOwed,
  NoShowdownChoiceOwed,
  NotEnoughPlayers,
  NotYourTurn,
  PlayerAlreadySeated,
  RunsOutOfRange,
  SeatEmpty,
  SeatInHand,
  SeatTaken,
  StraddleAboveChipLimit,
  StraddleNotAllowed,
  WinningHandMustTable,
]);

export type Rejection = typeof RejectionSchema.Type;

export { AmountNotPositive } from "./rejections/amount-not-positive.js";

export { ChipLimitExceeded } from "./rejections/chip-limit-exceeded.js";

export { HandInProgress } from "./rejections/hand-in-progress.js";

export { IllegalAction } from "./rejections/illegal-action.js";

export { NoBettingRound } from "./rejections/no-betting-round.js";

export { NoRunChoiceOwed } from "./rejections/no-run-choice-owed.js";

export { NoShowdownChoiceOwed } from "./rejections/no-showdown-choice-owed.js";

export { NotEnoughPlayers } from "./rejections/not-enough-players.js";

export { NotYourTurn } from "./rejections/not-your-turn.js";

export { PlayerAlreadySeated } from "./rejections/player-already-seated.js";

export { RunsOutOfRange } from "./rejections/runs-out-of-range.js";

export { SeatEmpty } from "./rejections/seat-empty.js";

export { SeatInHand } from "./rejections/seat-in-hand.js";

export { SeatTaken } from "./rejections/seat-taken.js";

export { StraddleAboveChipLimit } from "./rejections/straddle-above-chip-limit.js";

export {
  StraddleNotAllowed,
  StraddleProblemSchema,
  type StraddleProblem,
} from "./rejections/straddle-not-allowed.js";

export { CardAlreadyPublic } from "./rejections/card-already-public.js";

export { CardNotHeld } from "./rejections/card-not-held.js";

export { NotInLastHand } from "./rejections/not-in-last-hand.js";

export { NothingToHunt } from "./rejections/nothing-to-hunt.js";

export { RabbitAlreadyHunted } from "./rejections/rabbit-already-hunted.js";

export { RabbitHuntOff } from "./rejections/rabbit-hunt-off.js";

export { WinningHandMustTable } from "./rejections/winning-hand-must-table.js";
