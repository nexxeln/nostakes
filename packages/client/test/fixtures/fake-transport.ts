import { serverFrame, PlayerIdSchema, SeqSchema } from "@nostakes/protocol";
import type { CloseReason, CommandId, PlayerId, Seq } from "@nostakes/protocol";
import {
  Array as Arr,
  Clock,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
} from "effect";
import type { Cause } from "effect";

import { SocketEvents, Transport } from "../../src/index.js";
import type { ClientMessage, SocketEvent } from "../../src/index.js";
import { ToyEventSchema, toyCodec, toySchemas } from "./toy-room.js";
import type { ToyTypes } from "./toy-room.js";

export interface SentFrame {
  readonly at: number;
  readonly message: ClientMessage<ToyTypes>;
}

export interface FakeSocket {
  readonly url: string;
  readonly openedAt: number;
  readonly sent: SentFrame[];
  readonly sentAfterRelease: SentFrame[];
  readonly released: () => boolean;
  readonly accept: Effect.Effect<void>;
  readonly stall: Effect.Effect<void>;
  readonly hold: Effect.Effect<void>;
  readonly handOver: Effect.Effect<void>;
  readonly push: (text: string) => Effect.Effect<void>;
  readonly drop: (code: number, reason: string) => Effect.Effect<void>;
}

const decodeClientFrame = Schema.decodeUnknownSync(
  Schema.fromJsonString(toyCodec.client)
);

const encodeServerFrame = Schema.encodeSync(serverFrame(toySchemas));

export const YOU: PlayerId = PlayerIdSchema.make("you-aaaaaaaaaaaa");

export const seq = (value: number): Seq => SeqSchema.make(value);

const addedEvent = (total: number) =>
  ToyEventSchema.cases.Added.make({ amount: 1, total });

export const serverText = {
  closing: (reason: CloseReason) =>
    encodeServerFrame(toyCodec.server.cases.Closing.make({ reason })),
  events: (from: number, totals: readonly number[]) =>
    encodeServerFrame(
      toyCodec.server.cases.Events.make({
        events: totals.map(addedEvent),
        from: seq(from),
        to: seq(from + totals.length - 1),
        view: { total: totals.at(-1) ?? 0 },
      })
    ),
  pong: () => encodeServerFrame(toyCodec.server.cases.Pong.make({})),
  presence: (connected: readonly PlayerId[]) =>
    encodeServerFrame(toyCodec.server.cases.Presence.make({ connected })),
  reply: (id: CommandId, total: number) =>
    encodeServerFrame(
      toyCodec.server.cases.Reply.make({
        id,
        result: toyCodec.reply.cases.Accepted.make({ seq: seq(total) }),
      })
    ),
  skippedWelcome: (from: number, head: number) =>
    encodeServerFrame(
      toyCodec.server.cases.Welcome.make({
        catchUp: toyCodec.catchUp.cases.Skipped.make({
          from: seq(from),
          to: seq(head),
        }),
        seq: seq(head),
        view: { total: head },
        you: YOU,
      })
    ),
  welcome: (head: number, missedTotals: readonly number[] = []) =>
    encodeServerFrame(
      toyCodec.server.cases.Welcome.make({
        catchUp: Arr.match(missedTotals.map(addedEvent), {
          onEmpty: () => toyCodec.catchUp.cases.UpToDate.make({}),
          onNonEmpty: (events) =>
            toyCodec.catchUp.cases.Missed.make({
              events,
              from: seq(head - events.length + 1),
            }),
        }),
        seq: seq(head),
        view: { total: head },
        you: YOU,
      })
    ),
};

export const fakeTransport = Effect.sync(() => {
  const sockets: FakeSocket[] = [];

  const layer = Layer.succeed(Transport, {
    open: (url) =>
      Effect.gen(function* openFake() {
        const inbox = yield* Queue.unbounded<SocketEvent, Cause.Done>();
        const sent: SentFrame[] = [];
        const sentAfterRelease: SentFrame[] = [];
        const openedAt = yield* Clock.currentTimeMillis;
        let released = false;
        let stalled = false;
        let holding = false;
        const held: string[] = [];

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            released = true;
            Queue.endUnsafe(inbox);
          })
        );

        sockets.push({
          accept: Effect.sync(() => {
            Queue.offerUnsafe(inbox, SocketEvents.Opened({ url }));
          }),
          drop: (code, reason) =>
            Effect.sync(() => {
              Queue.offerUnsafe(inbox, SocketEvents.Closed({ code, reason }));
              Queue.endUnsafe(inbox);
            }),
          handOver: Effect.sync(() => {
            holding = false;

            for (const text of held.splice(0)) {
              Queue.offerUnsafe(inbox, SocketEvents.Received({ text }));
            }
          }),
          hold: Effect.sync(() => {
            holding = true;
          }),
          openedAt,
          push: (text) =>
            Effect.sync(() => {
              if (holding) {
                held.push(text);
              } else {
                Queue.offerUnsafe(inbox, SocketEvents.Received({ text }));
              }
            }),
          released: () => released,
          sent,
          sentAfterRelease,
          stall: Effect.sync(() => {
            stalled = true;
          }),
          url,
        });

        return {
          events: Stream.fromQueue(inbox),
          send: (text: string) =>
            stalled
              ? Effect.never
              : Clock.currentTimeMillis.pipe(
                  Effect.flatMap((at) =>
                    Effect.sync(() => {
                      const log = released ? sentAfterRelease : sent;

                      log.push({ at, message: decodeClientFrame(text) });
                    })
                  )
                ),
        };
      }),
  });

  return { layer, sockets };
});

export const settle = Effect.yieldNow.pipe(Effect.repeat({ times: 30 }));
