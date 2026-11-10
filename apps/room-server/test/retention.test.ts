import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { CLOSE_CODES } from "@nostakes/protocol";
import { Effect, Option } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { joinAs, openRoomWith, post } from "./fixtures/room-client.js";
import { BriefStack, inspect, restart } from "./fixtures/stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_retention_${process.pid}`,
});

const deployed = beforeAll(deploy(BriefStack));

afterAll(destroy(BriefStack));

test(
  "a room that goes its retention period without an event closes its sockets as NotFound, deletes its storage, and answers a later join with 404",
  Effect.gen(function* forgottenRoom() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const [anaPass] = yield* openRoomWith(base, ["Ana", "Ben"]);
    const pass = yield* Effect.fromNullishOr(anaPass).pipe(Effect.orDie);
    const before = yield* inspect(base, pass.code);
    const { client: ana } = yield* joinAs(base, pass, "ana");

    const closing = yield* ana.waitClosed;
    const forgotten = yield* inspect(base, pass.code);

    yield* restart(base, pass.code);

    const reloaded = yield* inspect(base, pass.code);

    const late = yield* post(new URL(`/rooms/${pass.code}/members`, base), {
      avatar: "owl",
      name: "Cy",
    }).pipe(Effect.orDie);

    expect(before.code).toEqual(Option.some(pass.code));
    expect(before.members).toBe(2);
    expect(closing).toEqual({ code: CLOSE_CODES.NotFound, reason: "NotFound" });
    expect(forgotten.alarmRuns.at(-1)?.outcome).toBe("Forgotten");
    expect([reloaded.code, reloaded.members, reloaded.seqs]).toEqual([
      Option.none(),
      0,
      [],
    ]);
    expect(late.status).toBe(404);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 30_000 }
);
