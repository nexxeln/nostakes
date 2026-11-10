import { Context, Effect, Layer } from "effect";

export class Entropy extends Context.Service<
  Entropy,
  { readonly bytes: (size: number) => Effect.Effect<Uint8Array> }
>()("@nostakes/room-server/Entropy") {}

export const liveEntropy = Layer.succeed(Entropy, {
  bytes: (size) =>
    Effect.sync(() => crypto.getRandomValues(new Uint8Array(size))),
});
