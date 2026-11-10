import * as Cloudflare from "@alchemy.run/cloudflare";

import { DEAL_SEED, seededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";
import { toyRoom } from "./toy-room.js";

export default class ToyRoom extends Cloudflare.DurableObject<ToyRoom>()(
  "ToyRoom",
  roomObjectWithTestHooks(toyRoom, () => seededEntropy(DEAL_SEED))
) {}
