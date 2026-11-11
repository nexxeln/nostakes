import { Effect, Schema } from "effect";

const CloseRequestSchema = Schema.Struct({ kind: Schema.Literal("Close") });

const CLOSE_REQUEST = { kind: "Close" } as const;

const CLOSE_GRACE = "20 seconds";

export const closedPolitely = (worker: Worker): Effect.Effect<void> =>
  Effect.sync(() => {
    worker.postMessage(CLOSE_REQUEST, { transfer: [] });
  }).pipe(
    Effect.andThen(
      Effect.forkDetach(
        Effect.sleep(CLOSE_GRACE).pipe(
          Effect.andThen(
            Effect.sync(() => {
              worker.terminate();
            })
          )
        )
      )
    ),
    Effect.asVoid
  );

export const isCloseRequest = Schema.is(CloseRequestSchema);
