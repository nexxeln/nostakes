import { uint32, uint64, utf8 } from "./bytes.js";
import { taggedHash } from "./hashing.js";
import { SeedSchema } from "./schemas.js";
import type { Beacon, HandContext, Seal, Seed } from "./schemas.js";

export const seedOf = (
  context: HandContext,
  seal: Seal,
  beacon: Beacon
): Seed =>
  SeedSchema.make(
    taggedHash("seed", [
      utf8(context.room),
      uint32(context.hand),
      ...seal.roots,
      Uint8Array.from(seal.seats),
      uint64(beacon.round),
      beacon.randomness,
    ])
  );
