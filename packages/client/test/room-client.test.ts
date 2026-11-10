import { describe, expect, it } from "@effect/vitest";
import {
  BuildIdSchema,
  FRAME_BURST,
  FRAMES_PER_SECOND,
  MAX_FRAME_BYTES,
  CommandIdSchema,
  PROTOCOL_VERSION,
} from "@nostakes/protocol";
import type { BuildId, CloseReason } from "@nostakes/protocol";
import { Clock, Effect, Option, pipe, Random, Schema, Stream } from "effect";
import * as TestClock from "effect/testing/TestClock";

import {
  Activities,
  ANSWER_LIMIT_MS,
  ClientRefused,
  CommandCancelled,
  CommandTooLarge,
  GREETING_TIMEOUT_MS,
  OVERDUE_GRACE_MS,
  PING_INTERVAL_MS,
  REPLY_LAST_RESORT_MS,
  roomClient,
  SILENCE_LIMIT_MS,
  WAKE_PROBE_MS,
} from "../src/index.js";
import type {
  Activity,
  IssuedCommand,
  RoomClient,
  RoomUpdate,
} from "../src/index.js";
import {
  fakeTransport,
  seq as seqOf,
  serverText,
  settle,
} from "./fixtures/fake-transport.js";
import type { FakeSocket, SentFrame } from "./fixtures/fake-transport.js";
import {
  ROOM_URL,
  TOKEN,
  toyCodec,
  ToyCommandSchema,
  ToyEventSchema,
  toySchemas,
} from "./fixtures/toy-room.js";
import type { ToyTypes } from "./fixtures/toy-room.js";

const Commands = ToyCommandSchema.cases;

const Sent = toyCodec.client.guards;

const jitterAt = (draw: number) =>
  Effect.provideService(Random.Random, {
    nextDoubleUnsafe: () => draw,
    nextIntUnsafe: () => 0,
  });

const lowestJitter = jitterAt(0);

const highestJitter = jitterAt(1 - Number.EPSILON);

const add = (amount: number) => Commands.Add.make({ amount });

const addedTotal = (total: number) =>
  ToyEventSchema.cases.Added.make({ amount: 1, total });

const strangerId = CommandIdSchema.make("stranger-1");

const cut = (open: FakeSocket) =>
  open.drop(1006, "").pipe(Effect.andThen(settle));

const advance = (millis: number) =>
  settle.pipe(
    Effect.andThen(TestClock.adjust(`${millis} millis`)),
    Effect.andThen(settle)
  );

const busyTable = (open: FakeSocket, firstSeq: number) => {
  let next = firstSeq;

  return (millis: number) =>
    Effect.suspend(() => {
      const seq = next;

      next += 1;

      return open.push(serverText.events(seq, [seq]));
    }).pipe(Effect.andThen(settle), Effect.andThen(advance(millis)));
};

const ANSWER_LAG_MS = ANSWER_LIMIT_MS - 500;

const UNANSWERED_AFTER_MS = ANSWER_LIMIT_MS + OVERDUE_GRACE_MS;

const COMMAND_UNHEARD_AFTER_MS = ANSWER_LIMIT_MS + UNANSWERED_AFTER_MS;

const PAGE_BUILD = BuildIdSchema.make("page-build-1");

const harnessFor = (build: Option.Option<BuildId>) =>
  Effect.gen(function* harness() {
    const fake = yield* fakeTransport;
    const seen: Activity<ToyTypes["Event"]>[] = [];
    const updates: RoomUpdate<ToyTypes>[] = [];

    const client: RoomClient<ToyTypes> = yield* roomClient(toySchemas, {
      token: TOKEN,
      url: ROOM_URL,
      ...Option.match(build, {
        onNone: () => ({}),
        onSome: (page) => ({ build: page }),
      }),
    }).pipe(Effect.provide(fake.layer));

    yield* client.activity.pipe(
      Stream.runForEach((item) => Effect.sync(() => seen.push(item))),
      Effect.forkScoped
    );

    yield* client.updates.pipe(
      Stream.runForEach((update) => Effect.sync(() => updates.push(update))),
      Effect.forkScoped
    );

    const socket = (index: number) =>
      Effect.sync(() => fake.sockets[index]).pipe(
        Effect.flatMap(Effect.fromNullishOr),
        Effect.orDie
      );

    const accept = (index: number) =>
      socket(index).pipe(
        Effect.tap((open) => open.accept),
        Effect.tap(settle)
      );

    const greet = (
      index: number,
      head: number,
      missed: readonly number[] = []
    ) =>
      accept(index).pipe(
        Effect.tap((open) => open.push(serverText.welcome(head, missed))),
        Effect.tap(settle)
      );

    const live = (head: number) =>
      client.start.pipe(Effect.andThen(settle), Effect.andThen(greet(0, head)));

    const liveWithStalledSends = (head: number) =>
      client.start.pipe(
        Effect.andThen(settle),
        Effect.andThen(socket(0)),
        Effect.tap((open) => open.stall),
        Effect.tap((open) => open.accept),
        Effect.tap(settle),
        Effect.tap((open) => open.push(serverText.welcome(head))),
        Effect.tap(settle)
      );

    const phase = client.state.pipe(Effect.map(({ connection }) => connection));

    return {
      accept,
      client,
      fake,
      greet,
      live,
      liveWithStalledSends,
      phase,
      seen,
      socket,
      updates,
    };
  });

