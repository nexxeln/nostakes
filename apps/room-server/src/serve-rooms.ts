import * as Cloudflare from "@alchemy.run/cloudflare";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import { Config, Effect, Layer, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { cloudflareAddressLimits } from "./address-limits.js";
import { analyticsDataset, recorder } from "./analytics.js";
import type { Recorder } from "./analytics.js";
import { liveEntropy } from "./entropy.js";
import FeedbackBox from "./feedback-box.js";
import { feedbackRoutes } from "./feedback-routes.js";
import { FEEDBACK_SECRET } from "./feedback-wire.js";
import { SITE_SCOPE } from "./measures.js";
import PokerRoom from "./poker-room-object.js";
import { roomRoutes } from "./room-routes.js";
import { withRobotsTag } from "./search-index.js";
import type { Indexing } from "./search-index.js";
import { servedBuild } from "./served-build.js";

export const OriginSchema = Schema.String.check(
  Schema.isPattern(/^https?:\/\/[^\s,/]+$/u)
);

export const allowedOrigins = Config.Array(OriginSchema, "ALLOWED_ORIGINS", {
  separator: ",",
});

export const configuredOrigins = Effect.gen(function* configuredOrigins() {
  return yield* allowedOrigins;
});

export interface ServedSite {
  readonly indexing: Indexing;
  readonly pages: (
    record: Recorder<RuntimeContext>
  ) => Layer.Layer<
    never,
    never,
    HttpRouter.HttpRouter | HttpRouter.Request<"Requires", RuntimeContext>
  >;
}

const NO_SITE: ServedSite = {
  indexing: "Unindexed",
  pages: () => Layer.empty,
};

export const serveRooms = <R>(
  origins: Effect.Effect<readonly string[], Config.ConfigError, R>,
  site: ServedSite = NO_SITE
) =>
  Effect.gen(function* buildRoomService() {
    const rooms = yield* PokerRoom;

    yield* servedBuild;

    const analytics = yield* analyticsDataset;

    const box = yield* FeedbackBox;

    const secret = yield* Config.option(Config.Redacted(FEEDBACK_SECRET));

    const allowed = yield* origins;

    const limits = yield* cloudflareAddressLimits;

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: allowed,
      analytics,
      entropy: liveEntropy,
      limits,
    });

    const feedback = feedbackRoutes(box, {
      allowedOrigins: allowed,
      analytics,
      limits,
      secret,
    });

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(
          routes,
          feedback,
          site.pages(recorder(analytics, SITE_SCOPE))
        )
      ).pipe(Effect.map(withRobotsTag(site.indexing)), Effect.orDie),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.RateLimitBinding));
