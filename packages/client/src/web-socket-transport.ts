import { Effect, Layer, Predicate, Queue, Result, Stream } from "effect";
import type { Cause } from "effect";

import { SocketEvents } from "./socket-event.js";
import type { SocketEvent } from "./socket-event.js";
import { Transport } from "./transport.js";

const CLIENT_CLOSE_CODE = 1000;

const SOCKET_CLOSING = 2;

export const webSocketTransport = (
  openSocket: (url: string) => WebSocket = (url) => new WebSocket(url)
) =>
  Layer.succeed(Transport, {
    open: (url) =>
      Effect.gen(function* openWebSocket() {
        const inbox = yield* Queue.unbounded<SocketEvent, Cause.Done>();

        const socket = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const opened = openSocket(url);

            opened.addEventListener("open", () => {
              Queue.offerUnsafe(inbox, SocketEvents.Opened({ url }));
            });
            opened.addEventListener("message", (event) => {
              Queue.offerUnsafe(
                inbox,
                SocketEvents.Received({
                  text: Predicate.isString(event.data) ? event.data : "",
                })
              );
            });
            opened.addEventListener("close", (event) => {
              Queue.offerUnsafe(
                inbox,
                SocketEvents.Closed({ code: event.code, reason: event.reason })
              );
              Queue.endUnsafe(inbox);
            });

            return opened;
          }),
          (opened) =>
            Effect.sync(() => {
              Queue.endUnsafe(inbox);

              if (opened.readyState < SOCKET_CLOSING) {
                Result.try(() => {
                  opened.close(CLIENT_CLOSE_CODE, "client closed");
                });
              }
            })
        );

        return {
          events: Stream.fromQueue(inbox),
          send: (text: string) =>
            Effect.sync(() => {
              Result.try(() => {
                socket.send(text);
              });
            }),
        };
      }),
  });
