import * as Cloudflare from "@alchemy.run/cloudflare";

import { nightMeasures } from "../../src/night-measures.js";
import type { NightTally } from "../../src/night-measures.js";
import { pokerRoomOn } from "../../src/poker-room.js";
import type { PokerTypes } from "../../src/poker-room.js";
import type { RetryPolicy } from "../../src/refused-deadline.js";
import { ROOM_RETENTION_MS } from "../../src/room-host.js";
import { jammable } from "./jammed-room.js";
import { TEST_CHAIN, testBeacon } from "./test-beacon.js";
import { DEAL_SEED, persistedSeededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";

export const POKER_TEST_RETRIES: RetryPolicy = {
  capMs: 2000,
  firstMs: 250,
  stallAfter: 4,
};

export default class PokerTestRoom extends Cloudflare.DurableObject<PokerTestRoom>()(
  "PokerTestRoom",
  roomObjectWithTestHooks<PokerTypes, NightTally>(
    (jammed) => jammable(pokerRoomOn(TEST_CHAIN), jammed),
    (state) => persistedSeededEntropy(DEAL_SEED, state),
    nightMeasures,
    {
      beacon: testBeacon,
      retainFor: ROOM_RETENTION_MS,
      retries: POKER_TEST_RETRIES,
    }
  )
) {}
