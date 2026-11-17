import type { RpcCallError } from "@alchemy.run/cloudflare";
import {
  MAX_BODY_BYTES,
  MAX_VOICE_BODY_BYTES,
  VoiceRefusalSchema,
  VoiceRequestSchema,
  haltedStandings,
  joinRefused,
  knockStandings,
  knockingPass,
  revokedStandings,
  RoomCodeSchema,
  RoomPassSchema,
  StandingsRequestSchema,
} from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import { Effect, Layer, Option, Result, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import type { HttpServerError } from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { tooManyRequests } from "./address-limits.js";
import type { AddressLimits } from "./address-limits.js";
import type { AnalyticsSink } from "./analytics.js";
import { reportMeasure, reportFrom } from "./client-reports.js";
import { DEVICE_HEADER, deviceOf } from "./device.js";
import { Entropy } from "./entropy.js";
import { measure } from "./measures.js";
import { refuseSocket } from "./refused-socket.js";
import { bodyWithin } from "./request-body.js";
import type { BodyRefusal } from "./request-body.js";
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
  VoiceOutcomeSchema,
} from "./room-rpc.js";
import { logged, routeGuards } from "./route-guards.js";

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
  readonly voice: (
    input: typeof VoiceRequestSchema.Encoded
  ) => Effect.Effect<typeof VoiceOutcomeSchema.Encoded, RpcCallError>;
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

export const VOICE_ROUTE = "/rooms/:code/voice";

const withDevice = (device: Option.Option<string>) =>
  Option.match(device, {
    onNone: () => ({}),
    onSome: (hash) => ({ device: hash }),
  });

const decodeOpenOutcome = Schema.decodeEffect(OpenOutcomeSchema);

const decodeJoinOutcome = Schema.decodeEffect(JoinOutcomeSchema);

const decodeStandingsOutcome = Schema.decodeEffect(StandingsOutcomeSchema);

const decodeCheckOutcome = Schema.decodeEffect(CheckOutcomeSchema);

const decodeVoiceOutcome = Schema.decodeEffect(VoiceOutcomeSchema);

const encodeVoiceRequest = Schema.encodeSync(VoiceRequestSchema);

const voiceRefusalBody = HttpServerResponse.schemaJson(VoiceRefusalSchema);

const VOICE_REFUSAL_STATUS = {
  VoiceRefused: 403,
  VoiceUnavailable: 503,
} as const;

const encodeStandingsRequest = Schema.encodeSync(StandingsRequestSchema);

const standingsBody = HttpServerResponse.schemaJson(
  haltedStandings(Schema.Json)
);

const pass = HttpServerResponse.schemaJson(RoomPassSchema);

const joinRefusedBody = HttpServerResponse.schemaJson(joinRefused(Schema.Json));

const removedBody = HttpServerResponse.schemaJson(
  revokedStandings(Schema.Json)
);

const knockBody = HttpServerResponse.schemaJson(knockStandings(Schema.Json));

const knockingBody = HttpServerResponse.schemaJson(knockingPass(Schema.Json));

const knocking = (
  code: RoomCode,
  player: string,
  token: string,
  knock: Schema.Json
) =>
  Schema.decodeEffect(RoomPassSchema)({ code, player, token }).pipe(
    Effect.flatMap((granted) =>
      knockingBody({ ...granted, knock }, { status: 202 })
    ),
    Effect.orDie
  );

const created = (code: RoomCode, player: string, token: string) =>
  Schema.decodeEffect(RoomPassSchema)({ code, player, token }).pipe(
    Effect.flatMap((value) => pass(value, { status: 201 })),
    Effect.orDie
  );

const roomCodeOf = HttpRouter.schemaPathParams(CodePath).pipe(
  Effect.map(({ code }) => Schema.decodeOption(RoomCodeSchema)(code))
);

const decodeJsonText = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

const parsedOr =
  <A>(parse: (input: string | Schema.Json) => Option.Option<A>) =>
  (input: string | Schema.Json): Result.Result<A, BodyRefusal> =>
    Option.match(parse(input), {
      onNone: () => Result.fail<BodyRefusal>("BadRequest"),
      onSome: (value) => Result.succeed(value),
    });

const jsonBody = bodyWithin(MAX_BODY_BYTES).pipe(
  Effect.map(Result.flatMap(parsedOr(decodeJsonText)))
);