const harness = harnessFor(Option.none());

const tagsSent = (socket: FakeSocket) =>
  socket.sent.map(({ message }) => message._tag);

const commandIds = (socket: FakeSocket) =>
  socket.sent.flatMap(({ message }) =>
    Sent.Command(message) ? [message.id] : []
  );

const helloAfter = (socket: FakeSocket) =>
  socket.sent.flatMap(({ message }) =>
    Sent.Hello(message) ? [message.after] : []
  );

const seqsOf = (seen: readonly Activity<ToyTypes["Event"]>[]) =>
  seen.flatMap((item) => (Activities.$is("Applied")(item) ? [item.seq] : []));

const serverAdmits = (frames: readonly SentFrame[]) => {
  let tokens = FRAME_BURST * 1000;
  let last = frames[0]?.at ?? 0;

  return frames.every(({ at }) => {
    tokens = Math.min(
      FRAME_BURST * 1000,
      tokens + (at - last) * FRAMES_PER_SECOND
    );
    last = at;

    if (tokens < 1000) {
      return false;
    }

    tokens -= 1000;

    return true;
  });
};

const reconnectDelays = (failuresInARow: number) =>
  Effect.gen(function* measureReconnectDelays() {
    const { client, fake, greet, socket } = yield* harness;
    const delays: number[] = [];

    const measure = Effect.gen(function* measureOneDelay() {
      const before = fake.sockets.length;
      const cutAt = yield* Clock.currentTimeMillis;

      yield* cut(yield* socket(before - 1));

      while (fake.sockets.length === before) {
        yield* advance(125);
      }

      delays.push((yield* Clock.currentTimeMillis) - cutAt);
    });

    yield* client.start;
    yield* settle;

    for (let failure = 0; failure < failuresInARow; failure += 1) {
      yield* measure;
    }

    yield* greet(fake.sockets.length - 1, 1);
    yield* measure;

    return delays;
  });

