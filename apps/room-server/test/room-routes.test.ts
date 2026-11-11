import { RpcCallError } from "@alchemy.run/cloudflare";
import { describe, expect, it } from "@effect/vitest";
import { MAX_BODY_BYTES } from "@nostakes/protocol";
import { Effect, Logger, References } from "effect";
import type { Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { unlimited } from "../src/address-limits.js";
import type { AddressLimits } from "../src/address-limits.js";
import { noAnalytics } from "../src/analytics.js";
import { roomKeyOf } from "../src/room-object.js";
import { REPORTS_ROUTE, roomRoutes } from "../src/room-routes.js";
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

const objectIdOf = (name: string) => `object for ${name}`;

const unreachableRooms: RoomNamespace = {
  getByName: () => ({
    check: () => refusedCall("check"),
    fetch: () => Effect.die(new Error(CLOUDFLARE_REFUSAL)),
    join: () => refusedCall("join"),
    open: () => refusedCall("open"),
    standings: () => refusedCall("standings"),
  }),
  idFromName: (name) => ({ toString: () => objectIdOf(name) }),
};

const brokenLimiter: AddressLimits = {
  allow: () => Effect.die(new Error(`the limiter broke for ${CODE} and Ana`)),
};

interface Logged {
  readonly error: unknown;
  readonly level: string;
  readonly room: unknown;
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
      const annotations = options.fiber.getRef(
        References.CurrentLogAnnotations
      );

      logs.push({
        error: annotations.error,
        level: options.logLevel,
        room: annotations.room,
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

    expect(
      logs.some(
        (logged) =>
          JSON.stringify(logged).includes(CODE) ||
          JSON.stringify(logged).includes(OPENED_CODE)
      )
    ).toBe(false);

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
          room: yield* roomKeyOf(objectIdOf(OPENED_CODE)),
          text: `A room failed the open call: RPC call to "open" failed: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
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
          room: yield* roomKeyOf(objectIdOf(CODE)),
          text: `A room failed the join call: RPC call to "join" failed: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
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
          room: yield* roomKeyOf(objectIdOf(CODE)),
          text: `A room failed the connect call: ${CLOUDFLARE_REFUSAL}. ${RETRY_HINT}`,
        },
      ]);
    })
  );
});

describe("a route that dies", () => {
  it.effect(
    "answers ServerFault and logs where the defect happened, not what it said",
    () =>
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
          /^The room route POST \/rooms died: Error at .+\. The client was answered ServerFault\. This is a bug in the room server\.$/su
        );
        expect(logs.map(({ text }) => text).join("")).not.toContain("Ana");
      })
  );
});

const RAW_ROUTES = [
  "/rooms",
  `/rooms/${CODE}/members`,
  `/rooms/${CODE}/standings`,
  REPORTS_ROUTE,
] as const;

const sentRaw = (path: string, text: string, length: "Declared" | "Chunked") =>
  new Request(new URL(path, ORIGIN), {
    body:
      length === "Declared"
        ? text
        : new ReadableStream({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode(text));
              controller.close();
            },
          }),
    duplex: "half",
    headers: { "content-type": "application/json", origin: ORIGIN },
    method: "POST",
  });

const padded = (bytes: number) =>
  JSON.stringify({ avatar: "fox", name: "Ana", pad: "x".repeat(bytes) });

const callsTo = (calls: string[]): RoomNamespace => ({
  getByName: () => ({
    check: () => refusedCall("check"),
    fetch: () => Effect.die(new Error(CLOUDFLARE_REFUSAL)),
    join: () =>
      Effect.sync(() => calls.push("join")).pipe(
        Effect.andThen(refusedCall("join"))
      ),
    open: () =>
      Effect.sync(() => calls.push("open")).pipe(
        Effect.andThen(refusedCall("open"))
      ),
    standings: () =>
      Effect.sync(() => calls.push("standings")).pipe(
        Effect.andThen(refusedCall("standings"))
      ),
  }),
  idFromName: (name) => ({ toString: () => objectIdOf(name) }),
});

describe("a request body past the limit", () => {
  it.effect(
    "is refused with 413 BodyTooLarge on every route, declared or chunked, before any room is called",
    () =>
      Effect.gen(function* tooLarge() {
        const calls: string[] = [];

        const answers: { readonly body: string; readonly status: number }[] =
          [];

        for (const path of RAW_ROUTES) {
          for (const length of ["Declared", "Chunked"] as const) {
            const { body, status } = yield* answer(
              callsTo(calls),
              unlimited,
              sentRaw(path, padded(MAX_BODY_BYTES), length)
            );

            answers.push({ body, status });
          }
        }

        expect(answers).toStrictEqual(
          RAW_ROUTES.flatMap(() => [
            { body: '{"refusal":"BodyTooLarge"}', status: 413 },
            { body: '{"refusal":"BodyTooLarge"}', status: 413 },
          ])
        );
        expect(calls).toStrictEqual([]);
      })
  );

  it.effect("reaches the room when it fits", () =>
    Effect.gen(function* fits() {
      const calls: string[] = [];
      const fitting = padded(MAX_BODY_BYTES - padded(0).length);

      for (const length of ["Declared", "Chunked"] as const) {
        yield* answer(
          callsTo(calls),
          unlimited,
          sentRaw("/rooms", fitting, length)
        );
      }

      expect(new TextEncoder().encode(fitting).length).toBe(MAX_BODY_BYTES);
      expect(calls).toStrictEqual(["open", "open"]);
    })
  );
});
