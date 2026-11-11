import { Effect, Schema } from "effect";

import { soundtrackOf } from "../../features/moments/sound/soundtrack.js";

const SMALL_SOUNDS = [
  "AllIn",
  "Bar",
  "Card",
  "Check",
  "Chips",
  "Fold",
  "Stamp",
] as const;

export const SoundRequestSchema = Schema.Struct({
  sheet: Schema.Struct({
    cues: Schema.Array(
      Schema.Struct({
        atMs: Schema.Finite,
        kind: Schema.Literals(SMALL_SOUNDS),
        pan: Schema.Finite,
      })
    ),
    hitMs: Schema.NullOr(Schema.Finite),
    lengthMs: Schema.Finite,
    outcome: Schema.Literals(["Loss", "Split", "Win"]),
    pauseMs: Schema.NullOr(Schema.Finite),
    resultMs: Schema.Finite,
    seed: Schema.Int,
    tagMs: Schema.Finite,
  }),
});

export type SoundRequest = typeof SoundRequestSchema.Type;

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  Effect.runFork(
    Schema.decodeUnknownEffect(SoundRequestSchema)(event.data).pipe(
      Effect.map(({ sheet }) => soundtrackOf(sheet)),
      Effect.match({
        onFailure: (failure) => {
          globalThis.postMessage(
            { detail: failure.message, tag: "Failed" },
            { transfer: [] }
          );
        },
        onSuccess: (mix) => {
          globalThis.postMessage(
            { left: mix.left, right: mix.right, tag: "Mixed" },
            { transfer: [mix.left.buffer, mix.right.buffer] }
          );
        },
      })
    )
  );
});
