import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { PING_FRAME } from "@nostakes/protocol";
import { Console, Effect } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { HibernationLost } from "../test/fixtures/hibernation-lost.js";
import type {
  codec,
  RoomClient,
  ToyServerMessage,
} from "../test/fixtures/room-client.js";
import {
  isSignal,
  joinAs,
  openRoomWith,
  signal,
} from "../test/fixtures/room-client.js";
import { inspect, ToyStack } from "../test/fixtures/stack.js";
import { ToySignalSchema } from "../test/fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_signal_wake_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const PING_EVERY = "5 seconds";

const PINGS_PER_IDLE = 6;

const wave = (count: number) =>
  signal(ToySignalSchema.cases.Wave.make({ count }));

const waveArrived =
  (count: number) =>
  (
    message: ToyServerMessage
  ): message is typeof codec.server.cases.Signal.Type =>
    isSignal(message) &&
    ToySignalSchema.guards.Wave(message.signal) &&
    message.signal.count === count;

const idle = (clients: readonly RoomClient[]) =>
  Effect.all(
    clients.map((client) =>
      client
        .sendText(PING_FRAME)
        .pipe(
          Effect.delay(PING_EVERY),
          Effect.repeat({ times: PINGS_PER_IDLE - 1 })
        )
    ),
    { concurrency: "unbounded" }
  );

const relayMs = (from: RoomClient, to: RoomClient, count: number) =>
  Effect.gen(function* timeRelay() {
    const sentAt = performance.now();

    yield* from.send(wave(count));
    yield* to.next(`wave ${count}`, waveArrived(count));

    return Math.round(performance.now() - sentAt);
  });

test(
  "signal wake: a reaction sent to a hibernated room wakes it once, reaches a hibernated socket, stores nothing, and the room hibernates again",
  Effect.gen(function* signalWake() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const passes = yield* openRoomWith(base, ["Ana", "Ben"]);
    const [anaPass, benPass] = passes;

    if (anaPass === undefined || benPass === undefined) {
      return yield* new HibernationLost({ step: "open the room" });
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const before = yield* inspect(base, anaPass.code);

    yield* Console.log(
      `idling with two sockets that ping every ${PING_EVERY}, then waving`
    );
    yield* idle([ana.client, ben.client]);

    const asleepMs = yield* relayMs(ana.client, ben.client, 1);
    const woken = yield* inspect(base, anaPass.code);
    const awakeMs = yield* relayMs(ana.client, ben.client, 2);

    yield* idle([ana.client, ben.client]);

    const after = yield* inspect(base, anaPass.code);

    const report = {
      awakeRelayMs: awakeMs,
      eventsStored: [before.headSeq, woken.headSeq, after.headSeq],
      hibernatedAgain: after.instance !== woken.instance,
      repliesStored: [before.replies, woken.replies, after.replies],
      sleepingRelayMs: asleepMs,
      wokeForTheWave: woken.instance !== before.instance,
    };

    yield* Console.log(JSON.stringify(report));

    const kept =
      report.wokeForTheWave &&
      report.hibernatedAgain &&
      new Set(report.eventsStored).size === 1 &&
      new Set(report.repliesStored).size === 1;

    return yield* kept
      ? Effect.void
      : new HibernationLost({ step: JSON.stringify(report) });
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 180_000 }
);
