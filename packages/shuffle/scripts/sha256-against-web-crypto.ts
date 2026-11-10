import { sha256 } from "@nostakes/shuffle";
import { Console, Effect, Random, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

const samples = 100_000;

const longestMessage = 4096;

class DigestDiffers extends Schema.TaggedError<
  DigestDiffers,
  { readonly brand: unique symbol }
>()("DigestDiffers", {
  expected: Schema.String,
  got: Schema.String,
  input: Schema.String,
}) {
  override get message() {
    return `The in-repo sha256 gave ${this.got} where Web Crypto gave ${this.expected} for the message ${this.input}. Fix src/sha256.ts before any commitment built on it is trusted.`;
  }
}

const randomMessage = Effect.gen(function* randomMessage() {
  const length = yield* Random.nextIntBetween(0, longestMessage);

  return globalThis.crypto.getRandomValues(new Uint8Array(length));
});

const compareOne = Effect.gen(function* compareOne() {
  const message = yield* randomMessage;

  const expected = yield* Effect.promise(() =>
    globalThis.crypto.subtle.digest("SHA-256", message)
  ).pipe(Effect.map((digest) => Hex.encode(new Uint8Array(digest))));

  const got = Hex.encode(sha256(message));

  if (got !== expected) {
    return yield* new DigestDiffers({
      expected,
      got,
      input: Hex.encode(message),
    });
  }

  return message.length;
});

const program = Effect.gen(function* program() {
  let bytes = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    bytes += yield* compareOne;
  }

  yield* Console.log(
    `sha256 matched Web Crypto on ${samples} random messages of 0 to ${longestMessage} bytes, ${bytes} bytes in all`
  );
});

await Effect.runPromise(program);
