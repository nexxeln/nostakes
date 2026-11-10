import { RoomCodeSchema, RoomPassSchema } from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import { Effect, Layer, Option, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import type { HttpServerError } from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { Entropy } from "./entropy.js";
import {
  CODE_DRAW_BYTES,
  codeFromBytes,
  MAX_CODE_ATTEMPTS,
} from "./room-code.js";
import { refuse } from "./room-object.js";
import { JoinOutcomeSchema, OpenOutcomeSchema } from "./room-rpc.js";

export interface RoomStub {
  readonly open: (input: {
    readonly code: string;
    readonly request: Schema.Json;
  }) => Effect.Effect<typeof OpenOutcomeSchema.Encoded>;
  readonly join: (input: {
    readonly request: Schema.Json;
  }) => Effect.Effect<typeof JoinOutcomeSchema.Encoded>;
  readonly fetch: (
    request: HttpServerRequest.HttpServerRequest
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, HttpServerError>;
}

export interface RoomNamespace {
  readonly getByName: (name: string) => RoomStub;
}

export interface RoomRoutesOptions {
  readonly allowedOrigins: readonly string[];
  readonly entropy: Layer.Layer<Entropy>;
}

const CodePath = Schema.Struct({ code: Schema.String });

const decodeOpenOutcome = Schema.decodeEffect(OpenOutcomeSchema);

const decodeJoinOutcome = Schema.decodeEffect(JoinOutcomeSchema);

const pass = HttpServerResponse.schemaJson(RoomPassSchema);

const created = (code: RoomCode, player: string, token: string) =>
  Schema.decodeEffect(RoomPassSchema)({ code, player, token }).pipe(
    Effect.flatMap((value) => pass(value, { status: 201 })),
    Effect.orDie
  );

const roomCodeOf = HttpRouter.schemaPathParams(CodePath).pipe(
  Effect.map(({ code }) => Schema.decodeOption(RoomCodeSchema)(code))
);

const jsonBody = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((request) => request.json),
  Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
  Effect.option
);

export const roomRoutes = (rooms: RoomNamespace, options: RoomRoutesOptions) =>
  Effect.gen(function* buildRoomRoutes() {
    const entropy = yield* Entropy.pipe(Effect.provide(options.entropy));

    const fromAllowedOrigin = HttpServerRequest.HttpServerRequest.pipe(
      Effect.map((request) =>
        options.allowedOrigins.includes(request.headers.origin ?? "")
      )
    );

    const guarded = (
      handler: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext
      >
    ) =>
      Effect.gen(function* checkOrigin() {
        if (!(yield* fromAllowedOrigin)) {
          return yield* refuse("BadOrigin");
        }

        return yield* handler;
      });

    const drawCode = entropy
      .bytes(CODE_DRAW_BYTES)
      .pipe(Effect.map(codeFromBytes), Effect.flatMap(Effect.fromOption));

    const createRoom = Effect.gen(function* createRoom() {
      const body = yield* jsonBody;

      if (Option.isNone(body)) {
        return yield* refuse("BadRequest");
      }

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const code = yield* drawCode.pipe(Effect.eventually);

        const outcome = yield* rooms
          .getByName(code)
          .open({ code, request: body.value })
          .pipe(Effect.flatMap(decodeOpenOutcome), Effect.orDie);

        if (OpenOutcomeSchema.guards.Opened(outcome)) {
          return yield* created(code, outcome.player, outcome.token);
        }

        if (OpenOutcomeSchema.guards.Invalid(outcome)) {
          return yield* refuse("BadRequest");
        }
      }

      return yield* refuse("NoFreeCode");
    });

    const joinRoom = Effect.gen(function* joinRoom() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      const body = yield* jsonBody;

      if (Option.isNone(body)) {
        return yield* refuse("BadRequest");
      }

      const outcome = yield* rooms
        .getByName(code.value)
        .join({ request: body.value })
        .pipe(Effect.flatMap(decodeJoinOutcome), Effect.orDie);

      return yield* JoinOutcomeSchema.match(outcome, {
        Invalid: () => refuse("BadRequest"),
        Joined: ({ player, token }) => created(code.value, player, token),
        NotFound: () => refuse("NotFound"),
        Refused: () => refuse("BadRequest"),
        RoomFull: () => refuse("RoomFull"),
        RoomHalted: () => refuse("RoomHalted"),
      });
    });

    const connect = Effect.gen(function* connect() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      if (request.headers.upgrade?.toLowerCase() !== "websocket") {
        return yield* refuse("UpgradeRequired");
      }

      return yield* rooms
        .getByName(code.value)
        .fetch(request)
        .pipe(Effect.orDie);
    });

    return Layer.mergeAll(
      HttpRouter.add("POST", "/rooms", guarded(createRoom)),
      HttpRouter.add("POST", "/rooms/:code/members", guarded(joinRoom)),
      HttpRouter.add("GET", "/rooms/:code/socket", guarded(connect)),
      HttpRouter.cors({
        allowedHeaders: ["content-type"],
        allowedMethods: ["GET", "POST"],
        allowedOrigins: options.allowedOrigins,
      })
    );
  });
