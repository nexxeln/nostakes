import * as Cloudflare from "@alchemy.run/cloudflare";
import { Stage } from "alchemy";
import { Effect, Schema } from "effect";

import { serveRooms } from "./serve-rooms.js";
import {
  AssetFetcherSchema,
  assetsFrom,
  PAGE_ROUTES,
  sitePages,
} from "./site-pages.js";
import {
  ROOM_ROUTES,
  SITE_HOSTS,
  siteOrigin,
  SiteStageSchema,
  UnknownSiteStage,
  WEB_ASSETS,
  ZONE,
} from "./site.js";

export const siteStage = Effect.gen(function* siteStage() {
  const stage = yield* Stage;

  return yield* Schema.decodeUnknownEffect(SiteStageSchema)(stage).pipe(
    Effect.mapError(() => new UnknownSiteStage({ stage })),
    Effect.orDie
  );
});

export default class SiteWorker extends Cloudflare.Worker<SiteWorker>()(
  "Site",
  Effect.gen(function* siteProps() {
    const stage = yield* siteStage;

    return {
      assets: {
        directory: WEB_ASSETS,
        notFoundHandling: "single-page-application",
        runWorkerFirst: [...ROOM_ROUTES, ...PAGE_ROUTES],
      },
      compatibility: { date: "2026-05-28" },
      domain: { name: SITE_HOSTS[stage], zoneName: ZONE },
      main: import.meta.url,
      name: `nostakes-${stage}`,
      workersDev: false,
    } as const;
  }),
  Effect.gen(function* serveSite() {
    const env = yield* Cloudflare.WorkerEnvironment;

    const assets = {
      fetch: (request: Request) =>
        assetsFrom(
          Schema.decodeUnknownOption(AssetFetcherSchema)(env.ASSETS)
        ).fetch(request),
    };

    return yield* serveRooms(
      siteStage.pipe(Effect.map((stage) => [siteOrigin(stage)])),
      sitePages(assets)
    );
  })
) {}
