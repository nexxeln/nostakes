import * as Cloudflare from "@alchemy.run/cloudflare";

import { pokerRoomOn } from "../../src/poker-room.js";
import { TEST_CHAIN } from "./test-beacon.js";
import { DEAL_SEED, persistedSeededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";

export default class PokerTestRoom extends Cloudflare.DurableObject<PokerTestRoom>()(
  "PokerTestRoom",
  roomObjectWithTestHooks(pokerRoomOn(TEST_CHAIN), (state) =>
    persistedSeededEntropy(DEAL_SEED, state)
  )
) {}
