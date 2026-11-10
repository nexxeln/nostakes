import * as Cloudflare from "@alchemy.run/cloudflare";

import { noMeasures } from "../../src/analytics.js";
import { testBeacon } from "./test-beacon.js";
import { DEAL_SEED, seededEntropy } from "./test-entropy.js";
import { roomObjectWithTestHooks } from "./test-hooks.js";
import { toyRoom } from "./toy-room.js";

export const BRIEF_RETENTION_MS = 3000;

export default class BriefRoom extends Cloudflare.DurableObject<BriefRoom>()(
  "BriefRoom",
  roomObjectWithTestHooks(
    () => toyRoom,
    () => seededEntropy(DEAL_SEED),
    noMeasures,
    { beacon: testBeacon, retainFor: BRIEF_RETENTION_MS }
  )
) {}
