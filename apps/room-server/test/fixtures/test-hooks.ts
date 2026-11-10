import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as cf from "@cloudflare/workers-types";
import { RoomCodeSchema } from "@nostakes/protocol";
import { Effect, Layer, Option, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import type { RoomMeasures } from "../../src/analytics.js";
import type { Beacon } from "../../src/beacon.js";
import type { Entropy } from "../../src/entropy.js";
import type { HostedRoom, RoomTypes } from "../../src/hosted-room.js";
import { StampedPointSchema } from "../../src/measures.js";
import type { StampedPoint } from "../../src/measures.js";
import { RETRY_POLICY } from "../../src/refused-deadline.js";
import type { RetryPolicy } from "../../src/refused-deadline.js";
import { bytesForCode } from "../../src/room-code.js";
import { ROOM_RETENTION_MS } from "../../src/room-host.js";
import { roomObject } from "../../src/room-object.js";
import { InspectionSchema } from "../../src/room-rpc.js";
import {
  AnalyticsModeSchema,
  objectAnalytics,
  storedAnalytics,
} from "./test-analytics.js";
import type { AnalyticsMode } from "./test-analytics.js";
import { testBeacon } from "./test-beacon.js";
import type { scriptedEntropy } from "./test-entropy.js";

const AlarmAt = Schema.Int;

const JAM_TABLE =
  "create table if not exists test_jam (id integer primary key check (id = 1), jammed integer not null)";

const JamRows = Schema.Array(Schema.Struct({ jammed: Schema.Int }));

const decodeJamRows = Schema.decodeUnknownSync(JamRows);

const storedJam = (storage: cf.DurableObjectStorage) => {
  storage.sql.exec(JAM_TABLE);

  return (
    decodeJamRows(storage.sql.exec("select jammed from test_jam").toArray())[0]
      ?.jammed === 1
  );
};

const storeJam = (storage: cf.DurableObjectStorage, jammed: boolean) => {
  storage.sql.exec(JAM_TABLE);
  storage.sql.exec(
    "insert or replace into test_jam (id, jammed) values (1, ?)",
    jammed ? 1 : 0
  );
};

export interface TestHookOptions {
  readonly beacon?: Layer.Layer<Beacon>;
  readonly retainFor?: number;
  readonly retries?: RetryPolicy;
}

export const roomObjectWithTestHooks = <T extends RoomTypes, Tally>(
  coreFor: (jammed: () => boolean) => HostedRoom<T>,
  entropyFor: (state: cf.DurableObjectState) => Layer.Layer<Entropy>,
  measures: RoomMeasures<T["Event"], Tally>,
  options: TestHookOptions = {}
) =>
  Cloudflare.DurableObjectState.pipe(
    Effect.flatMap((state) => {
      const jam = { on: Option.none<boolean>() };

      const jammed = () => {
        const on = Option.getOrElse(jam.on, () => storedJam(state.raw.storage));

        jam.on = Option.some(on);

        return on;
      };

      return roomObject(coreFor(jammed), {
        analytics: objectAnalytics(state.raw),
        beacon: options.beacon ?? testBeacon,
        entropy: entropyFor(state.raw),
        measures,
        retainFor: options.retainFor ?? ROOM_RETENTION_MS,
        retries: options.retries ?? RETRY_POLICY,
      }).pipe(
        Effect.map((instance) =>
          instance.pipe(
            Effect.map((room) => ({
              ...room,
              analytics: () =>
                Effect.sync(() =>
                  storedAnalytics(state.raw)
                    .points()
                    .map((stamped) =>
                      Schema.encodeSync(StampedPointSchema)(stamped)
                    )
                ),
              analyticsMode: (mode: AnalyticsMode) =>
                Schema.decodeEffect(AnalyticsModeSchema)(mode).pipe(
                  Effect.flatMap((decoded) =>
                    Effect.sync(() => {
                      storedAnalytics(state.raw).setMode(decoded);
                    })
                  ),
                  Effect.orDie
                ),
              jam: (wanted: typeof Schema.Boolean.Encoded) =>
                Schema.decodeEffect(Schema.Boolean)(wanted).pipe(
                  Effect.flatMap((on) =>
                    Effect.sync(() => {
                      storeJam(state.raw.storage, on);
                      jam.on = Option.some(on);
                    })
                  ),
                  Effect.orDie
                ),
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
      );
    })
  );

export interface TestRoomStub {
  readonly analytics: () => Effect.Effect<
    readonly (typeof StampedPointSchema.Encoded)[]
  >;
  readonly analyticsMode: (mode: AnalyticsMode) => Effect.Effect<void>;
  readonly inspect: () => Effect.Effect<typeof InspectionSchema.Encoded>;
  readonly jam: (on: boolean) => Effect.Effect<void>;
  readonly restart: () => Effect.Effect<void>;
  readonly wakeAt: (at: number) => Effect.Effect<void>;
}

export interface TestRooms {
  readonly getByName: (name: string) => TestRoomStub;
}

const CodePath = Schema.Struct({ code: RoomCodeSchema });

const CodesBody = Schema.Struct({ codes: Schema.Array(RoomCodeSchema) });

const AlarmBody = Schema.Struct({ at: Schema.Int });

const JamBody = Schema.Struct({ on: Schema.Boolean });

const ModeBody = Schema.Struct({ mode: AnalyticsModeSchema });

const inspection = HttpServerResponse.schemaJson(InspectionSchema);

const stampedPoints = HttpServerResponse.schemaJson(
  Schema.Array(StampedPointSchema)
);

export interface SiteAnalytics {
  readonly points: () => readonly StampedPoint[];
}

export const testRoutes = (
  rooms: TestRooms,
  codes: ReturnType<typeof scriptedEntropy>,
  site: SiteAnalytics
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

  const jam = Effect.gen(function* jamRoom() {
    const room = yield* roomOf;
    const { on } = yield* HttpServerRequest.schemaBodyJson(JamBody);

    yield* room.jam(on);

    return HttpServerResponse.empty({ status: 204 });
  }).pipe(Effect.orDie);

  const queueCodes = Effect.gen(function* queueCodes() {
    const body = yield* HttpServerRequest.schemaBodyJson(CodesBody);

    for (const code of body.codes) {
      codes.enqueue(bytesForCode(code));
    }

    return HttpServerResponse.empty({ status: 204 });
  }).pipe(Effect.orDie);

  const roomAnalytics = roomOf.pipe(
    Effect.flatMap((room) => room.analytics()),
    Effect.flatMap(Schema.decodeEffect(Schema.Array(StampedPointSchema))),
    Effect.flatMap((points) => stampedPoints(points)),
    Effect.orDie
  );

  const setAnalyticsMode = Effect.gen(function* setAnalyticsMode() {
    const room = yield* roomOf;
    const { mode } = yield* HttpServerRequest.schemaBodyJson(ModeBody);

    yield* room.analyticsMode(mode);

    return HttpServerResponse.empty({ status: 204 });
  }).pipe(Effect.orDie);

  const siteAnalytics = Effect.suspend(() => stampedPoints(site.points())).pipe(
    Effect.orDie
  );

  return Layer.mergeAll(
    HttpRouter.add("GET", "/test/analytics", siteAnalytics),
    HttpRouter.add("GET", "/test/rooms/:code/analytics", roomAnalytics),
    HttpRouter.add("POST", "/test/rooms/:code/analytics", setAnalyticsMode),
    HttpRouter.add("GET", "/test/rooms/:code", inspect),
    HttpRouter.add("POST", "/test/rooms/:code/restart", restart),
    HttpRouter.add("POST", "/test/rooms/:code/alarm", wake),
    HttpRouter.add("POST", "/test/rooms/:code/jam", jam),
    HttpRouter.add("POST", "/test/codes", queueCodes)
  );
};
