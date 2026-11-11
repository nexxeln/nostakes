import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { COMMANDS_PER_SECOND } from "@nostakes/protocol";
import { Array as Arr, Console, Effect, Order, pipe } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  codec,
  command,
  isEvents,
  joinAs,
  keepAlive,
  openRoomWith,
  replyTo,
} from "../test/fixtures/room-client.js";
import type { RoomClient } from "../test/fixtures/room-client.js";
import { RoundTripFailed } from "../test/fixtures/round-trip-failed.js";
import { ToyStack } from "../test/fixtures/stack.js";
import { ToyMemberCommandSchema } from "../test/fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_round_trip_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const MESSAGES = 1000;

const PLAYERS = 4;

const SPACING_MS = Math.ceil(1000 / (COMMANDS_PER_SECOND * PLAYERS));

const percentile = (sorted: readonly number[], fraction: number) =>
  sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ] ?? Number.NaN;

const arrivalOf = (client: RoomClient, seq: number) =>
  client
    .next(
      `events ${seq}`,
      (message): message is typeof codec.server.cases.Events.Type =>
        isEvents(message) && message.to === seq
    )
    .pipe(
      Effect.map(
        (found) => client.arrivals[client.messages.indexOf(found)] ?? Number.NaN
      )
    );

const round = (value: number) => Math.round(value * 100) / 100;

const summary = (samples: readonly number[]) => {
  const sorted = Arr.sort(samples, Order.Number);

  return {
    max: round(sorted.at(-1) ?? Number.NaN),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
  };
};

test(
  "round trip: 1,000 messages, each from one of four players to the other three, every player within the command rate",
  Effect.gen(function* roundTrip() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const passes = yield* openRoomWith(base, ["Dee", "Ana", "Ben", "Cy"]);

    const clients = yield* pipe(
      passes,
      Effect.forEach((pass, index) =>
        joinAs(base, pass, `client ${index}`).pipe(
          Effect.map(({ client }) => client)
        )
      )
    );

    for (const client of clients) {
      yield* keepAlive(client);
    }

    yield* Effect.fromNullishOr(
      clients.length === PLAYERS ? clients : undefined
    ).pipe(
      Effect.mapError(
        () => new RoundTripFailed({ round: 0, step: "connect four sockets" })
      )
    );

    const fanOut: number[] = [];
    const ownReply: number[] = [];

    for (let index = 0; index < MESSAGES; index += 1) {
      const id = `rt-${index}`;
      const sentAt = performance.now();

      const from = yield* Effect.fromNullishOr(clients[index % PLAYERS]).pipe(
        Effect.mapError(
          () => new RoundTripFailed({ round: index, step: "pick a sender" })
        )
      );

      const receivers = clients.filter((client) => client !== from);

      yield* from.send(
        command(id, ToyMemberCommandSchema.cases.Increment.make({ times: 1 }))
      );

      const reply = yield* from.next(`reply ${id}`, replyTo(id)).pipe(
        Effect.catchTag("ClientFailed", () =>
          from.closed.pipe(
            Effect.flatMap(
              (closed) =>
                new RoundTripFailed({
                  round: index,
                  step: `reply, socket ${JSON.stringify(closed)}, last ${from.frames.at(-1) ?? "nothing"}`,
                })
            )
          )
        )
      );

      const { result } = reply;

      const seq = yield* codec.reply.guards.Accepted(result)
        ? Effect.succeed(result.seq)
        : new RoundTripFailed({ round: index, step: "reply" });

      const arrivals = yield* pipe(
        receivers,
        Effect.forEach((client) => arrivalOf(client, seq))
      );

      ownReply.push(
        (from.arrivals[from.messages.indexOf(reply)] ?? Number.NaN) - sentAt
      );
      fanOut.push(Math.max(...arrivals) - sentAt);

      yield* Effect.sleep(`${SPACING_MS} millis`);
    }

    yield* Console.log(
      JSON.stringify({
        allThreeReceiversMs: summary(fanOut),
        messages: MESSAGES,
        senderReplyMs: summary(ownReply),
        spacingMs: SPACING_MS,
      })
    );
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  { timeout: 300_000 }
);
