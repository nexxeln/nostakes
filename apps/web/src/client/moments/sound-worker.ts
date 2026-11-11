import { Effect, Schema } from "effect";

import { CLIP_STYLES } from "../../features/moments/clip-style.js";
import { soundtrackOf } from "../../features/moments/sound/soundtrack.js";
import { isCloseRequest } from "./worker-close.js";

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
  style: Schema.Literals(CLIP_STYLES),
});

export type SoundRequest = typeof SoundRequestSchema.Type;

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isCloseRequest(event.data)) {
    globalThis.close();

    return;
  }

  Effect.runFork(
    Schema.decodeUnknownEffect(SoundRequestSchema)(event.data).pipe(
      Effect.map(({ sheet, style }) => soundtrackOf(sheet, style)),
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
