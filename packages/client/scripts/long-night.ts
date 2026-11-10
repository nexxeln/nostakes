import {
  clientCodec,
  roomClient,
  SocketEvents,
  Transport,
} from "@nostakes/client";
import type { ClientSchemas, SocketEvent } from "@nostakes/client";
import {
  PlayerIdSchema,
  serverFrame,
  SeqSchema,
  TokenSchema,
} from "@nostakes/protocol";
import { Console, Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import type { Cause } from "effect";
import * as TestClock from "effect/testing/TestClock";

const BATCHES_PER_WINDOW = 1000;

const WINDOWS = 20;

const COMPARED_WINDOWS = 3;

const ALLOWED_CPU_GROWTH = 3;

const RETAINED_BYTES_PER_BATCH_LIMIT = 2048;

const RETAINED_BYTES_FLOOR = 10_240_000;

const YIELDS_PER_BATCH = 30;

const ToyEventSchema = Schema.TaggedUnion({
  Added: { amount: Schema.Int, total: Schema.Int },
});

const ToySignalSchema = Schema.TaggedUnion({ Nod: {} });

const schemas: ClientSchemas<{
  readonly Command: { readonly _tag: "Add"; readonly amount: number };
  readonly Event: typeof ToyEventSchema.Type;
  readonly View: { readonly total: number };
  readonly Rejection: { readonly reason: string };
  readonly Signal: typeof ToySignalSchema.Type;
}> = {
  command: Schema.TaggedUnion({ Add: { amount: Schema.Int } }),
  event: ToyEventSchema,
  rejection: Schema.Struct({ reason: Schema.String }),
  signal: ToySignalSchema,
  view: Schema.Struct({ total: Schema.Int }),
};

const codec = clientCodec(schemas);

const TOKEN = Schema.decodeSync(TokenSchema)("a".repeat(43));

const encodeServerFrame = Schema.encodeSync(serverFrame(schemas));

const welcomeText = encodeServerFrame(
  codec.server.cases.Welcome.make({
    catchUp: codec.catchUp.cases.UpToDate.make({}),
    seq: SeqSchema.make(0),
    view: { total: 0 },
    you: PlayerIdSchema.make("you-aaaaaaaaaaaa"),
  })
);

const batchText = (seq: number) =>
  encodeServerFrame(
    codec.server.cases.Events.make({
      events: [ToyEventSchema.cases.Added.make({ amount: 1, total: seq })],
      from: SeqSchema.make(seq),
      to: SeqSchema.make(seq),
      view: { total: seq },
    })
  );

class LongNightFailed extends Schema.TaggedError<
  LongNightFailed,
  { readonly brand: unique symbol }
>()("LongNightFailed", {
  batches: Schema.Int,
  detail: Schema.String,
}) {
  override get message() {
    return `After ${this.batches} batches ${this.detail}. A client that does more for each batch the longer a night runs slows down and then stops applying the room; check that patches/xstate@6.0.0-beta.1.patch is applied and profile one window of batches.`;
  }
}

interface HeapMark {
  readonly batch: number;
  readonly bytes: number;
}

const retainedHeap = Effect.fromNullishOr(globalThis.gc).pipe(
  Effect.orDie,
  Effect.map((collect) => {
    collect();
    collect();

    return process.memoryUsage().heapUsed;
  })
);

const cpuMillisSince = (start: NodeJS.CpuUsage) => {
  const used = process.cpuUsage(start);

  return (used.user + used.system) / 1000;
};

const retainedTooMuch = (since: HeapMark, now: HeapMark) =>
  now.bytes - since.bytes >
  Math.max(
    RETAINED_BYTES_FLOOR,
    RETAINED_BYTES_PER_BATCH_LIMIT * (now.batch - since.batch)
  );

const settle = Effect.yieldNow.pipe(Effect.repeat({ times: YIELDS_PER_BATCH }));

const program = Effect.gen(function* playLongNight() {
  const inbox = yield* Queue.unbounded<SocketEvent, Cause.Done>();

  const transport = Layer.succeed(Transport, {
    open: () =>
      Effect.succeed({
        events: Stream.fromQueue(inbox),
        send: () => Effect.void,
      }),
  });

  const deliver = (event: SocketEvent) =>
    Effect.sync(() => Queue.offerUnsafe(inbox, event)).pipe(
      Effect.andThen(settle)
    );

  const client = yield* roomClient(schemas, {
    token: TOKEN,
    url: "ws://room.test/rooms/K7P2XZ/socket",
  }).pipe(Effect.provide(transport));

  yield* client.start;
  yield* settle;
  yield* deliver(SocketEvents.Opened({ url: "ws://room.test" }));
  yield* deliver(SocketEvents.Received({ text: welcomeText }));
  yield* Console.log(
    `batches applied | CPU for the last ${BATCHES_PER_WINDOW} | heap after GC`
  );

  const windowCostsMs: number[] = [];
  const marks: HeapMark[] = [];
  let sent = 0;
  let failure = Option.none<string>();

  while (windowCostsMs.length < WINDOWS && Option.isNone(failure)) {
    const start = process.cpuUsage();

    for (let step = 0; step < BATCHES_PER_WINDOW; step += 1) {
      sent += 1;
      yield* deliver(SocketEvents.Received({ text: batchText(sent) }));
    }

    windowCostsMs.push(cpuMillisSince(start));

    const mark: HeapMark = { batch: sent, bytes: yield* retainedHeap };
    const applied = Option.getOrElse((yield* client.state).seq, () => 0);
    const since = marks[0] ?? mark;

    marks.push(mark);

    yield* Console.log(
      `${applied} | ${((windowCostsMs.at(-1) ?? 0) / 1000).toFixed(2)} s | ${(mark.bytes / 1e6).toFixed(1)} MB`
    );

    if (retainedTooMuch(since, mark)) {
      failure = Option.some(
        `the client kept ${Math.round((mark.bytes - since.bytes) / 1000)} kB more than after batch ${since.batch}`
      );
    }
  }

  const early = Math.min(...windowCostsMs.slice(1, 1 + COMPARED_WINDOWS));
  const late = Math.min(...windowCostsMs.slice(-COMPARED_WINDOWS));
  const state = yield* client.state;
  const applied = Option.getOrElse(state.seq, () => 0);

  if (Option.isNone(failure) && late > early * ALLOWED_CPU_GROWTH) {
    failure = Option.some(
      `the client's CPU per ${BATCHES_PER_WINDOW} batches grew from ${Math.round(early)} ms to ${Math.round(late)} ms: ${windowCostsMs.map(Math.round).join(", ")}`
    );
  }

  if (
    Option.isNone(failure) &&
    (applied !== sent || state.connection !== "Live")
  ) {
    failure = Option.some(
      `the client had applied ${applied} of ${sent} and says ${state.connection}`
    );
  }

  return yield* Option.match(failure, {
    onNone: () =>
      Console.log(
        `${sent} batches applied; CPU per ${BATCHES_PER_WINDOW} early ${Math.round(early)} ms, late ${Math.round(late)} ms`
      ),
    onSome: (detail) =>
      Effect.fail(new LongNightFailed({ batches: sent, detail })),
  });
}).pipe(Effect.scoped, Effect.provide(TestClock.layer()));

await Effect.runPromise(program);
