import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as cf from "@cloudflare/workers-types";
import { RoomCodeSchema } from "@nostakes/protocol";
import { Effect, Layer, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import type { Entropy } from "../../src/entropy.js";
import type { HostedRoom, RoomTypes } from "../../src/hosted-room.js";
import { bytesForCode } from "../../src/room-code.js";
import { roomObject } from "../../src/room-object.js";
import { InspectionSchema } from "../../src/room-rpc.js";
import type { scriptedEntropy } from "./test-entropy.js";

const AlarmAt = Schema.Int;

export const roomObjectWithTestHooks = <T extends RoomTypes>(
  core: HostedRoom<T>,
  entropyFor: (state: cf.DurableObjectState) => Layer.Layer<Entropy>
) =>
  Cloudflare.DurableObjectState.pipe(
    Effect.flatMap((state) =>
      roomObject(core, { entropy: entropyFor(state.raw) }).pipe(
        Effect.map((instance) =>
          instance.pipe(
            Effect.map((room) => ({
              ...room,
              restart: () =>
                Effect.sync(() => {
                  state.raw.abort("restart requested by a test");
                }),
              wakeAt: (at: typeof AlarmAt.Encoded) =>
                Schema.decodeEffect(AlarmAt)(at).pipe(
                  Effect.flatMap((time) =>
                    Effect.promise(() => state.raw.storage.setAlarm(time))
                  ),
                  Effect.orDie
                ),
            }))
          )
        )
      )
    )
  );

export interface TestRoomStub {
  readonly inspect: () => Effect.Effect<typeof InspectionSchema.Encoded>;
  readonly restart: () => Effect.Effect<void>;
  readonly wakeAt: (at: number) => Effect.Effect<void>;
}

export interface TestRooms {
  readonly getByName: (name: string) => TestRoomStub;
}

const CodePath = Schema.Struct({ code: RoomCodeSchema });

const CodesBody = Schema.Struct({ codes: Schema.Array(RoomCodeSchema) });

const AlarmBody = Schema.Struct({ at: Schema.Int });

const inspection = HttpServerResponse.schemaJson(InspectionSchema);

export const testRoutes = (
  rooms: TestRooms,
  codes: ReturnType<typeof scriptedEntropy>
) => {
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

  return Layer.mergeAll(
    HttpRouter.add("GET", "/test/rooms/:code", inspect),
    HttpRouter.add("POST", "/test/rooms/:code/restart", restart),
    HttpRouter.add("POST", "/test/rooms/:code/alarm", wake),
    HttpRouter.add("POST", "/test/codes", queueCodes)
  );
};
