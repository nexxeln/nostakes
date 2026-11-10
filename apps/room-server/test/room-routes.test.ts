import { RpcCallError } from "@alchemy.run/cloudflare";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Logger, References } from "effect";
import type { Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { unlimited } from "../src/address-limits.js";
import type { AddressLimits } from "../src/address-limits.js";
import { noAnalytics } from "../src/analytics.js";
import { roomRoutes } from "../src/room-routes.js";
import type { RoomNamespace } from "../src/room-routes.js";
import { seededEntropy } from "./fixtures/test-entropy.js";

const ORIGIN = "https://preview.nostakes.club";

const CODE = "QT8VND";

const OPENED_CODE = "BZN4DT";

const RETRY_HINT =
  "Cloudflare refuses calls to a room for a while after a deploy, so the client answers RoomUnavailable and may try again.";

const CLOUDFLARE_REFUSAL =
  "internal error; reference = 98i1pb6sadjgmqn3cbelsb04";

const refusedCall = (method: string) =>
  Effect.fail(
    new RpcCallError({ cause: new Error(CLOUDFLARE_REFUSAL), method })
  );

const unreachableRooms: RoomNamespace = {
  getByName: () => ({
    fetch: () => Effect.die(new Error(CLOUDFLARE_REFUSAL)),
    join: () => refusedCall("join"),
    open: () => refusedCall("open"),
    standings: () => refusedCall("standings"),
  }),
};

const brokenLimiter: AddressLimits = {
  allow: () => Effect.die(new Error("the limiter broke")),
};

interface Logged {
  readonly error: unknown;
  readonly level: string;
  readonly text: string;
}

const answer = (
  rooms: RoomNamespace,
  limits: AddressLimits,
  request: Request
) =>
  Effect.gen(function* answerRequest() {
    const logs: Logged[] = [];

    const capture = Logger.make((options) => {
      logs.push({
        error: options.fiber.getRef(References.CurrentLogAnnotations).error,
        level: options.logLevel,
        text: String(options.message),
      });
    });

    const routes = yield* roomRoutes(rooms, {
      allowedOrigins: [ORIGIN],
      analytics: noAnalytics,
      entropy: seededEntropy(1),
      limits,
    });

    const handle = yield* HttpRouter.toHttpEffect(routes);

    const response = yield* handle.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request)
      ),
      Effect.provide(Logger.layer([capture]))
    );

    const web = HttpServerResponse.toWeb(response);
    const body = yield* Effect.promise(() => web.text());

    return { body, logs, status: web.status };
  }).pipe(Effect.scoped);

const post = (path: string, body: Schema.Json) =>
  new Request(new URL(path, ORIGIN), {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: ORIGIN },
    method: "POST",
  });

const upgrade = (path: string) =>
  new Request(new URL(path, ORIGIN), {
    headers: { origin: ORIGIN, upgrade: "websocket" },
  });

describe("a room Cloudflare refuses to call", () => {
  it.effect("answers an open with RoomUnavailable and logs why", () =>
    Effect.gen(function* openUnreachable() {
      const { body, logs, status } = yield* answer(
        unreachableRooms,
        unlimited,
        post("/rooms", { avatar: "fox", name: "Ana" })
      );

      expect({ body, status }).toEqual({
        body: '{"refusal":"RoomUnavailable"}',
        status: 503,
      });
      expect(logs).toEqual([
        {
          error: "RoomCallFailed",
          level: "Error",
          text: `Room ${OPENED_CODE} failed the open call: RPC call to "open" failed: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
        },
      ]);
    })
  );

  it.effect("answers a join with RoomUnavailable and logs the room", () =>
    Effect.gen(function* joinUnreachable() {
      const { body, logs, status } = yield* answer(
        unreachableRooms,
        unlimited,
        post(`/rooms/${CODE}/members`, { avatar: "owl", name: "Ben" })
      );

      expect({ body, status }).toEqual({
        body: '{"refusal":"RoomUnavailable"}',
        status: 503,
      });
      expect(logs).toEqual([
        {
          error: "RoomCallFailed",
          level: "Error",
          text: `Room ${CODE} failed the join call: RPC call to "join" failed: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
        },
      ]);
    })
  );

  it.effect("answers a socket upgrade with RoomUnavailable", () =>
    Effect.gen(function* connectUnreachable() {
      const { body, logs, status } = yield* answer(
        unreachableRooms,
        unlimited,
        upgrade(`/rooms/${CODE}/socket`)
      );

      expect({ body, status }).toEqual({
        body: '{"refusal":"RoomUnavailable"}',
        status: 503,
      });
      expect(logs).toEqual([
        {
          error: "RoomCallFailed",
          level: "Error",
          text: `Room ${CODE} failed the connect call: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
        },
      ]);
    })
  );
});

describe("a route that dies", () => {
  it.effect("answers ServerFault and logs the defect", () =>
    Effect.gen(function* routeDies() {
      const { body, logs, status } = yield* answer(
        unreachableRooms,
        brokenLimiter,
        post("/rooms", { avatar: "fox", name: "Ana" })
      );

      expect({ body, status }).toEqual({
        body: '{"refusal":"ServerFault"}',
        status: 500,
      });
      expect(logs.map(({ error, level }) => ({ error, level }))).toEqual([
        { error: "RouteFault", level: "Error" },
      ]);
      expect(logs.map(({ text }) => text).join("")).toMatch(
        /^The room route POST \/rooms died: Error: the limiter broke\n {4}at .+The client was answered ServerFault\. This is a bug in the room server\.$/su
      );
    })
  );
});
