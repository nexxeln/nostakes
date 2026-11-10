import type * as Test from "@alchemy.run/test/Vitest";
import { Effect } from "effect";

import ToyWorker from "./toy-worker.js";

export const deployToyWorker = (stack: Test.ScratchStack) =>
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy's ScratchStack erases provider errors, so the local deploy dies on failure.
  stack.deploy(ToyWorker).pipe(
    Effect.orDie,
    Effect.flatMap((worker) => Effect.fromNullishOr(worker.url)),
    Effect.orDie
  );
