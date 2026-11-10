import * as Cloudflare from "@alchemy.run/cloudflare";

import { pokerRoomOn } from "../../src/poker-room.js";
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
  roomObjectWithTestHooks(
    (jammed) => jammable(pokerRoomOn(TEST_CHAIN), jammed),
    (state) => persistedSeededEntropy(DEAL_SEED, state),
    testBeacon,
    ROOM_RETENTION_MS,
    POKER_TEST_RETRIES
  )
) {}
