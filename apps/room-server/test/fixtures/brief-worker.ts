import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Layer } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { unlimited } from "../../src/address-limits.js";
import { roomRoutes } from "../../src/room-routes.js";
import BriefRoom from "./brief-room-object.js";
import { scriptedEntropy } from "./test-entropy.js";
import { testRoutes } from "./test-hooks.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export default class BriefWorker extends Cloudflare.Worker<BriefWorker>()(
  "BriefWorker",
  {
    compatibility: { date: "2026-05-28" },
    dev: { port: 0 },
    main: import.meta.url,
  },
  Effect.gen(function* makeBriefWorker() {
    const rooms = yield* BriefRoom;
    const codes = scriptedEntropy();

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: [TEST_ORIGIN],
      entropy: codes.layer,
      limits: unlimited,
    });

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(routes, testRoutes(rooms, codes))
      ).pipe(Effect.orDie),
    };
  })
) {}
