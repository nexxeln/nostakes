import { Effect, Option, Schema } from "effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as HttpServerRequest from "effect/http/HttpServerRequest";

export const DEVICE_HEADER = "x-nostakes-device";

export const DeviceIdSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{16,64}$/u)
);

export const DEVICE_HASH_LENGTH = 22;

export const DeviceHashSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{22}$/u)
);

export type DeviceHash = typeof DeviceHashSchema.Type;

const DEVICE_DOMAIN = "nostakes device ";

export const hashDevice = (id: string) =>
  Effect.promise(() =>
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${DEVICE_DOMAIN}${id}`)
    )
  ).pipe(
    Effect.map((digest) =>
      Base64Url.encode(new Uint8Array(digest)).slice(0, DEVICE_HASH_LENGTH)
    )
  );

export const deviceOf = HttpServerRequest.HttpServerRequest.pipe(
  Effect.map((request) =>
    Schema.decodeUnknownOption(DeviceIdSchema)(request.headers[DEVICE_HEADER])
  ),
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (id) => hashDevice(id).pipe(Effect.asSome),
    })
  )
);
