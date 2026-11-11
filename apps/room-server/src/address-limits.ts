import * as Cloudflare from "@alchemy.run/cloudflare";
import { TooManyRequestsSchema } from "@nostakes/protocol";
import { Stage } from "alchemy";
import { Array as Arr, Effect, Option } from "effect";
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

const HEXTETS = 8;

const NETWORK_HEXTETS = 4;

const HEXTET = /^[0-9a-f]{1,4}$/u;

const DOTTED_QUAD = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

const OCTET_LIMIT = 256;

const MAPPED_IPV4 = [0, 0, 0, 0, 0, 0xff_ff];

const octetsOf = (text: string): Option.Option<readonly number[]> =>
  DOTTED_QUAD.test(text)
    ? Option.some(text.split(".").map(Number)).pipe(
        Option.filter((octets) => octets.every((octet) => octet < OCTET_LIMIT))
      )
    : Option.none();

const groupsOf = (part: string): Option.Option<readonly number[]> => {
  if (part === "") {
    return Option.some([]);
  }

  const groups = part.split(":");
  const last = groups.at(-1) ?? "";
  const leading = groups.slice(0, -1);

  const tail = last.includes(".")
    ? octetsOf(last).pipe(
        Option.map(([a = 0, b = 0, c = 0, d = 0]) => [
          a * OCTET_LIMIT + b,
          c * OCTET_LIMIT + d,
        ])
      )
    : Option.some([last]).pipe(
        Option.filter(([group = ""]) => HEXTET.test(group)),
        Option.map(([group = ""]) => [Number.parseInt(group, 16)])
      );

  return leading.every((group) => HEXTET.test(group))
    ? tail.pipe(
        Option.map((ending) => [
          ...leading.map((group) => Number.parseInt(group, 16)),
          ...ending,
        ])
      )
    : Option.none();
};

const hextetsOf = (address: string): Option.Option<readonly number[]> => {
  const halves = address.toLowerCase().split("::");
  const [head = "", tail] = halves;

  if (halves.length > 2) {
    return Option.none();
  }

  return Option.all([groupsOf(head), groupsOf(tail ?? "")]).pipe(
    Option.flatMap(([left, right]) => {
      if (tail === undefined) {
        return left.length === HEXTETS ? Option.some(left) : Option.none();
      }

      const missing = HEXTETS - left.length - right.length;

      return missing > 0
        ? Option.some([...left, ...Arr.replicate(0, missing), ...right])
        : Option.none();
    })
  );
};

const mappedIpv4 = (hextets: readonly number[]) =>
  Option.some(hextets).pipe(
    Option.filter((all) =>
      MAPPED_IPV4.every((hextet, index) => all[index] === hextet)
    ),
    Option.map((all) =>
      all
        .slice(MAPPED_IPV4.length)
        .flatMap((hextet) => [
          Math.floor(hextet / OCTET_LIMIT),
          hextet % OCTET_LIMIT,
        ])
        .join(".")
    )
  );

export const limitKeyOf = (address: string) =>
  Option.match(hextetsOf(address), {
    onNone: () => address,
    onSome: (hextets) =>
      Option.getOrElse(
        mappedIpv4(hextets),
        () =>
          `${hextets
            .slice(0, NETWORK_HEXTETS)
            .map((hextet) => hextet.toString(16))
            .join(":")}::/64`
      ),
  });

export const addressOf = HttpServerRequest.HttpServerRequest.pipe(
  Effect.map((request) =>
    limitKeyOf(request.headers["cf-connecting-ip"] ?? UNKNOWN_ADDRESS)
  )
);

export const RETRY_AFTER_SECONDS = 60;

export const tooManyRequests = HttpServerResponse.schemaJson(
  TooManyRequestsSchema
)(
  { refusal: "TooManyRequests", retryAfterSeconds: RETRY_AFTER_SECONDS },
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
