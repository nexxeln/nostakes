import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { cloudflareAddressLimits } from "./address-limits.js";
import { liveEntropy } from "./entropy.js";
import PokerRoom from "./poker-room-object.js";
import { roomRoutes } from "./room-routes.js";

export const OriginSchema = Schema.String.check(
  Schema.isPattern(/^https?:\/\/[^\s,/]+$/u)
);

export const allowedOrigins = Config.Array(OriginSchema, "ALLOWED_ORIGINS", {
  separator: ",",
});

export const serveRooms = Effect.gen(function* serveRooms() {
  const rooms = yield* PokerRoom;

  const routes = yield* roomRoutes(rooms, {
    allowedOrigins: yield* allowedOrigins,
    entropy: liveEntropy,
    limits: yield* cloudflareAddressLimits,
  });

  return {
    fetch: yield* HttpRouter.toHttpEffect(routes).pipe(Effect.orDie),
  };
}).pipe(Effect.provide(Cloudflare.Workers.RateLimitBinding));
