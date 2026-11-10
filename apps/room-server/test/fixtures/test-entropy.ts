import type * as cf from "@cloudflare/workers-types";
import { Effect, Layer, Option, Schema } from "effect";

import { Entropy } from "../../src/entropy.js";

const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

export const DEAL_SEED = 7;

export const seededBytes = (seed: number, call: number, size: number) => {
  let state = ((seed * 7919 + call * 104_729) % (MODULUS - 1)) + 1;

  return Uint8Array.from({ length: size }, () => {
    state = (state * MULTIPLIER) % MODULUS;

    return state % 256;
  });
};

export const seededEntropy = (seed: number) =>
  Layer.effect(
    Entropy,
    Effect.sync(() => {
      let calls = 0;

      return {
        bytes: (size: number) =>
          Effect.sync(() => {
            calls += 1;

            return seededBytes(seed, calls, size);
          }),
      };
    })
  );

export const scriptedEntropy = () => {
  const queue: Uint8Array[] = [];

  return {
    enqueue: (bytes: Uint8Array) => {
      queue.push(bytes);
    },
    layer: Layer.succeed(Entropy, {
      bytes: (size: number) =>
        Effect.sync(
          () => queue.shift() ?? crypto.getRandomValues(new Uint8Array(size))
        ),
    }),
  };
};

const ENTROPY_CALLS = "test-entropy-calls";

const decodeCalls = Schema.decodeUnknownOption(Schema.Int);

const seedOfName = (name: string) => {
  let seed = 0;

  for (const letter of name) {
    seed = (seed * 31 + (letter.codePointAt(0) ?? 0)) % (MODULUS - 1);
  }

  return seed;
};

export const persistedSeededEntropy = (
  seed: number,
  state: cf.DurableObjectState
) =>
  Layer.succeed(Entropy, {
    bytes: (size: number) =>
      Effect.sync(() => {
        const calls =
          Option.getOrElse(
            decodeCalls(state.storage.kv.get(ENTROPY_CALLS)),
            () => 0
          ) + 1;

        state.storage.kv.put(ENTROPY_CALLS, calls);

        return seededBytes(
          seed + seedOfName(state.id.name ?? state.id.toString()),
          calls,
          size
        );
      }),
  });
