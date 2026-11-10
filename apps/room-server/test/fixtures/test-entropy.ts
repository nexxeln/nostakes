import { Effect, Layer } from "effect";

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
