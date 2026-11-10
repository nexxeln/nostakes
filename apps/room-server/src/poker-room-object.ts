import * as Cloudflare from "@alchemy.run/cloudflare";

import { liveEntropy } from "./entropy.js";
import { pokerRoom } from "./poker-room.js";
import { roomObject } from "./room-object.js";

export default class PokerRoom extends Cloudflare.DurableObject<PokerRoom>()(
  "PokerRoom",
  roomObject(pokerRoom, { entropy: liveEntropy })
) {}
