import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";

import { serveRooms } from "./serve-rooms.js";
import {
  ROOM_ROUTES,
  SITE_HOSTS,
  siteOrigin,
  siteStage,
  WEB_ASSETS,
  ZONE,
} from "./site.js";

export default class SiteWorker extends Cloudflare.Worker<SiteWorker>()(
  "Site",
  Effect.gen(function* siteProps() {
    const stage = yield* siteStage;

    return {
      assets: {
        directory: WEB_ASSETS,
        notFoundHandling: "single-page-application",
        runWorkerFirst: ROOM_ROUTES,
      },
      compatibility: { date: "2026-05-28" },
      domain: { name: SITE_HOSTS[stage], zoneName: ZONE },
      main: import.meta.url,
      name: `nostakes-${stage}`,
      workersDev: false,
    } as const;
  }),
  serveRooms(siteStage.pipe(Effect.map((stage) => [siteOrigin(stage)])))
) {}
