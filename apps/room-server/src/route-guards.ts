import { Effect, Schema } from "effect";
import type * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/http/HttpServerResponse";

import { addressOf } from "./address-limits.js";
import type { AddressLimits, LimitedAction } from "./address-limits.js";
import { recorder } from "./analytics.js";
import type { AnalyticsSink } from "./analytics.js";
import { measure, SITE_SCOPE } from "./measures.js";
import type { RoomCallFailed } from "./room-call-failed.js";
import { refuse } from "./room-object.js";
import { defectWhere, RouteFault } from "./route-fault.js";

export interface RouteGuardOptions<R> {
  readonly allowedOrigins: readonly string[];
  readonly limits: AddressLimits<R>;
  readonly analytics: AnalyticsSink<R>;
}

export type RouteHandler<R> = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | HttpRouter.RouteContext | R
>;

export const logged = (failure: RoomCallFailed | RouteFault) =>
  Effect.logError(failure.message).pipe(
    Effect.annotateLogs(
      Schema.is(RouteFault)(failure)
        ? { error: failure._tag }
        : { error: failure._tag, room: failure.room }
    )
  );

export const routeGuards = <R>(options: RouteGuardOptions<R>) => {
  const record = recorder(options.analytics, SITE_SCOPE);

  const fromAllowedOrigin = HttpServerRequest.HttpServerRequest.pipe(
    Effect.map((request) =>
      options.allowedOrigins.includes(request.headers.origin ?? "")
    )
  );

  const faultCaught = (route: string, handler: RouteHandler<R>) =>
    handler.pipe(
      Effect.catchDefect((defect) =>
        record([measure("ServerFault", { fault: "RouteFault" })]).pipe(
          Effect.andThen(
            logged(new RouteFault({ detail: defectWhere(defect), route }))
          ),
          Effect.andThen(refuse("ServerFault"))
        )
      )
    );

  const guarded = (route: string, handler: RouteHandler<R>) =>
    faultCaught(
      route,
      Effect.gen(function* checkOrigin() {
        if (!(yield* fromAllowedOrigin)) {
          return yield* refuse("BadOrigin");
        }

        return yield* handler;
      })
    );

  const limited = (
    action: LimitedAction,
    refusal: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      HttpServerRequest.HttpServerRequest
    >,
    handler: RouteHandler<R>
  ) =>
    Effect.gen(function* checkAddress() {
      const address = yield* addressOf;

      if (!(yield* options.limits.allow(action, address))) {
        yield* record([measure("RateLimited", { action })]);

        return yield* refusal;
      }

      return yield* handler;
    });

  return { faultCaught, guarded, limited, record };
};
