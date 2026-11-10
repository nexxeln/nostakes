import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";

import { liveEntropy } from "./entropy.js";
import PokerRoom from "./poker-room-object.js";
import { roomRoutes } from "./room-routes.js";

export const OriginSchema = Schema.String.check(
  Schema.isPattern(/^https?:\/\/[^\s,/]+$/u)
);

export const allowedOrigins = Config.Array(OriginSchema, "ALLOWED_ORIGINS", {
  separator: ",",
});

export default class RoomWorker extends Cloudflare.Worker<RoomWorker>()(
  "RoomWorker",
  {
    compatibility: { date: "2026-05-28" },
    main: import.meta.url,
  },
  Effect.gen(function* makeRoomWorker() {
    const rooms = yield* PokerRoom;

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: yield* allowedOrigins,
      entropy: liveEntropy,
    });

    return {
      fetch: yield* HttpRouter.toHttpEffect(routes).pipe(Effect.orDie),
    };
  })
) {}
