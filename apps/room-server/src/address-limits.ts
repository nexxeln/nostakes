import * as Cloudflare from "@alchemy.run/cloudflare";
import { Stage } from "alchemy";
import { Effect, Schema } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

export type LimitedAction = "connect" | "create" | "join";

export interface AddressLimit {
  readonly limit: number;
  readonly period: 10 | 60;
}

export const ADDRESS_LIMITS = {
  connect: { limit: 120, period: 60 },
  create: { limit: 10, period: 60 },
  join: { limit: 30, period: 60 },
} as const satisfies Record<LimitedAction, AddressLimit>;

const PRODUCTION_NAMESPACES = {
  connect: 7_116_003,
  create: 7_116_001,
  join: 7_116_002,
} as const satisfies Record<LimitedAction, number>;

const PREVIEW_NAMESPACES = {
  connect: 7_116_103,
  create: 7_116_101,
  join: 7_116_102,
} as const satisfies Record<LimitedAction, number>;

export const limitNamespaces = (stage: string) =>
  stage === "production" ? PRODUCTION_NAMESPACES : PREVIEW_NAMESPACES;

export interface AddressLimits<R = never> {
  readonly allow: (
    action: LimitedAction,
    address: string
  ) => Effect.Effect<boolean, never, R>;
}

export const unlimited: AddressLimits = {
  allow: () => Effect.succeed(true),
};

export const UNKNOWN_ADDRESS = "unknown";

export const addressOf = HttpServerRequest.HttpServerRequest.pipe(
  Effect.map(
    (request) => request.headers["cf-connecting-ip"] ?? UNKNOWN_ADDRESS
  )
);

export const RETRY_AFTER_SECONDS = 60;

export const TooManyRequestsSchema = Schema.Struct({
  retryAfterSeconds: Schema.Int,
});

export const tooManyRequests = HttpServerResponse.schemaJson(
  TooManyRequestsSchema
)(
  { retryAfterSeconds: RETRY_AFTER_SECONDS },
  { headers: { "retry-after": String(RETRY_AFTER_SECONDS) }, status: 429 }
).pipe(Effect.orDie);

export const cloudflareAddressLimits = Effect.gen(
  function* cloudflareAddressLimits() {
    const namespaces = limitNamespaces(yield* Stage);

    const connect = yield* Cloudflare.RateLimit("CONNECT_PER_ADDRESS", {
      namespaceId: namespaces.connect,
      simple: ADDRESS_LIMITS.connect,
    });

    const create = yield* Cloudflare.RateLimit("CREATE_PER_ADDRESS", {
      namespaceId: namespaces.create,
      simple: ADDRESS_LIMITS.create,
    });

    const join = yield* Cloudflare.RateLimit("JOIN_PER_ADDRESS", {
      namespaceId: namespaces.join,
      simple: ADDRESS_LIMITS.join,
    });

    const bindings = { connect, create, join };

    const limits: AddressLimits<
      Effect.Services<ReturnType<typeof create.limit>>
    > = {
      allow: (action, address) =>
        bindings[action].limit({ key: address }).pipe(
          Effect.map(({ success }) => success),
          Effect.tapError((failure) =>
            Effect.logWarning(
              "the rate limiter failed, so the request passes",
              {
                action,
                failure: failure.message,
              }
            )
          ),
          Effect.orElseSucceed(() => true)
        ),
    };

    return limits;
  }
);
