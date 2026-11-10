import { describe, expect, it } from "@effect/vitest";
import { serverFrame, SeqSchema } from "@nostakes/protocol";
import { Effect, Option, Schema, Stream } from "effect";

import { clientCodec, roomClient } from "../src/index.js";
import type { ClientSchemas } from "../src/index.js";
import {
  fakeTransport,
  serverText,
  settle,
  YOU,
} from "./fixtures/fake-transport.js";
import {
  ROOM_URL,
  TOKEN,
  ToyEventSchema,
  toySchemas,
} from "./fixtures/toy-room.js";
import type { ToyTypes } from "./fixtures/toy-room.js";

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

const SEATS = 9;

const AVATAR_CHARACTERS = 512;

const WARM_UP_BATCHES = 500;

const LARGE_VIEW_BATCHES = 2000;

const LARGE_VIEW_RETAINED_BYTES_LIMIT = 1_000_000;

const TableViewSchema = Schema.Struct({
  seats: Schema.Array(
    Schema.Struct({ avatar: Schema.String, stack: Schema.Int })
  ),
  total: Schema.Int,
});

const tableSchemas: ClientSchemas<
  Omit<ToyTypes, "View"> & { readonly View: typeof TableViewSchema.Type }
> = { ...toySchemas, view: TableViewSchema };

const tableCodec = clientCodec(tableSchemas);

const encodeTableFrame = Schema.encodeSync(serverFrame(tableSchemas));

const tableView = (total: number) => ({
  seats: Array.from({ length: SEATS }, (_, seat) => ({
    avatar: String(seat).repeat(AVATAR_CHARACTERS),
    stack: total + seat,
  })),
  total,
});

const tableWelcome = encodeTableFrame(
  tableCodec.server.cases.Welcome.make({
    catchUp: tableCodec.catchUp.cases.UpToDate.make({}),
    seq: SeqSchema.make(0),
    view: tableView(0),
    you: YOU,
  })
);

const tableBatch = (seq: number) =>
  encodeTableFrame(
    tableCodec.server.cases.Events.make({
      events: [ToyEventSchema.cases.Added.make({ amount: 1, total: seq })],
      from: SeqSchema.make(seq),
      to: SeqSchema.make(seq),
      view: tableView(seq),
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

  it.effect(
    "keeps no memory for the views of 2,000 batches with nine full seats",
    () =>
      Effect.gen(function* playLargeViews() {
        const fake = yield* fakeTransport;

        const client = yield* roomClient(tableSchemas, {
          token: TOKEN,
          url: ROOM_URL,
        }).pipe(Effect.provide(fake.layer));

        yield* client.updates.pipe(Stream.runDrain, Effect.forkScoped);
        yield* client.start;
        yield* settle;

        const open = yield* Effect.fromNullishOr(fake.sockets[0]);

        yield* open.accept;
        yield* settle;
        yield* open.push(tableWelcome);
        yield* settle;

        let batch = 0;

        while (batch < WARM_UP_BATCHES) {
          batch += 1;
          yield* open.push(tableBatch(batch));
          yield* settle;
        }

        const before = yield* retainedHeap;

        while (batch < WARM_UP_BATCHES + LARGE_VIEW_BATCHES) {
          batch += 1;
          yield* open.push(tableBatch(batch));
          yield* settle;
        }

        const after = yield* retainedHeap;
        const state = yield* client.state;

        expect(
          after - before,
          `bytes retained between batch ${WARM_UP_BATCHES} and batch ${batch}`
        ).toBeLessThanOrEqual(LARGE_VIEW_RETAINED_BYTES_LIMIT);
        expect({
          applied: state.seq,
          connection: state.connection,
        }).toEqual({
          applied: Option.some(batch),
          connection: "Live",
        });
      }).pipe(Effect.scoped),
    120_000
  );
});
