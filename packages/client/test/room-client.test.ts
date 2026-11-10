import { describe, expect, it } from "@effect/vitest";
import {
  FRAME_BURST,
  FRAMES_PER_SECOND,
  MAX_FRAME_BYTES,
  CommandIdSchema,
} from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Clock, Effect, Option, Random, Schema, Stream } from "effect";
import * as TestClock from "effect/testing/TestClock";

import {
  Activities,
  CommandCancelled,
  CommandTooLarge,
  GREETING_TIMEOUT_MS,
  roomClient,
  WAKE_PROBE_MS,
} from "../src/index.js";
import type { Activity, RoomClient } from "../src/index.js";
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
  TestClock.adjust(`${millis} millis`).pipe(Effect.andThen(settle));

const harness = Effect.gen(function* harness() {
  const fake = yield* fakeTransport;
  const seen: Activity<ToyTypes["Event"]>[] = [];

  const client: RoomClient<ToyTypes> = yield* roomClient(toySchemas, {
    token: TOKEN,
    url: ROOM_URL,
  }).pipe(Effect.provide(fake.layer));

  yield* client.activity.pipe(
    Stream.runForEach((item) => Effect.sync(() => seen.push(item))),
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

  const greet = (index: number, head: number, missed: readonly number[] = []) =>
    accept(index).pipe(
      Effect.tap((open) => open.push(serverText.welcome(head, missed))),
      Effect.tap(settle)
    );

  const live = (head: number) =>
    client.start.pipe(Effect.andThen(settle), Effect.andThen(greet(0, head)));

  const phase = client.state.pipe(Effect.map(({ connection }) => connection));

  return {
    accept,
    client,
    fake,
    greet,
    live,
    phase,
    seen,
    socket,
  };
});

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
    "missed events on resume are applied in order, and a stretch the server cannot replay is reported as skipped",
    () =>
      Effect.gen(function* resumeActivity() {
        const { greet, live, seen, socket } = yield* harness;

        yield* live(5);
        yield* cut(yield* socket(0));
        yield* advance(250);
        yield* cut(yield* greet(1, 8, [6, 7, 8]));
        yield* advance(250);
        yield* greet(2, 300);

        expect(seen).toEqual([
          Activities.Applied({ event: addedTotal(6), seq: seqOf(6) }),
          Activities.Applied({ event: addedTotal(7), seq: seqOf(7) }),
          Activities.Applied({ event: addedTotal(8), seq: seqOf(8) }),
          Activities.Skipped({ from: seqOf(9), to: seqOf(300) }),
        ]);
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

        yield* advance(20_000);

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

  it.effect("pings after 15 quiet seconds and drops after 30", () =>
    Effect.gen(function* pingTimeout() {
      const { client, live, phase, socket } = yield* harness;

      yield* live(1);

      const open = yield* socket(0);

      yield* advance(15_000);
      expect(tagsSent(open)).toEqual(["Hello", "Ping"]);

      yield* advance(14_999);
      expect(yield* phase).toBe("Live");

      yield* advance(1);

      const state = yield* client.state;

      expect(state.connection).toBe("Waiting");
      expect(state.drop).toEqual(Option.some("Silent"));
      expect(open.released()).toBe(true);
    }).pipe(Effect.scoped, lowestJitter)
  );

  it.effect("any frame from the server keeps a quiet connection alive", () =>
    Effect.gen(function* framesKeepAlive() {
      const { live, phase, socket } = yield* harness;

      yield* live(1);

      const open = yield* socket(0);

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
      ];

      for (const reason of reasons) {
        const { client, live, socket } = yield* harness;

        yield* live(1);
        yield* (yield* socket(0)).push(serverText.closing(reason));
        yield* settle;
        outcomes[reason] = (yield* client.state).connection;
      }

      expect(outcomes).toEqual({
        HelloTimeout: "Waiting",
        ProtocolViolation: "Refused",
        RoomHalted: "Refused",
        TooManyFrames: "Waiting",
      });
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
