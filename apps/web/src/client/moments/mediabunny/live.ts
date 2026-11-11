import { Effect } from "effect";

import { encodesAac, mediaLayer, nativeAac } from "./media.js";
import type { AacEncoding, SoundSpec } from "./media.js";

const registered = Effect.tryPromise(
  () => import("@mediabunny/aac-encoder")
).pipe(
  Effect.flatMap((extension) =>
    Effect.sync(() => {
      extension.registerAacEncoder();
    })
  ),
  Effect.as(true),
  Effect.orElseSucceed(() => false)
);

const nativeOrExtension = (spec: SoundSpec) =>
  nativeAac(spec).pipe(
    Effect.flatMap((native) =>
      native
        ? Effect.succeed<AacEncoding>("Native")
        : encodesAac(spec, registered)
    )
  );

export const liveMedia = mediaLayer(nativeOrExtension);

export const mediaWithoutNativeAac = mediaLayer((spec) =>
  encodesAac(spec, registered)
);
