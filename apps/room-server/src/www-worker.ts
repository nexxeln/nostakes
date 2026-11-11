import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";

import { redirectToApex, WWW_HOST } from "./apex-redirect.js";
import { APPLICATION_LOGS_ONLY, ZONE } from "./site.js";

export default class WwwWorker extends Cloudflare.Worker<WwwWorker>()(
  "Www",
  {
    compatibility: { date: "2026-05-28" },
    domain: { name: WWW_HOST, zoneName: ZONE },
    main: import.meta.url,
    name: "nostakes-www",
    observability: APPLICATION_LOGS_ONLY,
    workersDev: false,
  },
  Effect.succeed({ fetch: redirectToApex })
) {}
