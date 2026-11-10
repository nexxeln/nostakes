import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as State from "alchemy/State";
import { Effect } from "effect";

import RoomWorker from "../src/worker.js";

export default Alchemy.Stack(
  "RoomServerLocal",
  { providers: Cloudflare.providers(), state: State.inMemoryState() },
  Effect.gen(function* localStack() {
    const worker = yield* RoomWorker;

    return { url: worker.url };
  })
);
