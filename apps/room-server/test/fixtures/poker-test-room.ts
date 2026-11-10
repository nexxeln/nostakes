import * as Cloudflare from "@alchemy.run/cloudflare";

import { pokerRoom } from "../../src/poker-room.js";
import { DEAL_SEED, persistedSeededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";

export default class PokerTestRoom extends Cloudflare.DurableObject<PokerTestRoom>()(
  "PokerTestRoom",
  roomObjectWithTestHooks(pokerRoom, (state) =>
    persistedSeededEntropy(DEAL_SEED, state)
  )
) {}
