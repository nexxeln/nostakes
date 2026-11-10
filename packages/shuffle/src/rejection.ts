import { Schema } from "effect";

import { BeaconRoundMismatch } from "./rejections/beacon-round-mismatch.js";
import { BeaconSignatureInvalid } from "./rejections/beacon-signature-invalid.js";
import { BeaconSignatureMalformed } from "./rejections/beacon-signature-malformed.js";
import { CardSeenTwice } from "./rejections/card-seen-twice.js";
import { DealtSeatsDiffer } from "./rejections/dealt-seats-differ.js";
import { OpeningMismatch } from "./rejections/opening-mismatch.js";
import { RoleOutOfRange } from "./rejections/role-out-of-range.js";
import { ShownCardDiffers } from "./rejections/shown-card-differs.js";
import { SpareDeckMismatch } from "./rejections/spare-deck-mismatch.js";
import { SpareDeckRepeatsCard } from "./rejections/spare-deck-repeats-card.js";
import { WrongPosition } from "./rejections/wrong-position.js";

export const HandRejectedSchema = Schema.Union([
  BeaconSignatureMalformed,
  BeaconSignatureInvalid,
  OpeningMismatch,
  BeaconRoundMismatch,
  DealtSeatsDiffer,
  SpareDeckRepeatsCard,
  SpareDeckMismatch,
  RoleOutOfRange,
  WrongPosition,
  ShownCardDiffers,
  CardSeenTwice,
]);

export type HandRejected = typeof HandRejectedSchema.Type;

export { OpeningMismatch } from "./rejections/opening-mismatch.js";

export { BeaconRoundMismatch } from "./rejections/beacon-round-mismatch.js";

export { BeaconSignatureInvalid } from "./rejections/beacon-signature-invalid.js";

export { BeaconSignatureMalformed } from "./rejections/beacon-signature-malformed.js";

export { SpareDeckRepeatsCard } from "./rejections/spare-deck-repeats-card.js";

export { SpareDeckMismatch } from "./rejections/spare-deck-mismatch.js";

export { RoleOutOfRange } from "./rejections/role-out-of-range.js";

export { WrongPosition } from "./rejections/wrong-position.js";

export { ShownCardDiffers } from "./rejections/shown-card-differs.js";

export { CardSeenTwice } from "./rejections/card-seen-twice.js";

export { DealtSeatsDiffer } from "./rejections/dealt-seats-differ.js";
