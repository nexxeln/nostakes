import * as Cloudflare from "@alchemy.run/cloudflare";

import { ROOM_RETENTION_MS } from "../../src/room-host.js";
import { testBeacon } from "./test-beacon.js";
import { DEAL_SEED, seededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";
import { TOY_RETRIES, toyRoom } from "./toy-room.js";

export default class ToyRoom extends Cloudflare.DurableObject<ToyRoom>()(
  "ToyRoom",
  roomObjectWithTestHooks(
    () => toyRoom,
    () => seededEntropy(DEAL_SEED),
    testBeacon,
    ROOM_RETENTION_MS,
    TOY_RETRIES
  )
) {}
