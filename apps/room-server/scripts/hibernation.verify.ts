import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { PING_FRAME, PONG_FRAME } from "@nostakes/protocol";
import { Console, Effect } from "effect";

import { harnessHttp } from "../test/fixtures/harness-http.js";
import { HibernationLost } from "../test/fixtures/hibernation-lost.js";
import {
  codec,
  command,
  isEvents,
  joinAs,
  openRoomWith,
  replyTo,
} from "../test/fixtures/room-client.js";
import { inspect, ToyStack } from "../test/fixtures/stack.js";
import {
  ToyMemberCommandSchema,
  ToyRedactedSchema,
} from "../test/fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_hibernation_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const PING_EVERY = "5 seconds";

const PINGS = 5;

const IDLE = "30 seconds";

test(
  "3. hibernation: a room whose only traffic is pings hibernates, the pings are answered, and its sockets keep their players and get the next commit",
  Effect.gen(function* hibernation() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const passes = yield* openRoomWith(base, ["Ana", "Ben"]);

    const passAt = (index: number) =>
      Effect.fromNullishOr(passes[index]).pipe(
        Effect.mapError(() => new HibernationLost({ step: "open the room" }))
      );

    const anaPass = yield* passAt(0);
    const benPass = yield* passAt(1);

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const before = yield* inspect(base, anaPass.code);

    yield* Console.log(
      `idling ${IDLE} with two sockets open, one sending a ping every ${PING_EVERY}`
    );
    yield* ana.client
      .sendText(PING_FRAME)
      .pipe(Effect.delay(PING_EVERY), Effect.repeat({ times: PINGS - 1 }));
    yield* Effect.sleep(PING_EVERY);

    yield* ana.client.send(
      command(
        "after-idle",
        ToyMemberCommandSchema.cases.Increment.make({ times: 1 })
      )
    );

    const reply = yield* ana.client.next(
      "reply after idle",
      replyTo("after-idle")
    );

    const seen = yield* ben.client.next("events after idle", isEvents);
    const after = yield* inspect(base, anaPass.code);
    const [event] = seen.events;

    const report = {
      answeredPings: ana.client.frames.filter((text) => text === PONG_FRAME)
        .length,
      instanceAfter: after.instance,
      instanceBefore: before.instance,
      liveSockets: after.sockets.live,
      replied: codec.reply.guards.Accepted(reply.result),
      seenBy:
        event !== undefined && ToyRedactedSchema.guards.Incremented(event)
          ? event.by
          : "nothing",
    };

    yield* Console.log(JSON.stringify(report));

    const kept =
      report.answeredPings === PINGS &&
      report.instanceAfter !== report.instanceBefore &&
      report.replied &&
      report.seenBy === anaPass.player &&
      report.liveSockets === 2;

    yield* kept
      ? Effect.void
      : new HibernationLost({ step: JSON.stringify(report) });
  }).pipe(Effect.provide(harnessHttp)),
  { timeout: 120_000 }
);
