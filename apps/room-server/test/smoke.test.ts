import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Effect } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { deployToyWorker } from "./fixtures/deploy.js";
import {
  command,
  createRoom,
  isEvents,
  joinAs,
  joinRoom,
  replyTo,
} from "./fixtures/room-client.js";
import { ToyMemberCommandSchema } from "./fixtures/toy-room.js";

const { test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_smoke_${process.pid}`,
});

test.provider(
  "smoke",
  (stack) =>
    Effect.gen(function* smoke() {
      const base = yield* deployToyWorker(stack);
      const anaPass = yield* createRoom(base, { avatar: "fox", name: "Ana" });

      const benPass = yield* joinRoom(base, anaPass.code, {
        avatar: "owl",
        name: "Ben",
      });

      const ana = yield* joinAs(base, anaPass, "ana");
      const ben = yield* joinAs(base, benPass, "ben");

      yield* Effect.logInfo(`welcome ${JSON.stringify(ana.welcome.view)}`);

      yield* ana.client.send(
        command("a1", ToyMemberCommandSchema.cases.Increment.make({ times: 2 }))
      );

      const reply = yield* ana.client.next("reply a1", replyTo("a1"));
      const seen = yield* ben.client.next("events", isEvents);

      expect(reply.result._tag).toBe("Accepted");
      expect(seen.events.length).toBe(2);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 120_000 }
);
