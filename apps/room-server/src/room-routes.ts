import type { RpcCallError } from "@alchemy.run/cloudflare";
import {
  haltedStandings,
  joinRefused,
  revokedStandings,
  RoomCodeSchema,
  RoomPassSchema,
  StandingsRequestSchema,
} from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import { Effect, Layer, Option, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import type { HttpServerError } from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { addressOf, tooManyRequests } from "./address-limits.js";
import type { AddressLimits, LimitedAction } from "./address-limits.js";
import { recorder } from "./analytics.js";
import type { AnalyticsSink } from "./analytics.js";
import { reportMeasure, reportFrom } from "./client-reports.js";
import { DEVICE_HEADER, deviceOf } from "./device.js";
import { Entropy } from "./entropy.js";
import { measure, SITE_SCOPE } from "./measures.js";
import { refuseSocket } from "./refused-socket.js";
import { callRoom } from "./room-call-failed.js";
import type { RoomCallFailed } from "./room-call-failed.js";
import {
  CODE_DRAW_BYTES,
  codeFromBytes,
  MAX_CODE_ATTEMPTS,
} from "./room-code.js";
import { refuse, roomKeyOf } from "./room-object.js";
import {
  CheckOutcomeSchema,
  JoinOutcomeSchema,
  OpenOutcomeSchema,
  StandingsOutcomeSchema,
} from "./room-rpc.js";
import { defectWhere, RouteFault } from "./route-fault.js";

export interface RoomStub {
  readonly open: (input: {
    readonly code: string;
    readonly device?: string;
    readonly request: Schema.Json;
  }) => Effect.Effect<typeof OpenOutcomeSchema.Encoded, RpcCallError>;
  readonly join: (input: {
    readonly device?: string;
    readonly request: Schema.Json;
  }) => Effect.Effect<typeof JoinOutcomeSchema.Encoded, RpcCallError>;
  readonly check: () => Effect.Effect<
    typeof CheckOutcomeSchema.Encoded,
    RpcCallError
  >;
  readonly standings: (input: {
    readonly token: string;
  }) => Effect.Effect<typeof StandingsOutcomeSchema.Encoded, RpcCallError>;
  readonly fetch: (
    request: HttpServerRequest.HttpServerRequest
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, HttpServerError>;
}

export interface RoomNamespace {
  readonly getByName: (name: string) => RoomStub;
  readonly idFromName: (name: string) => { readonly toString: () => string };
}

export interface RoomRoutesOptions<R> {
  readonly allowedOrigins: readonly string[];
  readonly entropy: Layer.Layer<Entropy>;
  readonly limits: AddressLimits<R>;
  readonly analytics: AnalyticsSink<R>;
}

const CodePath = Schema.Struct({ code: Schema.String });

export const REPORTS_ROUTE = "/rooms/reports";

export const CHECK_ROUTE = "/rooms/:code/check";

const logged = (failure: RoomCallFailed | RouteFault) =>
  Effect.logError(failure.message).pipe(
    Effect.annotateLogs(
      Schema.is(RouteFault)(failure)
        ? { error: failure._tag }
        : { error: failure._tag, room: failure.room }
    )
  );

const withDevice = (device: Option.Option<string>) =>
  Option.match(device, {
    onNone: () => ({}),
    onSome: (hash) => ({ device: hash }),
  });

const decodeOpenOutcome = Schema.decodeEffect(OpenOutcomeSchema);

const decodeJoinOutcome = Schema.decodeEffect(JoinOutcomeSchema);

const decodeStandingsOutcome = Schema.decodeEffect(StandingsOutcomeSchema);

const decodeCheckOutcome = Schema.decodeEffect(CheckOutcomeSchema);

const encodeStandingsRequest = Schema.encodeSync(StandingsRequestSchema);

const standingsBody = HttpServerResponse.schemaJson(
  haltedStandings(Schema.Json)
);

const pass = HttpServerResponse.schemaJson(RoomPassSchema);

const joinRefusedBody = HttpServerResponse.schemaJson(joinRefused(Schema.Json));

const removedBody = HttpServerResponse.schemaJson(
  revokedStandings(Schema.Json)
);

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

const keyIn = (rooms: RoomNamespace, code: RoomCode) =>
  roomKeyOf(rooms.idFromName(code).toString());

export const roomRoutes = <R>(
  rooms: RoomNamespace,
  options: RoomRoutesOptions<R>
) =>
  Effect.gen(function* buildRoomRoutes() {
    const entropy = yield* Entropy.pipe(Effect.provide(options.entropy));

    const record = recorder(options.analytics, SITE_SCOPE);

    const unavailable = (failure: RoomCallFailed) =>
      record([measure("ServerFault", { fault: "RoomCallFailed" })]).pipe(
        Effect.andThen(logged(failure)),
        Effect.andThen(refuse("RoomUnavailable"))
      );

    const fromAllowedOrigin = HttpServerRequest.HttpServerRequest.pipe(
      Effect.map((request) =>
        options.allowedOrigins.includes(request.headers.origin ?? "")
      )
    );

    const guarded = (
      route: string,
      handler: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext | R
      >
    ) =>
      Effect.gen(function* checkOrigin() {
        if (!(yield* fromAllowedOrigin)) {
          return yield* refuse("BadOrigin");
        }

        return yield* handler;
      }).pipe(
        Effect.catchDefect((defect) =>
          record([measure("ServerFault", { fault: "RouteFault" })]).pipe(
            Effect.andThen(
              logged(new RouteFault({ detail: defectWhere(defect), route }))
            ),
            Effect.andThen(refuse("ServerFault"))
          )
        )
      );

    const limited = (
      action: LimitedAction,
      refusal: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest
      >,
      handler: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext | R
      >
    ) =>
      Effect.gen(function* checkAddress() {
        const address = yield* addressOf;

        if (!(yield* options.limits.allow(action, address))) {
          yield* record([measure("RateLimited", { action })]);

          return yield* refusal;
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

      const device = yield* deviceOf;

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const code = yield* drawCode.pipe(Effect.eventually);

        const outcome = yield* callRoom(
          keyIn(rooms, code),
          "open",
          rooms
            .getByName(code)
            .open({ code, request: body.value, ...withDevice(device) })
            .pipe(Effect.flatMap(decodeOpenOutcome))
        );

        if (OpenOutcomeSchema.guards.Opened(outcome)) {
          return yield* created(code, outcome.player, outcome.token);
        }

        if (OpenOutcomeSchema.guards.Invalid(outcome)) {
          return yield* refuse("BadRequest");
        }
      }

      return yield* refuse("NoFreeCode");
    }).pipe(Effect.catchTag("RoomCallFailed", unavailable));

    const joinRoom = Effect.gen(function* joinRoom() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      const body = yield* jsonBody;

      if (Option.isNone(body)) {
        return yield* refuse("BadRequest");
      }

      const device = yield* deviceOf;

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "join",
        rooms
          .getByName(code.value)
          .join({ request: body.value, ...withDevice(device) })
          .pipe(Effect.flatMap(decodeJoinOutcome))
      );

      return yield* JoinOutcomeSchema.match(outcome, {
        Faulted: () => refuse("ServerFault"),
        Invalid: () => refuse("BadRequest"),
        Joined: ({ player, token }) => created(code.value, player, token),
        NotFound: () => refuse("NotFound"),
        Refused: ({ rejection }) =>
          joinRefusedBody(
            { refusal: "JoinRefused", rejection },
            { status: 409 }
          ).pipe(Effect.orDie),
        RoomFull: () => refuse("RoomFull"),
        RoomHalted: () => refuse("RoomHalted"),
      });
    }).pipe(Effect.catchTag("RoomCallFailed", unavailable));

    const readStandings = Effect.gen(function* readStandings() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      const body = yield* jsonBody.pipe(
        Effect.map(
          Option.flatMap(Schema.decodeUnknownOption(StandingsRequestSchema))
        )
      );

      if (Option.isNone(body)) {
        return yield* refuse("BadRequest");
      }

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "standings",
        rooms
          .getByName(code.value)
          .standings(encodeStandingsRequest(body.value))
          .pipe(Effect.flatMap(decodeStandingsOutcome))
      );

      return yield* StandingsOutcomeSchema.match(outcome, {
        Halted: ({ view }) => standingsBody({ view }).pipe(Effect.orDie),
        Invalid: () => refuse("BadRequest"),
        NotAuthorized: () => refuse("NotAuthorized"),
        NotFound: () => refuse("NotFound"),
        NotHalted: () => refuse("RoomOpen"),
        Removed: ({ view }) =>
          removedBody({ removed: view }).pipe(Effect.orDie),
      });
    }).pipe(Effect.catchTag("RoomCallFailed", unavailable));

    const checkRoom = Effect.gen(function* checkRoom() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "check",
        rooms
          .getByName(code.value)
          .check()
          .pipe(Effect.flatMap(decodeCheckOutcome))
      );

      return yield* CheckOutcomeSchema.match(outcome, {
        Found: () => Effect.succeed(HttpServerResponse.empty({ status: 204 })),
        NotFound: () => refuse("NotFound"),
      });
    }).pipe(Effect.catchTag("RoomCallFailed", unavailable));

    const connect = Effect.gen(function* connect() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (request.headers.upgrade?.toLowerCase() !== "websocket") {
        return yield* refuse("UpgradeRequired");
      }

      if (Option.isNone(code)) {
        return yield* refuseSocket("NotFound");
      }

      return yield* callRoom(
        keyIn(rooms, code.value),
        "connect",
        rooms.getByName(code.value).fetch(request)
      );
    }).pipe(Effect.catchTag("RoomCallFailed", unavailable));

    const report = Effect.gen(function* report() {
      const received = yield* reportFrom;

      if (Option.isNone(received)) {
        return yield* refuse("BadRequest");
      }

      yield* record([reportMeasure(received.value)]);

      return HttpServerResponse.empty({ status: 204 });
    });

    const connectRefusal = HttpServerRequest.HttpServerRequest.pipe(
      Effect.flatMap((request) =>
        request.headers.upgrade?.toLowerCase() === "websocket"
          ? refuseSocket("TooManySockets")
          : refuse("UpgradeRequired")
      )
    );

    return Layer.mergeAll(
      HttpRouter.add(
        "POST",
        REPORTS_ROUTE,
        guarded(
          `POST ${REPORTS_ROUTE}`,
          limited("connect", tooManyRequests, report)
        )
      ),
      HttpRouter.add(
        "POST",
        "/rooms",
        guarded("POST /rooms", limited("create", tooManyRequests, createRoom))
      ),
      HttpRouter.add(
        "POST",
        "/rooms/:code/members",
        guarded(
          "POST /rooms/:code/members",
          limited("join", tooManyRequests, joinRoom)
        )
      ),
      HttpRouter.add(
        "POST",
        "/rooms/:code/standings",
        guarded(
          "POST /rooms/:code/standings",
          limited("join", tooManyRequests, readStandings)
        )
      ),
      HttpRouter.add(
        "POST",
        CHECK_ROUTE,
        guarded(
          `POST ${CHECK_ROUTE}`,
          limited("connect", tooManyRequests, checkRoom)
        )
      ),
      HttpRouter.add(
        "GET",
        "/rooms/:code/socket",
        guarded(
          "GET /rooms/:code/socket",
          limited("connect", connectRefusal, connect)
        )
      ),
      HttpRouter.cors({
        allowedHeaders: ["content-type", DEVICE_HEADER],
        allowedMethods: ["GET", "POST"],
        allowedOrigins: options.allowedOrigins,
      })
    );
  });
