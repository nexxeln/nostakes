import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Activities, SILENCE_LIMIT_MS, WAKE_PROBE_MS } from "@nostakes/client";
import { Clock, Effect, Option, Redacted, pipe } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  appliedSeqs,
  Commands,
  playerFor,
  until,
  untilLive,
  wrongToken,
} from "./client-harness.js";
import type { Player } from "./client-harness.js";
import { openRoomWith } from "./fixtures/room-client.js";
import { inspect, ToyStack } from "./fixtures/stack.js";
import { ToyRedactedSchema } from "./fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_client_session_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const baseUrl = deployed.pipe(
  Effect.flatMap(({ url }) => Effect.fromNullishOr(url)),
  Effect.orDie
);

test(
  "1. a client connects, sees its view, sends commands, and gets replies",
  Effect.gen(function* connectAndSend() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined) {
      return;
    }

    const ana = yield* playerFor(base, anaPass, "ana");

    yield* ana.client.start;

    const welcomed = yield* untilLive(ana);

    const start = Option.getOrElse(
      welcomed.pipe(Option.flatMap(({ seq }) => seq)),
      () => 0
    );

    const replies = yield* Effect.all([
      ana.client.send(Commands.Increment.make({ times: 2 })),
      ana.client.send(Commands.Increment.make({ times: 3 })),
    ]);

    const state = yield* ana.client.state;
    const stored = yield* inspect(base, anaPass.code);

    expect(welcomed.pipe(Option.map(({ you }) => you))).toEqual(
      Option.some(Option.some(anaPass.player))
    );
    expect(replies.map((reply) => reply._tag)).toEqual([
      "Accepted",
      "Accepted",
    ]);
    expect(stored.headSeq).toBe(start + 5);
    expect(state.view.pipe(Option.map(({ count }) => count))).toEqual(
      Option.some(5)
    );
    expect(appliedSeqs(ana)).toEqual(
      Array.from({ length: 5 }, (_, index) => start + index + 1)
    );

    yield* ana.client.stop;
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))
);

test(
  "4. a reply lost with its socket: the command is resent, takes effect once, and the caller gets one reply",
  Effect.gen(function* lostReply() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const ana = yield* playerFor(base, anaPass, "ana");

    yield* ana.client.start;
    yield* untilLive(ana);

    const before = yield* inspect(base, anaPass.code);

    yield* ana.wire.loseNextReply;

    const issued = yield* ana.client.issue(
      Commands.Increment.make({ times: 1 })
    );

    const reply = yield* issued.reply;
    const after = yield* inspect(base, anaPass.code);

    const replyFrames = ana.wire
      .received()
      .filter((frame) => frame.includes(issued.id));

    expect(reply._tag).toBe("Accepted");
    expect(after.headSeq).toBe(before.headSeq + 1);
    expect(after.replies).toBe(before.replies + 1);
    expect(ana.wire.opened()).toBe(2);
    expect(replyFrames.length).toBe(2);
    expect(new Set(replyFrames).size).toBe(1);

    yield* ana.client.stop;
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))
);

test(
  "5. a wrong token ends in Refused after one connection attempt, with no retry loop",
  Effect.gen(function* wrongTokenRefused() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const impostor = yield* playerFor(
      base,
      { ...anaPass, token: wrongToken },
      "impostor"
    );

    yield* impostor.client.start;

    const refused = yield* until(
      impostor,
      ({ connection }) => connection === "Refused"
    );

    yield* Effect.sleep("3 seconds");

    const late = yield* Effect.flip(
      impostor.client.send(Commands.Increment.make({ times: 1 }))
    );

    expect(refused.pipe(Option.flatMap(({ refusal }) => refusal))).toEqual(
      Option.some("NotAuthorized")
    );
    expect(impostor.wire.opened()).toBe(1);
    expect(late._tag).toBe("ClientRefused");
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))
);

const isSecretDealt = ToyRedactedSchema.guards.SecretDealt;

const secretsOf = (player: Player) =>
  player.seen.flatMap((item) =>
    Activities.$is("Applied")(item) &&
    isSecretDealt(item.event) &&
    Option.isSome(item.event.secret)
      ? [
          {
            owner: item.event.to,
            round: item.event.round,
            secret: item.event.secret.value,
          },
        ]
      : []
  );

const roundReached = (player: Player, round: number) =>
  until(player, ({ view }) =>
    view.pipe(Option.exists((current) => current.round >= round))
  );

const dealBy = (dealer: Player, round: number, everyone: readonly Player[]) =>
  Effect.gen(function* deal() {
    yield* dealer.client.send(Commands.RequestDeal.make({}));

    for (const player of everyone) {
      yield* roundReached(player, round);
    }
  });

test(
  "6. no client ever receives another member's secret, through live batches, reconnects, or resume",
  Effect.gen(function* secrecy() {
    const base = yield* baseUrl;
    const passes = yield* openRoomWith(base, ["Ana", "Ben", "Cy", "Dee"]);

    const players = yield* pipe(
      passes,
      Effect.forEach((pass, index) => playerFor(base, pass, `member ${index}`))
    );

    const [ana, ben, cy, dee] = players;

    if (
      ana === undefined ||
      ben === undefined ||
      cy === undefined ||
      dee === undefined
    ) {
      return;
    }

    for (const player of players) {
      yield* player.client.start;
      yield* untilLive(player);
    }

    yield* dealBy(ana, 1, players);
    yield* cy.wire.closeFromClient;
    yield* dealBy(ben, 2, [ana, ben, dee]);
    yield* roundReached(cy, 2);
    yield* dee.wire.goSilent;
    yield* dee.client.wake;
    yield* dealBy(cy, 3, [ana, ben, cy]);
    yield* roundReached(dee, 3);

    const owned = players.flatMap(secretsOf);

    expect(
      new Set(owned.map(({ owner, round }) => `${owner}:${round}`)).size
    ).toBe(12);
    expect(cy.wire.opened()).toBe(2);
    expect(dee.wire.opened()).toBe(2);

    for (const player of players) {
      const text = player.wire.received().join("\n");

      expect(
        secretsOf(player).every(({ owner }) => owner === player.pass.player)
      ).toBe(true);
      expect(
        owned.filter(
          ({ owner, secret }) =>
            owner !== player.pass.player && text.includes(secret)
        )
      ).toEqual([]);

      for (const other of passes) {
        expect(text.includes(Redacted.value(other.token))).toBe(false);
      }

      yield* player.client.stop;
    }
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))
);

const WAKE_BOUND_MS = 4000;

test(
  "7. wake after a silent drop reconnects within 4 seconds, well before the 30 second silence limit",
  Effect.gen(function* wakeAfterSilentDrop() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const ana = yield* playerFor(base, anaPass, "ana");

    yield* ana.client.start;
    yield* untilLive(ana);
    yield* ana.wire.goSilent;

    const wokeAt = yield* Clock.currentTimeMillis;

    yield* ana.client.wake;
    yield* until(ana, ({ connection }) => connection === "Waiting");
    yield* untilLive(ana);

    const elapsed = (yield* Clock.currentTimeMillis) - wokeAt;
    const reply = yield* ana.client.send(Commands.Increment.make({ times: 1 }));

    expect(elapsed).toBeGreaterThanOrEqual(WAKE_PROBE_MS);
    expect(elapsed).toBeLessThan(WAKE_BOUND_MS);
    expect(WAKE_BOUND_MS).toBeLessThan(SILENCE_LIMIT_MS);
    expect(ana.wire.opened()).toBe(2);
    expect(reply._tag).toBe("Accepted");

    yield* ana.client.stop;
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))
);
