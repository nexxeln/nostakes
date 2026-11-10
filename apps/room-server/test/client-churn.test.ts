import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import type { ReplyResult } from "@nostakes/client";
import type { RoomCode } from "@nostakes/protocol";
import { Effect, Fiber, Option, Schema, pipe } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  appliedSeqs,
  Commands,
  playerFor,
  skipped,
  toyClientCodec,
  until,
  untilLive,
} from "./client-harness.js";
import type { Player, ToyClientTypes } from "./client-harness.js";
import { openRoomWith } from "./fixtures/room-client.js";
import { inspect, restart, ToyStack } from "./fixtures/stack.js";
import { ToyEventSchema } from "./fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_client_churn_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const baseUrl = deployed.pipe(
  Effect.flatMap(({ url }) => Effect.fromNullishOr(url)),
  Effect.orDie
);

const COMMANDS_PER_CLIENT = 60;

const decodeEvent = Schema.decodeUnknownSync(
  Schema.fromJsonString(ToyEventSchema)
);

const incrementsBy = (events: readonly string[]) => {
  const counts = new Map<string, number>();

  for (const event of events.map((text) => decodeEvent(text))) {
    if (ToyEventSchema.guards.Incremented(event)) {
      counts.set(event.by, (counts.get(event.by) ?? 0) + 1);
    }
  }

  return counts;
};

const threePlayers = (base: string) =>
  Effect.gen(function* openThreePlayers() {
    const passes = yield* openRoomWith(base, ["Ana", "Ben", "Cy"]);

    const players = yield* pipe(
      passes,
      Effect.forEach((pass, index) => playerFor(base, pass, `sender ${index}`))
    );

    for (const player of players) {
      yield* player.client.start;
      yield* untilLive(player);
    }

    const code: RoomCode | undefined = passes[0]?.code;

    return { code, players };
  });

const sendAll = (player: Player) =>
  Effect.all(
    Array.from({ length: COMMANDS_PER_CLIENT }, () =>
      player.client.send(Commands.Increment.make({ times: 1 }))
    ),
    { concurrency: "unbounded" }
  );

const exactlyOnce = (
  base: string,
  code: RoomCode,
  players: readonly Player[],
  start: number,
  replies: readonly (readonly ReplyResult<ToyClientTypes>[])[]
) =>
  Effect.gen(function* checkExactlyOnce() {
    const stored = yield* inspect(base, code);
    const head = start + COMMANDS_PER_CLIENT * players.length;

    for (const player of players) {
      yield* until(player, ({ seq }) => Option.contains(seq, head));
    }

    const increments = incrementsBy(stored.events);

    expect(stored.headSeq).toBe(head);
    expect(stored.seqs).toEqual(
      Array.from({ length: head }, (_, index) => index + 1)
    );

    for (const [index, player] of players.entries()) {
      expect(appliedSeqs(player)).toEqual(
        Array.from({ length: head - start }, (_, offset) => start + offset + 1)
      );
      expect(skipped(player)).toEqual([]);
      expect(increments.get(player.pass.player)).toBe(COMMANDS_PER_CLIENT);
      expect(
        replies[index]?.every((reply) =>
          toyClientCodec.reply.guards.Accepted(reply)
        )
      ).toBe(true);
    }
  });

test(
  "2. kills from the client and the server while three clients send as fast as allowed: every event once and in order, every command once",
  Effect.gen(function* killsUnderLoad() {
    const base = yield* baseUrl;
    const { code, players } = yield* threePlayers(base);

    if (code === undefined) {
      return;
    }

    const start = (yield* inspect(base, code)).headSeq;

    const killer = yield* Effect.forkScoped(
      Effect.gen(function* killRepeatedly() {
        for (let round = 0; round < 12; round += 1) {
          yield* Effect.sleep("300 millis");

          const target = players[round % players.length];

          if (target !== undefined) {
            yield* round % 2 === 0
              ? target.wire.closeFromClient
              : target.wire.floodFromClient;
          }
        }
      })
    );

    const replies = yield* Effect.all(players.map(sendAll), {
      concurrency: "unbounded",
    }).pipe(Effect.timeout("60 seconds"), Effect.orDie);

    yield* Fiber.interrupt(killer);
    yield* exactlyOnce(base, code, players, start, replies);

    expect(
      players.reduce((opened, player) => opened + player.wire.opened(), 0)
    ).toBeGreaterThan(players.length + 4);
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  { timeout: 90_000 }
);

test(
  "3. the object restarts twice mid-stream: every event once and in order, every command once",
  Effect.gen(function* restartsUnderLoad() {
    const base = yield* baseUrl;
    const { code, players } = yield* threePlayers(base);

    if (code === undefined) {
      return;
    }

    const start = (yield* inspect(base, code)).headSeq;

    const restarts: number[] = [];

    const restarter = yield* Effect.forkScoped(
      Effect.gen(function* restartTwice() {
        for (const pause of ["700 millis", "900 millis"] as const) {
          yield* Effect.sleep(pause);
          yield* restart(base, code);
          restarts.push(restarts.length + 1);
        }
      })
    );

    const replies = yield* Effect.all(players.map(sendAll), {
      concurrency: "unbounded",
    }).pipe(Effect.timeout("60 seconds"), Effect.orDie);

    const restartedMidStream = restarts.length === 2;

    yield* Fiber.join(restarter);
    yield* exactlyOnce(base, code, players, start, replies);

    expect(restartedMidStream).toBe(true);

    for (const player of players) {
      expect(player.wire.opened()).toBeGreaterThanOrEqual(3);
    }
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  { timeout: 90_000 }
);
