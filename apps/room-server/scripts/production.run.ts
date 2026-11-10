import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as State from "alchemy/State";
import { Config, Effect, Layer } from "effect";

import SiteWorker, { siteStage } from "../src/site-worker.js";
import { siteOrigin } from "../src/site.js";

export const STATE_STORE = "nostakes-state";

const firstPlan = Config.Boolean("NOSTAKES_FIRST_PLAN").pipe(
  Config.withDefault(false)
);

const siteState = Layer.unwrap(
  Effect.gen(function* chooseState() {
    const dev = yield* Alchemy.ALCHEMY_DEV;
    const empty = yield* firstPlan;

    return dev || empty
      ? State.inMemoryState()
      : Cloudflare.state({ workerName: STATE_STORE });
  }).pipe(Effect.orDie)
);

export default Alchemy.Stack(
  "Nostakes",
  { providers: Cloudflare.providers(), state: siteState },
  Effect.gen(function* siteStack() {
    const stage = yield* siteStage;
    const site = yield* SiteWorker;

    return { origin: siteOrigin(stage), url: site.url };
  })
);
