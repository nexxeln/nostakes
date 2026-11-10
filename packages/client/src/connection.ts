import { Effect, Queue, Result, Stream } from "effect";
import type { Cause } from "effect";

import type { ConnectionEvent, Link } from "./client-events.js";
import type { ClientCodec, ClientMessage, RoomTypes } from "./codec.js";
import { SocketEvents } from "./socket-event.js";
import { CLIENT_BURST_REFILL_MS, CLIENT_FRAME_BURST } from "./timing.js";
import type { Socket } from "./transport.js";
import { Transport } from "./transport.js";

type Inlet<T extends RoomTypes> = Queue.Queue<ConnectionEvent<T>, Cause.Done>;

const fromServer = <T extends RoomTypes>(
  codec: ClientCodec<T>,
  text: string
): ConnectionEvent<T> =>
  Result.match(codec.decodeServerFrame(text), {
    onFailure: (): ConnectionEvent<T> => ({ type: "Garbled" }),
    onSuccess: (message) =>
      codec.server.match(message, {
        Closing: ({ reason }): ConnectionEvent<T> => ({
          reason,
          type: "Closing",
        }),
        Events: ({ events, from, to, view }): ConnectionEvent<T> => ({
          events,
          from,
          to,
          type: "Batch",
          view,
        }),
        Pong: (): ConnectionEvent<T> => ({ type: "Pong" }),
        Presence: ({ connected }): ConnectionEvent<T> => ({
          connected,
          type: "Presence",
        }),
        Reply: ({ id, result }): ConnectionEvent<T> => ({
          id,
          result,
          type: "Reply",
        }),
        Signal: ({ from, signal }): ConnectionEvent<T> => ({
          from,
          signal,
          type: "Signal",
        }),
        Welcome: ({ build, catchUp, seq, view, you }): ConnectionEvent<T> => ({
          build,
          catchUp,
          seq,
          type: "Welcome",
          view,
          you,
        }),
      }),
  });

const answerOwedFor = <T extends RoomTypes>(
  codec: ClientCodec<T>,
  message: ClientMessage<T>
): readonly ConnectionEvent<T>[] =>
  codec.client.match(message, {
    Command: ({ id }): readonly ConnectionEvent<T>[] => [
      { id, type: "CommandSent" },
    ],
    Hello: (): readonly ConnectionEvent<T>[] => [],
    Ping: (): readonly ConnectionEvent<T>[] => [{ type: "PingSent" }],
    Signal: (): readonly ConnectionEvent<T>[] => [],
  });

const writeFrames = <T extends RoomTypes>(
  codec: ClientCodec<T>,
  outlet: Queue.Queue<ClientMessage<T>>,
  inlet: Inlet<T>,
  socket: Socket
) =>
  Stream.fromQueue(outlet).pipe(
    Stream.rechunk(1),
    Stream.throttle({
      cost: (frames) => frames.length,
      duration: `${CLIENT_BURST_REFILL_MS} millis`,
      strategy: "shape",
      units: CLIENT_FRAME_BURST,
    }),
    Stream.runForEach((message) =>
      Result.match(codec.encodeClientFrame(message), {
        onFailure: Effect.die,
        onSuccess: (text) =>
          Effect.sync(() => {
            Queue.offerAllUnsafe(inlet, answerOwedFor(codec, message));
          }).pipe(Effect.andThen(socket.send(text))),
      })
    )
  );

export const connectionEvents = <T extends RoomTypes>(
  codec: ClientCodec<T>,
  url: string
) =>
  Stream.unwrap(
    Effect.gen(function* openConnection() {
      const transport = yield* Transport;
      const socket = yield* transport.open(url);
      const outlet = yield* Queue.unbounded<ClientMessage<T>>();

      const inlet: Inlet<T> = yield* Queue.unbounded<
        ConnectionEvent<T>,
        Cause.Done
      >();

      const link: Link<T> = {
        transmit: (message) => {
          Queue.offerUnsafe(outlet, message);
        },
      };

      yield* Effect.addFinalizer(() => Queue.shutdown(outlet));
      yield* socket.events.pipe(
        Stream.map(
          SocketEvents.$match({
            Closed: ({ code, reason }): ConnectionEvent<T> => ({
              code,
              reason,
              type: "Closed",
            }),
            Opened: (): ConnectionEvent<T> => ({ link, type: "Opened" }),
            Received: ({ text }) => fromServer(codec, text),
          })
        ),
        Stream.runForEach((event) =>
          Effect.sync(() => {
            Queue.offerUnsafe(inlet, event);
          })
        ),
        Effect.ensuring(Effect.sync(() => Queue.endUnsafe(inlet))),
        Effect.forkScoped
      );
      yield* writeFrames(codec, outlet, inlet, socket).pipe(Effect.forkScoped);

      return Stream.fromQueue(inlet);
    })
  );
