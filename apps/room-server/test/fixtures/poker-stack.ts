import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as State from "alchemy/State";
import { Effect } from "effect";

import PokerTestWorker from "./poker-test-worker.js";

export const PokerStack = Alchemy.Stack(
  "RoomServerPokerTest",
  { providers: Cloudflare.providers(), state: State.inMemoryState() },
  Effect.gen(function* pokerStack() {
    const worker = yield* PokerTestWorker;

    return { url: worker.url };
  })
);
