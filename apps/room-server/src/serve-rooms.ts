import * as Cloudflare from "@alchemy.run/cloudflare";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import { Config, Effect, Layer, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { cloudflareAddressLimits } from "./address-limits.js";
import { analyticsDataset, recorder } from "./analytics.js";
import type { Recorder } from "./analytics.js";
import { liveEntropy } from "./entropy.js";
import { SITE_SCOPE } from "./measures.js";
import PokerRoom from "./poker-room-object.js";
import { roomRoutes } from "./room-routes.js";
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

export const serveRooms = <R>(
  origins: Effect.Effect<readonly string[], Config.ConfigError, R>,
  pages: (
    record: Recorder<RuntimeContext>
  ) => Layer.Layer<
    never,
    never,
    HttpRouter.HttpRouter | HttpRouter.Request<"Requires", RuntimeContext>
  > = () => Layer.empty
) =>
  Effect.gen(function* buildRoomService() {
    const rooms = yield* PokerRoom;

    yield* servedBuild;

    const analytics = yield* analyticsDataset;

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: yield* origins,
      analytics,
      entropy: liveEntropy,
      limits: yield* cloudflareAddressLimits,
    });

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(routes, pages(recorder(analytics, SITE_SCOPE)))
      ).pipe(Effect.orDie),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.RateLimitBinding));
