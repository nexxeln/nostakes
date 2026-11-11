import { Effect, Schema } from "effect";

import { drawPicture } from "./picture-draw.js";
import { PictureRequestSchema } from "./picture-wire.js";

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  Effect.runFork(
    Schema.decodeUnknownEffect(PictureRequestSchema)(event.data).pipe(
      Effect.match({
        onFailure: () => {
          globalThis.postMessage(null, { transfer: [] });
        },
        onSuccess: (request) => {
          globalThis.postMessage(drawPicture(request), { transfer: [] });
        },
      })
    )
  );
});