describe("room client against a fake socket", () => {
  it.effect("connects, says hello, goes live, and gets a reply", () =>
    Effect.gen(function* liveRoundTrip() {
      const { client, live, socket } = yield* harness;

      yield* live(7);

      const open = yield* socket(0);
      const state = yield* client.state;

      expect(open.url).toBe(ROOM_URL);
      expect(state.connection).toBe("Live");
      expect(state.seq).toEqual(Option.some(7));
      expect(state.view).toEqual(Option.some({ total: 7 }));

      const issued = yield* client.issue(add(1));

      yield* settle;
      yield* open.push(serverText.reply(issued.id, 8));

      const reply = yield* issued.reply;

      expect(tagsSent(open)).toEqual(["Hello", "Command"]);
      expect(helloAfter(open)).toEqual([Option.none()]);
      expect(toyCodec.reply.guards.Accepted(reply)).toBe(true);
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "every hello carries the last applied sequence number as after",
    () =>
      Effect.gen(function* helloAfterLastApplied() {
        const { greet, live, socket } = yield* harness;

        yield* live(7);

        const first = yield* socket(0);

        yield* first.push(serverText.events(8, [8, 9]));
        yield* settle;
        yield* cut(first);
        yield* advance(250);

        const second = yield* greet(1, 9);

        yield* cut(second);
        yield* advance(250);

        const third = yield* socket(2);

        yield* third.accept;
        yield* settle;

        expect(helloAfter(first)).toEqual([Option.none()]);
        expect(helloAfter(second)).toEqual([Option.some(9)]);
        expect(helloAfter(third)).toEqual([Option.some(9)]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a batch from the future drops the socket and resumes from the last applied number",
    () =>
      Effect.gen(function* futureBatch() {
        const { client, live, phase, seen, socket } = yield* harness;

        yield* live(7);

        const first = yield* socket(0);

        yield* first.push(serverText.events(9, [9]));
        yield* settle;

        const state = yield* client.state;

        expect(state.connection).toBe("Waiting");
        expect(state.drop).toEqual(Option.some("Gap"));
        expect(state.seq).toEqual(Option.some(7));
        expect(state.view).toEqual(Option.some({ total: 7 }));
        expect(seen).toEqual([]);
        expect(first.released()).toBe(true);

        yield* advance(250);

        const second = yield* socket(1);

        yield* second.accept;
        yield* settle;

        expect(helloAfter(second)).toEqual([Option.some(7)]);
        expect(yield* phase).toBe("Greeting");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a batch from the past is ignored, and an overlapping one applies only its new events",
    () =>
      Effect.gen(function* pastBatch() {
        const { client, live, seen, socket } = yield* harness;

        yield* live(7);

        const open = yield* socket(0);

        yield* open.push(serverText.events(6, [6, 7]));
        yield* open.push(serverText.events(8, [8]));
        yield* open.push(serverText.events(8, [8]));
        yield* open.push(serverText.events(8, [8, 9]));
        yield* settle;

        const state = yield* client.state;

        expect(seqsOf(seen)).toEqual([8, 9]);
        expect(state.seq).toEqual(Option.some(9));
        expect(state.view).toEqual(Option.some({ total: 9 }));
        expect(state.connection).toBe("Live");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "each view arrives with the events that produced it and the sequence number it reflects, in the order the room applied them",
    () =>
      Effect.gen(function* updatesInOrder() {
        const { client, greet, socket, updates } = yield* harness;

        yield* client.start;
        yield* settle;

        const first = yield* greet(0, 7, [6, 7]);

        yield* first.push(serverText.events(8, [8, 9]));
        yield* first.push(serverText.events(8, [8]));
        yield* first.push(serverText.events(9, [9, 10]));
        yield* settle;
        yield* cut(first);
        yield* advance(250);
        yield* greet(1, 10);
        yield* advance(250);
        yield* cut(yield* socket(1));
        yield* advance(250);
        yield* (yield* socket(2)).accept;
        yield* (yield* socket(2)).push(serverText.skippedWelcome(11, 300));
        yield* settle;

        expect(updates).toEqual([
          {
            activity: [
              Activities.Applied({ event: addedTotal(6), seq: seqOf(6) }),
              Activities.Applied({ event: addedTotal(7), seq: seqOf(7) }),
            ],
            seq: seqOf(7),
            view: { total: 7 },
          },
          {
            activity: [
              Activities.Applied({ event: addedTotal(8), seq: seqOf(8) }),
              Activities.Applied({ event: addedTotal(9), seq: seqOf(9) }),
            ],
            seq: seqOf(9),
            view: { total: 9 },
          },
          {
            activity: [
              Activities.Applied({ event: addedTotal(10), seq: seqOf(10) }),
            ],
            seq: seqOf(10),
            view: { total: 10 },
          },
          { activity: [], seq: seqOf(10), view: { total: 10 } },
          {
            activity: [Activities.Skipped({ from: seqOf(11), to: seqOf(300) })],
            seq: seqOf(300),
            view: { total: 300 },
          },
        ]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "missed events on resume are applied in order, and a stretch the server cannot replay is reported as skipped",
    () =>
      Effect.gen(function* resumeActivity() {
        const { accept, greet, live, seen, socket } = yield* harness;

        yield* live(5);
        yield* cut(yield* socket(0));
        yield* advance(250);
        yield* cut(yield* greet(1, 8, [6, 7, 8]));
        yield* advance(250);
        yield* (yield* accept(2)).push(serverText.skippedWelcome(9, 300));
        yield* settle;

        expect(seen).toEqual([
          Activities.Applied({ event: addedTotal(6), seq: seqOf(6) }),
          Activities.Applied({ event: addedTotal(7), seq: seqOf(7) }),
          Activities.Applied({ event: addedTotal(8), seq: seqOf(8) }),
          Activities.Skipped({ from: seqOf(9), to: seqOf(300) }),
        ]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a welcome that starts past the next event the client expects is a gap: nothing is applied and the client reconnects",
    () =>
      Effect.gen(function* welcomeGap() {
        const { accept, client, fake, live, seen, socket } = yield* harness;

        yield* live(5);
        yield* cut(yield* socket(0));
        yield* advance(250);
        yield* (yield* accept(1)).push(serverText.skippedWelcome(8, 300));
        yield* settle;

        const state = yield* client.state;

        yield* advance(250);

        expect(state.drop).toEqual(Option.some("Gap"));
        expect(state.seq).toEqual(Option.some(seqOf(5)));
        expect(seen).toEqual([]);
        expect(fake.sockets.length).toBe(3);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "pending commands are resent once per reconnect, in order, with the same ids",
    () =>
      Effect.gen(function* resendPending() {
        const { client, greet, live, socket } = yield* harness;

        yield* live(1);

        const first = yield* socket(0);
        const a = yield* client.issue(add(1));
        const b = yield* client.issue(add(2));
        const c = yield* client.issue(add(3));

        yield* settle;
        yield* cut(first);

        const d = yield* client.issue(add(4));

        yield* advance(250);

        const second = yield* greet(1, 1);

        yield* advance(ANSWER_LIMIT_MS - 1);

        const ids = [a.id, b.id, c.id, d.id];

        expect(commandIds(first)).toEqual([a.id, b.id, c.id]);
        expect(tagsSent(second).slice(0, 5)).toEqual([
          "Hello",
          "Command",
          "Command",
          "Command",
          "Command",
        ]);
        expect(commandIds(second)).toEqual(ids);

        for (const [index, id] of ids.entries()) {
          yield* second.push(serverText.reply(id, 2 + index));
        }

        const replies = yield* Effect.all([a.reply, b.reply, c.reply, d.reply]);

        expect(replies.map((reply) => reply._tag)).toEqual([
          "Accepted",
          "Accepted",
          "Accepted",
          "Accepted",
        ]);

        yield* cut(second);
        yield* advance(250);

        const third = yield* greet(2, 5);

        expect(commandIds(third)).toEqual([]);
        expect((yield* client.state).pending).toEqual([]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect("a reply for an id this client is not waiting for is ignored", () =>
    Effect.gen(function* unknownReply() {
      const { client, live, socket } = yield* harness;

      yield* live(1);

      const open = yield* socket(0);
      const issued = yield* client.issue(add(1));

      yield* settle;
      yield* open.push(serverText.reply(strangerId, 2));
      yield* settle;

      const state = yield* client.state;

      expect(state.connection).toBe("Live");
      expect(state.pending).toEqual([issued.id]);

      yield* open.push(serverText.reply(issued.id, 2));

      expect((yield* issued.reply)._tag).toBe("Accepted");
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "backoff grows from its floor to the 10 second cap, and resets after a welcome",
    () =>
      Effect.gen(function* backoffLowest() {
        const delays = yield* reconnectDelays(8);

        expect(delays).toEqual([
          125, 250, 500, 1000, 2000, 4000, 5000, 5000, 125,
        ]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "backoff jitter reaches the top of each window and never passes 10 seconds",
    () =>
      Effect.gen(function* backoffHighest() {
        const delays = yield* reconnectDelays(8);

        expect(delays).toEqual([
          250, 500, 1000, 2000, 4000, 8000, 10_000, 10_000, 250,
        ]);
      }).pipe(Effect.scoped, highestJitter)
  );

  it.effect(
    "pings after 15 quiet seconds and drops when no pong comes within the answer limit and its grace",
    () =>
      Effect.gen(function* pingTimeout() {
        const { client, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);

        yield* advance(PING_INTERVAL_MS);
        expect(tagsSent(open)).toEqual(["Hello", "Ping"]);

        yield* advance(UNANSWERED_AFTER_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const state = yield* client.state;

        expect(state.connection).toBe("Waiting");
        expect(state.drop).toEqual(Option.some("Unanswered"));
        expect(open.released()).toBe(true);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "the silence limit still drops a connection that hears nothing for 30 seconds while its own frames cannot leave",
    () =>
      Effect.gen(function* silenceBackstop() {
        const { client, liveWithStalledSends, phase } = yield* harness;

        const open = yield* liveWithStalledSends(1);

        yield* advance(SILENCE_LIMIT_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const state = yield* client.state;

        expect(state.connection).toBe("Waiting");
        expect(state.drop).toEqual(Option.some("Silent"));
        expect(open.sent).toEqual([]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "any frame from the server restarts the silence limit while the client's own frames cannot leave",
    () =>
      Effect.gen(function* framesKeepAlive() {
        const { liveWithStalledSends, phase } = yield* harness;

        const open = yield* liveWithStalledSends(1);

        yield* advance(20_000);
        yield* open.push(serverText.pong());
        yield* advance(29_000);
        expect(yield* phase).toBe("Live");

        yield* open.push(serverText.presence([]));
        yield* advance(29_000);
        expect(yield* phase).toBe("Live");

        yield* advance(1000);
        expect(yield* phase).toBe("Waiting");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a command nobody hears sends a probe at the answer limit, drops when the probe gets no pong even while batches keep arriving, and its resend is answered once",
    () =>
      Effect.gen(function* unheardCommand() {
        const { client, fake, greet, live, phase, socket } = yield* harness;

        yield* live(1);

        const first = yield* socket(0);
        const busy = busyTable(first, 2);
        const issued = yield* client.issue(add(1));

        yield* settle;

        for (
          let second = 1;
          second < COMMAND_UNHEARD_AFTER_MS / 1000;
          second += 1
        ) {
          yield* busy(1000);
        }

        yield* busy(999);
        expect(yield* phase).toBe("Live");
        expect(tagsSent(first)).toEqual(["Hello", "Command", "Ping"]);
        expect(first.sent.at(-1)?.at).toBe(ANSWER_LIMIT_MS);

        yield* advance(1);

        const dropped = yield* client.state;

        expect(dropped.connection).toBe("Waiting");
        expect(dropped.drop).toEqual(Option.some("Unanswered"));
        expect(dropped.pending).toEqual([issued.id]);
        expect(dropped.seq).toEqual(Option.some(seqOf(12)));
        expect(first.released()).toBe(true);

        yield* advance(125);

        const second = yield* greet(1, 12);

        yield* second.push(serverText.reply(issued.id, 13));

        const reply = yield* issued.reply;

        yield* advance(ANSWER_LIMIT_MS * 2);

        expect(reply._tag).toBe("Accepted");
        expect(commandIds(first)).toEqual([issued.id]);
        expect(commandIds(second)).toEqual([issued.id]);
        expect(fake.sockets.length).toBe(2);
        expect(yield* phase).toBe("Live");
        expect((yield* client.state).pending).toEqual([]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a command resent after an unanswered drop gets a fresh deadline on the new connection",
    () =>
      Effect.gen(function* resendDeadline() {
        const { client, greet, live, phase, socket } = yield* harness;

        yield* live(1);

        const issued = yield* client.issue(add(1));

        yield* settle;
        yield* advance(ANSWER_LIMIT_MS);
        yield* advance(UNANSWERED_AFTER_MS);
        expect((yield* client.state).drop).toEqual(Option.some("Unanswered"));

        yield* advance(125);

        const second = yield* greet(1, 1);

        expect(commandIds(second)).toEqual([issued.id]);

        yield* advance(ANSWER_LIMIT_MS);
        yield* advance(UNANSWERED_AFTER_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const dropped = yield* client.state;

        expect(dropped.connection).toBe("Waiting");
        expect(dropped.drop).toEqual(Option.some("Unanswered"));
        expect(second.released()).toBe(true);

        yield* advance(125);

        const third = yield* greet(2, 1);

        yield* third.push(serverText.reply(issued.id, 2));

        expect((yield* issued.reply)._tag).toBe("Accepted");
        expect(commandIds(yield* socket(0))).toEqual([issued.id]);
        expect(commandIds(third)).toEqual([issued.id]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a pong that reached the socket before the client noticed its deadline pass keeps the connection, because the client is slow to hand it the frame",
    () =>
      Effect.gen(function* answerStillInTheClient() {
        const { fake, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);

        yield* advance(PING_INTERVAL_MS + ANSWER_LIMIT_MS - 1);
        yield* open.hold;
        yield* open.push(serverText.pong());
        yield* advance(OVERDUE_GRACE_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* open.handOver;
        yield* advance(OVERDUE_GRACE_MS * 3);

        expect(tagsSent(open)).toEqual(["Hello", "Ping"]);
        expect(yield* phase).toBe("Live");
        expect(fake.sockets.length).toBe(1);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a pong held past the grace costs one reconnect: the pending command is resent once with the same id and the caller gets exactly one reply",
    () =>
      Effect.gen(function* answerHeldTooLong() {
        const { client, fake, greet, live, phase, socket } = yield* harness;

        yield* live(1);

        const first = yield* socket(0);
        const issued = yield* client.issue(add(1));

        yield* advance(ANSWER_LIMIT_MS);
        expect(tagsSent(first)).toEqual(["Hello", "Command", "Ping"]);

        yield* first.hold;
        yield* first.push(serverText.pong());
        yield* first.push(serverText.reply(issued.id, 2));
        yield* advance(UNANSWERED_AFTER_MS);

        const dropped = yield* client.state;

        expect(dropped.drop).toEqual(Option.some("Unanswered"));
        expect(dropped.pending).toEqual([issued.id]);

        yield* first.handOver;
        yield* advance(125);

        const second = yield* greet(1, 2, [2]);

        expect(commandIds(second)).toEqual([issued.id]);

        yield* second.push(serverText.reply(issued.id, 2));

        const reply = yield* issued.reply;

        yield* advance(OVERDUE_GRACE_MS * 3);

        expect(reply).toEqual(
          toyCodec.reply.cases.Accepted.make({ seq: seqOf(2) })
        );
        expect(commandIds(first)).toEqual([issued.id]);
        expect(fake.sockets.length).toBe(2);
        expect(yield* phase).toBe("Live");
        expect((yield* client.state).pending).toEqual([]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a ping that gets no pong drops the connection at the answer limit even while batches keep arriving",
    () =>
      Effect.gen(function* unansweredPing() {
        const { client, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const busy = busyTable(open, 2);

        for (let second = 0; second < PING_INTERVAL_MS / 1000; second += 1) {
          yield* busy(1000);
        }

        expect(tagsSent(open)).toEqual(["Hello", "Ping"]);
        expect(open.sent.at(-1)?.at).toBe(PING_INTERVAL_MS);

        for (let second = 1; second < UNANSWERED_AFTER_MS / 1000; second += 1) {
          yield* busy(1000);
        }

        yield* busy(999);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const state = yield* client.state;

        expect(state.connection).toBe("Waiting");
        expect(state.drop).toEqual(Option.some("Unanswered"));
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a late reply on a line that still pongs keeps the connection, shows the command as waiting for the table, and drops once at the last resort",
    () =>
      Effect.gen(function* slowTable() {
        const { client, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const issued = yield* client.issue(add(1));

        yield* advance(ANSWER_LIMIT_MS);
        expect(tagsSent(open)).toEqual(["Hello", "Command", "Ping"]);
        expect((yield* client.state).waitingForTable).toEqual([issued.id]);

        yield* open.push(serverText.pong());
        yield* advance(PING_INTERVAL_MS - ANSWER_LIMIT_MS);
        expect(tagsSent(open)).toEqual(["Hello", "Command", "Ping", "Ping"]);

        yield* open.push(serverText.pong());
        yield* advance(
          REPLY_LAST_RESORT_MS + OVERDUE_GRACE_MS - PING_INTERVAL_MS - 1
        );

        const waiting = yield* client.state;

        expect(waiting.connection).toBe("Live");
        expect(waiting.waitingForTable).toEqual([issued.id]);

        yield* advance(1);

        const dropped = yield* client.state;

        expect(dropped.drop).toEqual(Option.some("Unanswered"));
        expect(dropped.pending).toEqual([issued.id]);
        expect(dropped.waitingForTable).toEqual([]);
        expect(yield* phase).toBe("Waiting");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a reply that comes after the answer limit on a line that pongs is taken, and the connection stays",
    () =>
      Effect.gen(function* slowReply() {
        const { client, fake, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const issued = yield* client.issue(add(1));

        yield* advance(ANSWER_LIMIT_MS);
        yield* open.push(serverText.pong());
        yield* advance(2000);
        yield* open.push(serverText.reply(issued.id, 2));

        expect((yield* issued.reply)._tag).toBe("Accepted");

        yield* advance(PING_INTERVAL_MS - ANSWER_LIMIT_MS - 2000);
        yield* open.push(serverText.pong());
        yield* advance(REPLY_LAST_RESORT_MS);

        const state = yield* client.state;

        expect(state.waitingForTable).toEqual([]);
        expect(state.pending).toEqual([]);
        expect(yield* phase).toBe("Live");
        expect(fake.sockets.length).toBe(1);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a reply to the first of two commands does not hide the second, which drops the connection at its own deadline",
    () =>
      Effect.gen(function* secondCommandDeadline() {
        const { client, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const first = yield* client.issue(add(1));

        yield* settle;
        yield* advance(2000);

        const second = yield* client.issue(add(2));

        yield* settle;
        yield* advance(1000);
        yield* open.push(serverText.reply(first.id, 2));
        yield* settle;

        expect((yield* first.reply)._tag).toBe("Accepted");

        yield* advance(ANSWER_LIMIT_MS + 2000 - 3000);
        yield* advance(UNANSWERED_AFTER_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const state = yield* client.state;

        expect(state.connection).toBe("Waiting");
        expect(state.drop).toEqual(Option.some("Unanswered"));
        expect(state.pending).toEqual([second.id]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a healthy line that answers inside the limit is never dropped, even when the throttle holds a burst of commands for longer than the limit",
    () =>
      Effect.gen(function* healthyLine() {
        const { client, fake, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);

        const burst = yield* Effect.all(
          Array.from({ length: 120 }, (_, index) => client.issue(add(index)))
        );

        const later: IssuedCommand<ToyTypes>[] = [];
        let answered = 1;

        for (let step = 0; step < 600; step += 1) {
          if (step % 20 === 0 && step < 500) {
            later.push(yield* client.issue(add(step)));
          }

          yield* advance(100);

          const now = yield* Clock.currentTimeMillis;
          let frame = open.sent[answered];

          while (frame !== undefined && frame.at + ANSWER_LAG_MS <= now) {
            const { message } = frame;

            if (Sent.Command(message)) {
              yield* open.push(serverText.reply(message.id, answered));
            }

            if (Sent.Ping(message)) {
              yield* open.push(serverText.pong());
            }

            answered += 1;
            frame = open.sent[answered];
          }

          yield* settle;
          expect(yield* phase).toBe("Live");
        }

        const replies = yield* pipe(
          [...burst, ...later],
          Effect.forEach(({ reply }) => reply)
        );

        expect(
          open.sent.filter(({ message }) => Sent.Ping(message)).length
        ).toBe(4);
        expect(
          open.sent.find(
            ({ message }) =>
              Sent.Command(message) && message.id === burst.at(-1)?.id
          )?.at
        ).toBeGreaterThan(ANSWER_LIMIT_MS);
        expect(
          replies.every((reply) => toyCodec.reply.guards.Accepted(reply))
        ).toBe(true);
        expect(fake.sockets.length).toBe(1);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "commands issued while waiting or connecting get their deadline from the resend, not from when they were issued",
    () =>
      Effect.gen(function* deadlineFromResend() {
        const { client, greet, live, phase, socket } = yield* harness;

        yield* live(1);
        yield* cut(yield* socket(0));

        const whileWaiting = yield* client.issue(add(1));

        expect(yield* phase).toBe("Waiting");

        yield* advance(125);
        expect(yield* phase).toBe("Connecting");

        const whileConnecting = yield* client.issue(add(2));

        yield* advance(ANSWER_LIMIT_MS - 1000);
        expect(yield* phase).toBe("Connecting");

        const second = yield* greet(1, 1);
        const resentAt = yield* Clock.currentTimeMillis;

        expect(commandIds(second)).toEqual([
          whileWaiting.id,
          whileConnecting.id,
        ]);
        expect(second.sent.at(-1)?.at).toBe(resentAt);

        yield* advance(ANSWER_LIMIT_MS);
        yield* advance(UNANSWERED_AFTER_MS - 1);
        expect(yield* phase).toBe("Live");

        yield* advance(1);

        const state = yield* client.state;

        expect(state.drop).toEqual(Option.some("Unanswered"));
        expect(state.pending).toEqual([whileWaiting.id, whileConnecting.id]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "wake during live with an unanswered command keeps its 2 second probe, which pongs satisfy, and the command's own deadline",
    () =>
      Effect.gen(function* wakeWithCommandOwed() {
        const { client, live, phase, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);

        yield* client.issue(add(1));
        yield* settle;
        yield* advance(1000);
        yield* client.wake;
        yield* settle;
        yield* advance(500);
        yield* open.push(serverText.pong());
        yield* advance(1000);
        yield* client.wake;
        yield* settle;

        const lastWakeAt = yield* Clock.currentTimeMillis;

        yield* advance(500);
        yield* open.push(serverText.pong());
        yield* advance(ANSWER_LIMIT_MS - 3001);
        expect(tagsSent(open)).toEqual(["Hello", "Command", "Ping", "Ping"]);
        expect(yield* Clock.currentTimeMillis).toBeGreaterThan(
          lastWakeAt + WAKE_PROBE_MS
        );
        expect(yield* phase).toBe("Live");

        yield* advance(1);
        yield* advance(UNANSWERED_AFTER_MS - 1);
        expect(tagsSent(open)).toEqual([
          "Hello",
          "Command",
          "Ping",
          "Ping",
          "Ping",
        ]);
        expect(yield* phase).toBe("Live");

        yield* advance(1);
        expect((yield* client.state).drop).toEqual(Option.some("Unanswered"));
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect("greeting gives up after 5 seconds without a welcome", () =>
    Effect.gen(function* greetingTimeout() {
      const { accept, client, phase } = yield* harness;

      yield* client.start;
      yield* settle;
      yield* accept(0);
      yield* advance(GREETING_TIMEOUT_MS - 1);
      expect(yield* phase).toBe("Greeting");

      yield* advance(1);

      const state = yield* client.state;

      expect(state.connection).toBe("Waiting");
      expect(state.drop).toEqual(Option.some("GreetingTimeout"));
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "wake probes a live connection and reconnects after a silent drop well inside the ping timeout",
    () =>
      Effect.gen(function* wakeAfterSilentDrop() {
        const { client, fake, live, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);

        yield* advance(1000);
        yield* client.wake;
        yield* settle;
        expect(tagsSent(open)).toEqual(["Hello", "Ping"]);

        yield* advance(WAKE_PROBE_MS - 1);
        expect(fake.sockets.length).toBe(1);

        yield* advance(1);
        expect((yield* client.state).drop).toEqual(Option.some("Silent"));

        yield* advance(125);
        expect(fake.sockets.length).toBe(2);
        expect(WAKE_PROBE_MS + 125).toBeLessThan(30_000);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "wake while waiting reconnects at once instead of sitting out the backoff",
    () =>
      Effect.gen(function* wakeWhileWaiting() {
        const { client, fake, socket } = yield* harness;

        yield* client.start;
        yield* settle;

        for (let attempt = 0; attempt < 5; attempt += 1) {
          yield* cut(yield* socket(attempt));
          yield* advance(10_000);
        }

        yield* cut(yield* socket(5));
        expect(fake.sockets.length).toBe(6);

        yield* client.wake;
        yield* settle;
        expect(fake.sockets.length).toBe(7);
      }).pipe(Effect.scoped, highestJitter)
  );

  it.effect("a pong after wake keeps the connection live", () =>
    Effect.gen(function* wakeAnswered() {
      const { client, live, phase, socket } = yield* harness;

      yield* live(1);

      const open = yield* socket(0);

      yield* client.wake;
      yield* settle;
      yield* open.push(serverText.pong());
      yield* advance(WAKE_PROBE_MS * 3);

      expect(yield* phase).toBe("Live");
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "after a refusal the client never reconnects, and pending commands fail",
    () =>
      Effect.gen(function* refusedForGood() {
        const { client, fake, live, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const issued = yield* client.issue(add(1));

        yield* settle;
        yield* open.push(serverText.closing("NotAuthorized"));
        yield* open.drop(4003, "NotAuthorized");
        yield* advance(300_000);

        const failure = yield* Effect.flip(issued.reply);
        const late = yield* Effect.flip(client.issue(add(2)));
        const state = yield* client.state;

        expect(state.connection).toBe("Refused");
        expect(state.refusal).toEqual(Option.some("NotAuthorized"));
        expect(fake.sockets.length).toBe(1);
        expect(failure._tag).toBe("ClientRefused");
        expect(late._tag).toBe("ClientRefused");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a wrong token ends in Refused even when only the socket close says why",
    () =>
      Effect.gen(function* refusedByCloseReason() {
        const { accept, client, fake } = yield* harness;

        yield* client.start;
        yield* settle;

        const open = yield* accept(0);

        yield* open.drop(4003, "NotAuthorized");
        yield* advance(300_000);

        expect((yield* client.state).connection).toBe("Refused");
        expect(fake.sockets.length).toBe(1);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect("a closing frame retries or refuses according to its reason", () =>
    Effect.gen(function* closingVerdicts() {
      const outcomes: Record<string, string> = {};

      const reasons: readonly CloseReason[] = [
        "HelloTimeout",
        "TooManyFrames",
        "RoomHalted",
        "ProtocolViolation",
        "NotFound",
        "TooManySockets",
        "Unresponsive",
        "ClientOutdated",
        "ServerOutdated",
      ];

      for (const reason of reasons) {
        const { client, live, socket } = yield* harness;

        yield* live(1);
        yield* (yield* socket(0)).push(serverText.closing(reason));
        yield* settle;
        const state = yield* client.state;

        const why = Option.getOrElse(
          Option.orElse(state.drop, () => state.refusal),
          () => "none"
        );

        outcomes[reason] = `${state.connection} ${why}`;
      }

      expect(outcomes).toEqual({
        ClientOutdated: "Outdated none",
        HelloTimeout: "Waiting HelloTimeout",
        NotFound: "Refused NotFound",
        ProtocolViolation: "Refused ProtocolViolation",
        RoomHalted: "Refused RoomHalted",
        ServerOutdated: "Waiting ServerOutdated",
        TooManyFrames: "Waiting TooManyFrames",
        TooManySockets: "Waiting TooManySockets",
        Unresponsive: "Waiting Unresponsive",
      });
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect("a hello names the protocol this client speaks", () =>
    Effect.gen(function* helloNamesProtocol() {
      const { live, socket } = yield* harness;

      yield* live(1);

      const protocols = (yield* socket(0)).sent.flatMap(({ message }) =>
        Sent.Hello(message) ? [message.protocol] : []
      );

      expect(protocols).toEqual([PROTOCOL_VERSION]);
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a client the server calls outdated stops for good, fails pending commands, and is not refused, whichever way the server says it",
    () =>
      Effect.gen(function* outdatedForGood() {
        const byFrame = yield* harness;

        yield* byFrame.live(1);

        const issued = yield* byFrame.client.issue(add(1));

        yield* settle;
        yield* (yield* byFrame.socket(0)).push(
          serverText.closing("ClientOutdated")
        );
        yield* advance(300_000);

        const failure = yield* Effect.flip(issued.reply);
        const late = yield* Effect.flip(byFrame.client.issue(add(2)));
        const state = yield* byFrame.client.state;

        const byClose = yield* harness;

        yield* byClose.client.start;
        yield* settle;
        yield* (yield* byClose.accept(0)).drop(4011, "ClientOutdated");
        yield* advance(300_000);

        expect({
          byClose: (yield* byClose.client.state).connection,
          connection: state.connection,
          failure: Schema.is(ClientRefused)(failure) && failure.reason,
          late: Schema.is(ClientRefused)(late) && late.reason,
          refusal: state.refusal,
          sockets: [byFrame.fake.sockets.length, byClose.fake.sockets.length],
        }).toEqual({
          byClose: "Outdated",
          connection: "Outdated",
          failure: "ClientOutdated",
          late: "ClientOutdated",
          refusal: Option.none(),
          sockets: [1, 1],
        });
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a server still on an older protocol is waited out like a dropped line, and the client greets it again",
    () =>
      Effect.gen(function* serverBehind() {
        const { accept, client, fake } = yield* harness;

        yield* client.start;
        yield* settle;
        yield* (yield* accept(0)).drop(4012, "ServerOutdated");
        yield* settle;

        const waiting = yield* client.state;

        yield* advance(300_000);

        expect({
          drop: waiting.drop,
          phase: waiting.connection,
          reconnected: fake.sockets.length > 1,
        }).toEqual({
          drop: Option.some("SocketClosed"),
          phase: "Waiting",
          reconnected: true,
        });
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a welcome from a server that serves another build marks the new build, and stays live",
    () =>
      Effect.gen(function* seesNewBuild() {
        const served = BuildIdSchema.make("page-build-2");
        const outcomes: string[] = [];

        for (const [page, welcomeBuild] of [
          [Option.some(PAGE_BUILD), Option.some(served)],
          [Option.some(PAGE_BUILD), Option.some(PAGE_BUILD)],
          [Option.some(PAGE_BUILD), Option.none()],
          [Option.none(), Option.some(served)],
        ] as const) {
          const { accept, client } = yield* harnessFor(page);

          yield* client.start;
          yield* settle;
          yield* (yield* accept(0)).push(
            serverText.welcome(3, [], welcomeBuild)
          );
          yield* settle;

          const state = yield* client.state;

          outcomes.push(
            `${state.connection} ${Option.getOrElse(state.newBuild, () => "same")}`
          );
        }

        expect(outcomes).toEqual([
          "Live page-build-2",
          "Live same",
          "Live same",
          "Live same",
        ]);
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "stop closes the socket, leaves no timer running, and fails pending commands",
    () =>
      Effect.gen(function* stopEverything() {
        const { client, fake, live, socket } = yield* harness;

        yield* live(1);

        const open = yield* socket(0);
        const issued = yield* client.issue(add(1));

        yield* settle;
        yield* client.stop;
        yield* advance(120_000);

        const failure = yield* Effect.flip(issued.reply);

        expect((yield* client.state).connection).toBe("Stopped");
        expect(open.released()).toBe(true);
        expect(open.sentAfterRelease).toEqual([]);
        expect(tagsSent(open)).toEqual(["Hello", "Command"]);
        expect(fake.sockets.length).toBe(1);
        expect(failure._tag).toBe("ClientStopped");
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "frames never outrun the server's flood limit, even in a resend burst",
    () =>
      Effect.gen(function* rateLimited() {
        const { client, greet } = yield* harness;

        const issued = yield* Effect.all(
          Array.from({ length: 40 }, (_, index) => client.issue(add(index)))
        );

        yield* client.start;
        yield* settle;

        const open = yield* greet(0, 1);

        for (let step = 0; step < 100; step += 1) {
          yield* advance(50);
        }

        expect(commandIds(open)).toEqual(issued.map(({ id }) => id));
        expect(serverAdmits(open.sent)).toBe(true);
        expect(open.sent.filter(({ at }) => at === open.openedAt).length).toBe(
          8
        );
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "cancelling locally withdraws an unsent command and only stops waiting for a sent one",
    () =>
      Effect.gen(function* cancelLocally() {
        const { client, greet, live, socket } = yield* harness;

        yield* live(1);

        const first = yield* socket(0);
        const sent = yield* client.issue(add(1));

        yield* settle;
        yield* cut(first);

        const unsent = yield* client.issue(add(2));
        const unsentOutcome = yield* client.cancelLocally(unsent.id);
        const sentOutcome = yield* client.cancelLocally(sent.id);
        const again = yield* client.cancelLocally(sent.id);

        yield* advance(250);

        const second = yield* greet(1, 1);

        yield* second.push(serverText.reply(sent.id, 2));
        yield* settle;

        const sentFailure = yield* Effect.flip(sent.reply);
        const unsentFailure = yield* Effect.flip(unsent.reply);

        expect(unsentOutcome).toBe("NeverSentWillNotApply");
        expect(sentOutcome).toBe("AlreadySentMayStillApply");
        expect(again).toBe("NotPending");
        expect(commandIds(second)).toEqual([]);
        expect(sentFailure).toEqual(
          new CommandCancelled({ id: sent.id, mayStillApply: true })
        );
        expect(unsentFailure).toEqual(
          new CommandCancelled({ id: unsent.id, mayStillApply: false })
        );
      }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect(
    "a command too large for one frame is refused before it is sent",
    () =>
      Effect.gen(function* tooLarge() {
        const { client, live, socket } = yield* harness;

        yield* live(1);

        const failure = yield* Effect.flip(
          client.issue(
            Commands.Shout.make({ words: "x".repeat(MAX_FRAME_BYTES) })
          )
        );

        expect(Schema.is(CommandTooLarge)(failure)).toBe(true);
        expect(tagsSent(yield* socket(0))).toEqual(["Hello"]);
      }).pipe(Effect.scoped, lowestJitter)
  );
});
