import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as State from "alchemy/State";
import { ConfigProvider, Effect } from "effect";

import RoomWorker from "../../src/worker.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export const TEST_BUILD = "web-build-under-test";

export const ProductionStack = Alchemy.Stack(
  "RoomServerProduction",
  { providers: Cloudflare.providers(), state: State.inMemoryState() },
  Effect.gen(function* productionStack() {
    const worker = yield* RoomWorker;

    return { url: worker.url };
  }).pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        ALLOWED_ORIGINS: TEST_ORIGIN,
        WEB_BUILD: TEST_BUILD,
      })
    )
  )
);
