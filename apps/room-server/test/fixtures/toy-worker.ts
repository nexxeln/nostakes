import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Layer } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { unlimited } from "../../src/address-limits.js";
import { roomRoutes } from "../../src/room-routes.js";
import { memoryAnalytics } from "./test-analytics.js";
import { scriptedEntropy } from "./test-entropy.js";
import { testRoutes } from "./test-hooks.js";
import ToyRoom from "./toy-room-object.js";

export const TEST_ORIGIN = "http://localhost:5173";

export default class ToyWorker extends Cloudflare.Worker<ToyWorker>()(
  "ToyWorker",
  {
    compatibility: { date: "2026-05-28" },
    dev: { port: 0 },
    main: import.meta.url,
  },
  Effect.gen(function* makeToyWorker() {
    const rooms = yield* ToyRoom;
    const codes = scriptedEntropy();
    const site = memoryAnalytics();

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: [TEST_ORIGIN],
      analytics: site.sink,
      entropy: codes.layer,
      limits: unlimited,
    });

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(routes, testRoutes(rooms, codes, site))
      ).pipe(Effect.orDie),
    };
  })
) {}
