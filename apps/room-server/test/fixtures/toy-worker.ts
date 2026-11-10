import * as Cloudflare from "@alchemy.run/cloudflare";
import { RoomCodeSchema } from "@nostakes/protocol";
import { Effect, Layer, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { bytesForCode } from "../../src/room-code.js";
import { roomRoutes } from "../../src/room-routes.js";
import { InspectionSchema } from "../../src/room-rpc.js";
import { scriptedEntropy } from "./test-entropy.js";
import ToyRoom from "./toy-room-object.js";

export const TEST_ORIGIN = "http://localhost:5173";

const CodePath = Schema.Struct({ code: RoomCodeSchema });

const CodesBody = Schema.Struct({ codes: Schema.Array(RoomCodeSchema) });

const AlarmBody = Schema.Struct({ at: Schema.Int });

const inspection = HttpServerResponse.schemaJson(InspectionSchema);

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

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: [TEST_ORIGIN],
      entropy: codes.layer,
    });

    const roomOf = HttpRouter.schemaPathParams(CodePath).pipe(
      Effect.map(({ code }) => rooms.getByName(code))
    );

    const inspect = roomOf.pipe(
      Effect.flatMap((room) => room.inspect()),
      Effect.flatMap(Schema.decodeEffect(InspectionSchema)),
      Effect.flatMap((value) => inspection(value)),
      Effect.orDie
    );

    const restart = roomOf.pipe(
      Effect.flatMap((room) => room.restart().pipe(Effect.ignore)),
      Effect.as(HttpServerResponse.empty({ status: 204 })),
      Effect.orDie
    );

    const wake = Effect.gen(function* wake() {
      const room = yield* roomOf;
      const { at } = yield* HttpServerRequest.schemaBodyJson(AlarmBody);

      yield* room.wakeAt(at);

      return HttpServerResponse.empty({ status: 204 });
    }).pipe(Effect.orDie);

    const queueCodes = Effect.gen(function* queueCodes() {
      const body = yield* HttpServerRequest.schemaBodyJson(CodesBody);

      for (const code of body.codes) {
        codes.enqueue(bytesForCode(code));
      }

      return HttpServerResponse.empty({ status: 204 });
    }).pipe(Effect.orDie);

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(
          routes,
          HttpRouter.add("GET", "/test/rooms/:code", inspect),
          HttpRouter.add("POST", "/test/rooms/:code/restart", restart),
          HttpRouter.add("POST", "/test/rooms/:code/alarm", wake),
          HttpRouter.add("POST", "/test/codes", queueCodes)
        )
      ).pipe(Effect.orDie),
    };
  })
) {}