const voiceBody = bodyWithin(MAX_VOICE_BODY_BYTES).pipe(
  Effect.map(
    Result.flatMap(
      parsedOr(
        Schema.decodeUnknownOption(Schema.fromJsonString(VoiceRequestSchema))
      )
    )
  )
);

const keyIn = (rooms: RoomNamespace, code: RoomCode) =>
  roomKeyOf(rooms.idFromName(code).toString());

export const roomRoutes = <R>(
  rooms: RoomNamespace,
  options: RoomRoutesOptions<R>
) =>
  Effect.gen(function* buildRoomRoutes() {
    const entropy = yield* Entropy.pipe(Effect.provide(options.entropy));

    const { guarded, limited, record } = routeGuards(options);

    const unavailable = (failure: RoomCallFailed) =>
      record([measure("ServerFault", { fault: "RoomCallFailed" })]).pipe(
        Effect.andThen(logged(failure)),
        Effect.andThen(refuse("RoomUnavailable"))
      );

    const drawCode = entropy
      .bytes(CODE_DRAW_BYTES)
      .pipe(Effect.map(codeFromBytes), Effect.flatMap(Effect.fromOption));

    const createRoom = Effect.gen(function* createRoom() {
      const body = yield* jsonBody;

      if (Result.isFailure(body)) {
        return yield* refuse(body.failure);
      }

      const device = yield* deviceOf;

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const code = yield* drawCode.pipe(Effect.eventually);

        const outcome = yield* callRoom(
          keyIn(rooms, code),
          "open",
          rooms
            .getByName(code)
            .open({ code, request: body.success, ...withDevice(device) })
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

      if (Result.isFailure(body)) {
        return yield* refuse(body.failure);
      }

      const device = yield* deviceOf;

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "join",
        rooms
          .getByName(code.value)
          .join({ request: body.success, ...withDevice(device) })
          .pipe(Effect.flatMap(decodeJoinOutcome))
      );

      return yield* JoinOutcomeSchema.match(outcome, {
        Faulted: () => refuse("ServerFault"),
        Invalid: () => refuse("BadRequest"),
        Joined: ({ player, token }) => created(code.value, player, token),
        Knocking: ({ knock, player, token }) =>
          knocking(code.value, player, token, knock),
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
          Result.flatMap(
            parsedOr(Schema.decodeUnknownOption(StandingsRequestSchema))
          )
        )
      );

      if (Result.isFailure(body)) {
        return yield* refuse(body.failure);
      }

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "standings",
        rooms
          .getByName(code.value)
          .standings(encodeStandingsRequest(body.success))
          .pipe(Effect.flatMap(decodeStandingsOutcome))
      );

      return yield* StandingsOutcomeSchema.match(outcome, {
        Halted: ({ view }) => standingsBody({ view }).pipe(Effect.orDie),
        Invalid: () => refuse("BadRequest"),
        Knocking: ({ view }) => knockBody({ knock: view }).pipe(Effect.orDie),
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

    const askVoice = Effect.gen(function* askVoice() {
      const code = yield* roomCodeOf.pipe(Effect.orDie);

      if (Option.isNone(code)) {
        return yield* refuse("NotFound");
      }

      const body = yield* voiceBody;

      if (Result.isFailure(body)) {
        return yield* refuse(body.failure);
      }

      const outcome = yield* callRoom(
        keyIn(rooms, code.value),
        "voice",
        rooms
          .getByName(code.value)
          .voice(encodeVoiceRequest(body.success))
          .pipe(Effect.flatMap(decodeVoiceOutcome))
      );

      return yield* VoiceOutcomeSchema.match(outcome, {
        Invalid: () => refuse("BadRequest"),
        NotAuthorized: () => refuse("NotAuthorized"),
        NotFound: () => refuse("NotFound"),
        Refused: ({ refusal }) =>
          voiceRefusalBody(
            { refusal },
            { status: VOICE_REFUSAL_STATUS[refusal] }
          ).pipe(Effect.orDie),
        Replied: ({ reply }) =>
          Effect.succeed(HttpServerResponse.jsonUnsafe(reply)),
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

      if (Result.isFailure(received)) {
        return yield* refuse(received.failure);
      }

      yield* record([reportMeasure(received.success)]);

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
        "POST",
        VOICE_ROUTE,
        guarded(
          `POST ${VOICE_ROUTE}`,
          limited("connect", tooManyRequests, askVoice)
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
