import type { RpcCallError } from "@alchemy.run/cloudflare";
import { Effect, Layer, Option, Result, Schema } from "effect";
import type { Redacted } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { tooManyRequests } from "./address-limits.js";
import { FEEDBACK_BOX_NAME } from "./feedback-box.js";
import {
  FeedbackPageSchema,
  holdsSecret,
  noteFrom,
  readFrom,
} from "./feedback.js";
import type { FeedbackNoteSchema, FeedbackReadSchema } from "./feedback.js";
import { measure } from "./measures.js";
import { refuse } from "./room-object.js";
import { routeGuards } from "./route-guards.js";
import type { RouteGuardOptions } from "./route-guards.js";

export const FEEDBACK_ROUTE = "/rooms/feedback";

export const FEEDBACK_READ_ROUTE = "/rooms/feedback/read";

export interface FeedbackStub {
  readonly keep: (
    input: typeof FeedbackNoteSchema.Encoded
  ) => Effect.Effect<boolean, RpcCallError>;
  readonly read: (
    input: typeof FeedbackReadSchema.Encoded
  ) => Effect.Effect<typeof FeedbackPageSchema.Encoded, RpcCallError>;
}

export interface FeedbackNamespace {
  readonly getByName: (name: string) => FeedbackStub;
}

export interface FeedbackRoutesOptions<R> extends RouteGuardOptions<R> {
  readonly secret: Option.Option<Redacted.Redacted>;
}

export const FEEDBACK_BOX_FAILED =
  "The feedback box failed a call, so the sender was answered RoomUnavailable and may try again.";

const pageBody = HttpServerResponse.schemaJson(FeedbackPageSchema);

const decodePage = Schema.decodeEffect(FeedbackPageSchema);

export const feedbackRoutes = <R>(
  box: FeedbackNamespace,
  options: FeedbackRoutesOptions<R>
) => {
  const { faultCaught, guarded, limited, record } = routeGuards(options);

  const unavailable = record([
    measure("ServerFault", { fault: "FeedbackBoxFailed" }),
  ]).pipe(
    Effect.andThen(Effect.logError(FEEDBACK_BOX_FAILED)),
    Effect.andThen(refuse("RoomUnavailable"))
  );

  const send = Effect.gen(function* sendFeedback() {
    const received = yield* noteFrom;

    if (Result.isFailure(received)) {
      return yield* refuse(received.failure);
    }

    const kept = yield* box
      .getByName(FEEDBACK_BOX_NAME)
      .keep(received.success)
      .pipe(Effect.option);

    if (Option.isNone(kept)) {
      return yield* unavailable;
    }

    if (!kept.value) {
      return yield* refuse("BadRequest");
    }

    yield* record([
      measure("FeedbackSent", { screen: received.success.screen }),
    ]);

    return HttpServerResponse.empty({ status: 204 });
  });

  const read = Effect.gen(function* readFeedback() {
    const request = yield* HttpServerRequest.HttpServerRequest;

    if (!(yield* holdsSecret(request.headers.authorization, options.secret))) {
      return yield* refuse("NotAuthorized");
    }

    const asked = yield* readFrom;

    if (Result.isFailure(asked)) {
      return yield* refuse(asked.failure);
    }

    const page = yield* box
      .getByName(FEEDBACK_BOX_NAME)
      .read(asked.success)
      .pipe(Effect.flatMap(decodePage), Effect.option);

    if (Option.isNone(page)) {
      return yield* unavailable;
    }

    return yield* pageBody(page.value).pipe(Effect.orDie);
  });

  return Layer.mergeAll(
    HttpRouter.add(
      "POST",
      FEEDBACK_ROUTE,
      guarded(
        `POST ${FEEDBACK_ROUTE}`,
        limited("connect", tooManyRequests, send)
      )
    ),
    HttpRouter.add(
      "POST",
      FEEDBACK_READ_ROUTE,
      faultCaught(
        `POST ${FEEDBACK_READ_ROUTE}`,
        limited("connect", tooManyRequests, read)
      )
    )
  );
};
