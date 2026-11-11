import { Effect, Schema } from "effect";

import type { ClipStyle } from "../../features/moments/clip-style.js";
import type { Mix } from "../../features/moments/film.js";
import { SOUND_RATE } from "../../features/moments/sound/dsp.js";
import type { ScoreSheet } from "../../features/moments/sound/sheet.js";
import { failedAt } from "./clip-layers.js";
import type { ClipUnavailable } from "./clip-layers.js";
import { closedPolitely } from "./worker-close.js";

const MixedSchema = Schema.Union([
  Schema.Struct({
    left: Schema.instanceOf(Float32Array),
    right: Schema.instanceOf(Float32Array),
    tag: Schema.Literal("Mixed"),
  }),
  Schema.Struct({ detail: Schema.String, tag: Schema.Literal("Failed") }),
]);

const owned = (samples: Float32Array): Float32Array<ArrayBuffer> => {
  const copy = new Float32Array(samples.length);

  copy.set(samples);

  return copy;
};

export const mixedOffThread = (
  sheet: ScoreSheet,
  style: ClipStyle = "Broadcast"
): Effect.Effect<Mix, ClipUnavailable> =>
  Effect.acquireRelease(
    Effect.try({
      catch: failedAt("start the sound worker"),
      try: () =>
        new Worker(new URL("sound-worker.ts", import.meta.url), {
          name: "nostakes-clip-sound",
          type: "module",
        }),
    }),
    closedPolitely
  ).pipe(
    Effect.flatMap((worker) =>
      Effect.callback<unknown, ClipUnavailable>((resume) => {
        const heard = (event: MessageEvent<unknown>) => {
          resume(Effect.succeed(event.data));
        };

        const broke = (event: ErrorEvent) => {
          resume(Effect.fail(failedAt("mix the sound")(event.message)));
        };

        worker.addEventListener("message", heard, { once: true });
        worker.addEventListener("error", broke, { once: true });
        worker.postMessage({ sheet, style }, { transfer: [] });

        return Effect.sync(() => {
          worker.removeEventListener("message", heard);
          worker.removeEventListener("error", broke);
        });
      })
    ),
    Effect.flatMap((reply) =>
      Schema.decodeUnknownEffect(MixedSchema)(reply).pipe(
        Effect.mapError(failedAt("read the sound worker's reply"))
      )
    ),
    Effect.flatMap((reply) =>
      reply.tag === "Mixed"
        ? Effect.succeed({
            channels: [owned(reply.left), owned(reply.right)],
            sampleRate: SOUND_RATE,
          })
        : Effect.fail(failedAt("mix the sound")(reply.detail))
    ),
    Effect.scoped
  );
