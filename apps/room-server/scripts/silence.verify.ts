import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import {
  PING_INTERVAL_MS,
  PONG_FRAME,
  SOCKET_SILENCE_LIMIT_MS,
} from "@nostakes/protocol";
import { Console, Effect, Option, Schedule } from "effect";

import { harnessHttp } from "../test/fixtures/harness-http.js";
import {
  codec,
  isPresence,
  joinAs,
  keepAlive,
  openRoomWith,
} from "../test/fixtures/room-client.js";
import { SilenceUnnoticed } from "../test/fixtures/silence-unnoticed.js";
import { inspect, ToyStack } from "../test/fixtures/stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_silence_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

test(
  "4. silence: a socket that stops talking is closed as Unresponsive soon after the limit, a pinging one stays, and presence stops showing the quiet player",
  Effect.gen(function* silence() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const passes = yield* openRoomWith(base, ["Ana", "Ben"]);

    const passAt = (index: number) =>
      Effect.fromNullishOr(passes[index]).pipe(
        Effect.mapError(() => new SilenceUnnoticed({ step: "open the room" }))
      );

    const anaPass = yield* passAt(0);
    const benPass = yield* passAt(1);
    const ana = yield* joinAs(base, anaPass, "ana pings");
    const ben = yield* joinAs(base, benPass, "ben goes quiet");
    const quietFrom = performance.now();

    yield* keepAlive(ana.client);

    yield* Console.log(
      `waiting for the server to drop the quiet socket after ${SOCKET_SILENCE_LIMIT_MS} ms`
    );

    const dropped = yield* inspect(base, anaPass.code).pipe(
      Effect.repeat({
        schedule: Schedule.spaced("500 millis"),
        times: 240,
        until: (inspection) => inspection.sockets.live < 2,
      })
    );

    const droppedAfterMs = Math.round(performance.now() - quietFrom);

    yield* Effect.sleep("1 second");

    const report = {
      anaPongs: ana.client.frames.filter((text) => text === PONG_FRAME).length,
      anaSeesOnly: (
        ana.client.messages.findLast(isPresence)?.connected ?? []
      ).join(","),
      anaStillOpen: Option.isNone(yield* ana.client.closed),
      benClosing: ben.client.messages
        .filter(codec.server.guards.Closing)
        .map(({ reason }) => reason),
      droppedAfterMs,
      liveSockets: dropped.sockets.live,
    };

    yield* Console.log(JSON.stringify(report));

    const noticed =
      report.liveSockets === 1 &&
      report.anaStillOpen &&
      report.anaSeesOnly === anaPass.player &&
      report.benClosing.join(",") === "Unresponsive" &&
      report.anaPongs >= 4 &&
      droppedAfterMs >= SOCKET_SILENCE_LIMIT_MS &&
      droppedAfterMs < SOCKET_SILENCE_LIMIT_MS + PING_INTERVAL_MS;

    yield* noticed
      ? Effect.void
      : new SilenceUnnoticed({ step: JSON.stringify(report) });
  }).pipe(Effect.scoped, Effect.provide(harnessHttp)),
  { timeout: 180_000 }
);
