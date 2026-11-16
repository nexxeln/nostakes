import { MAX_BODY_BYTES } from "@nostakes/protocol";
import { Effect, Option, Redacted, Result, Schema } from "effect";

import { FeedbackNoteSchema, FeedbackReadSchema } from "./feedback-wire.js";
import { bodyWithin } from "./request-body.js";
import type { BodyRefusal } from "./request-body.js";

const decodeNote = Schema.decodeUnknownOption(
  Schema.fromJsonString(FeedbackNoteSchema)
);

const decodeRead = Schema.decodeUnknownOption(
  Schema.fromJsonString(FeedbackReadSchema)
);

const parsed =
  <A>(decode: (text: string) => Option.Option<A>) =>
  (text: string): Result.Result<A, BodyRefusal> =>
    Option.match(decode(text), {
      onNone: () => Result.fail<BodyRefusal>("BadRequest"),
      onSome: (value) => Result.succeed(value),
    });

export const noteFrom = bodyWithin(MAX_BODY_BYTES).pipe(
  Effect.map(Result.flatMap(parsed(decodeNote)))
);

export const readFrom = bodyWithin(MAX_BODY_BYTES).pipe(
  Effect.map(Result.flatMap(parsed(decodeRead)))
);

const BEARER = /^Bearer (?<secret>\S{1,512})$/u;

const digestOf = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(Effect.map((digest) => new Uint8Array(digest)));

const sameDigest = (left: Uint8Array, right: Uint8Array) => {
  let difference = (left.length - right.length) ** 2;

  for (let index = 0; index < left.length; index += 1) {
    difference += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  }

  return difference === 0;
};

export const holdsSecret = (
  authorization: string | undefined,
  secret: Option.Option<Redacted.Redacted>
) =>
  Effect.gen(function* checkSecret() {
    const given = BEARER.exec(authorization ?? "")?.groups?.secret;

    if (given === undefined || Option.isNone(secret)) {
      return false;
    }

    const expected = Redacted.value(secret.value);

    if (expected.length === 0) {
      return false;
    }

    return sameDigest(yield* digestOf(given), yield* digestOf(expected));
  });
