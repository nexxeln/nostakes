import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Stream } from "effect";

import { roomClient } from "../src/index.js";
import {
  fakeTransport,
  serverText,
  settle,
} from "./fixtures/fake-transport.js";
import { ROOM_URL, TOKEN, toySchemas } from "./fixtures/toy-room.js";

const BATCHES_PER_WINDOW = 1000;

const WINDOWS = 6;

const RETAINED_BYTES_PER_BATCH_LIMIT = 2048;

const RETAINED_BYTES_LIMIT =
  RETAINED_BYTES_PER_BATCH_LIMIT * BATCHES_PER_WINDOW * (WINDOWS - 1);

const retainedHeap = Effect.fromNullishOr(globalThis.gc).pipe(
  Effect.orDie,
  Effect.map((collect) => {
    collect();
    collect();

    return process.memoryUsage().heapUsed;
  })
);

describe("a long night", () => {
  it.effect(
    "applies 6,000 batches in a row and keeps at most 2 kB of memory for each",
    () =>
      Effect.gen(function* playLongNight() {
        const fake = yield* fakeTransport;
        let lastUpdate = Option.none<number>();

        const client = yield* roomClient(toySchemas, {
          token: TOKEN,
          url: ROOM_URL,
        }).pipe(Effect.provide(fake.layer));

        yield* client.updates.pipe(
          Stream.runForEach(({ seq }) =>
            Effect.sync(() => {
              lastUpdate = Option.some(seq);
            })
          ),
          Effect.forkScoped
        );

        yield* client.start;
        yield* settle;

        const open = yield* Effect.fromNullishOr(fake.sockets[0]);

        yield* open.accept;
        yield* settle;
        yield* open.push(serverText.welcome(0));
        yield* settle;

        let batch = 0;
        let baseline = Option.none<number>();

        for (let window = 0; window < WINDOWS; window += 1) {
          for (let step = 0; step < BATCHES_PER_WINDOW; step += 1) {
            batch += 1;
            yield* open.push(serverText.events(batch, [batch]));
            yield* settle;
          }

          const heap = yield* retainedHeap;
          const growth = heap - Option.getOrElse(baseline, () => heap);

          baseline = Option.orElse(baseline, () => Option.some(heap));

          expect(
            growth,
            `bytes retained between batch ${BATCHES_PER_WINDOW} and batch ${batch}`
          ).toBeLessThanOrEqual(RETAINED_BYTES_LIMIT);
        }

        const state = yield* client.state;

        expect({
          applied: state.seq,
          connection: state.connection,
          lastUpdate,
        }).toEqual({
          applied: Option.some(batch),
          connection: "Live",
          lastUpdate: Option.some(batch),
        });
      }).pipe(Effect.scoped),
    120_000
  );
});
