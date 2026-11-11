import {
  FRAMES_PER_SECOND,
  PING_FRAME,
  PING_INTERVAL_MS,
} from "@nostakes/protocol";
import { Duration, Effect, Option, Queue, Result, Schema } from "effect";

import { pokerRoom } from "../../src/poker-room.js";
import type { PokerTypes } from "../../src/poker-room.js";
import { roomCodec } from "../../src/room-codec.js";
import type { ClientMessage, ServerMessage } from "../../src/room-codec.js";
import { decodedWindow, HeldArrival } from "./held-arrival.js";
import { socketUrl } from "./room-client.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export const pokerCodec = roomCodec(pokerRoom);

export type PokerServerMessage = ServerMessage<PokerTypes>;

export type PokerClientMessage = ClientMessage<PokerTypes>;

export const decodeServerFrame = Schema.decodeUnknownResult(
  Schema.fromJsonString(pokerCodec.server)
);

export const encodeClientFrame = Schema.encodeSync(
  Schema.fromJsonString(pokerCodec.client)
);

export const SEND_GAP_MS = Math.ceil(1000 / (FRAMES_PER_SECOND - 5));

export const wallClock = () => performance.timeOrigin + performance.now();

export interface Arrival {
  readonly text: string;
  readonly message: PokerServerMessage;
  readonly at: number;
}

export interface Closed {
  readonly code: number;
  readonly reason: string;
}

export interface PokerSocket {
  readonly label: string;
  readonly arrivals: Arrival[];
  readonly lastSeq: () => Option.Option<number>;
  readonly problems: string[];
  readonly signal: Queue.Queue<number>;
  readonly closed: () => Option.Option<Closed>;
  readonly sendText: (text: string) => Effect.Effect<number>;
  readonly send: (message: PokerClientMessage) => Effect.Effect<number>;
  readonly pingIfQuiet: Effect.Effect<void>;
  readonly disconnect: Effect.Effect<void>;
}

export class SocketFailed extends Schema.TaggedError<
  SocketFailed,
  { readonly brand: unique symbol }
>()("SocketFailed", { label: Schema.String, stage: Schema.String }) {
  override get message() {
    return `${this.label} could not ${this.stage}. Check that the local Worker is still running and the room exists.`;
  }
}

export const openSocket = (base: string, code: string, label: string) =>
  Effect.gen(function* openPokerSocket() {
    const signal = yield* Queue.unbounded<number>();
    const arrivals: Arrival[] = [];
    const window = decodedWindow();
    let lastSeq = Option.none<number>();
    const problems: string[] = [];
    let closed = Option.none<Closed>();
    let lastSent = 0;

    const socket = new WebSocket(socketUrl(base, code), {
      headers: { origin: TEST_ORIGIN },
    });

    socket.addEventListener("message", (event) => {
      const text = String(event.data);

      Result.match(decodeServerFrame(text), {
        onFailure: (error) => {
          problems.push(`${label} could not decode ${text}: ${error.message}`);
        },
        onSuccess: (message) => {
          const held = new HeldArrival(text, wallClock(), message, window);

          lastSeq = Option.orElse(held.seq, () => lastSeq);
          arrivals.push(held);
        },
      });

      Queue.offerUnsafe(signal, arrivals.length);
    });

    socket.addEventListener("close", (event) => {
      closed = Option.some({ code: event.code, reason: event.reason });
      window.releaseAll();
      Queue.offerUnsafe(signal, -1);
    });

    yield* Effect.callback<boolean, SocketFailed>((resume) => {
      socket.addEventListener("open", () => {
        resume(Effect.succeed(true));
      });
      socket.addEventListener("error", () => {
        resume(Effect.fail(new SocketFailed({ label, stage: "open" })));
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: Duration.seconds(10),
        orElse: () => Effect.fail(new SocketFailed({ label, stage: "open" })),
      })
    );

    const sendText = (text: string) =>
      Effect.gen(function* paceAndSend() {
        const wait = lastSent + SEND_GAP_MS - wallClock();

        if (wait > 0) {
          yield* Effect.sleep(Duration.millis(wait));
        }

        lastSent = wallClock();

        if (Option.isNone(closed)) {
          socket.send(text);
        }

        return lastSent;
      });

    const client: PokerSocket = {
      arrivals,
      closed: () => closed,
      disconnect: Effect.sync(() => {
        socket.close(1000, "done");
      }),
      label,
      lastSeq: () => lastSeq,
      pingIfQuiet: Effect.suspend(() =>
        Option.isNone(closed) && wallClock() - lastSent >= PING_INTERVAL_MS
          ? Effect.asVoid(sendText(PING_FRAME))
          : Effect.void
      ),
      problems,
      send: (message) => sendText(encodeClientFrame(message)),
      sendText,
      signal,
    };

    return client;
  });

export const awaitArrival = <A extends PokerServerMessage>(
  socket: PokerSocket,
  waitingFor: string,
  match: (message: PokerServerMessage) => message is A,
  from = 0
) =>
  Effect.gen(function* findArrival() {
    let checked = from;

    while (true) {
      for (; checked < socket.arrivals.length; checked += 1) {
        const message = socket.arrivals[checked]?.message;

        if (message !== undefined && match(message)) {
          return message;
        }
      }

      if (Option.isSome(socket.closed())) {
        return yield* new SocketFailed({
          label: socket.label,
          stage: `receive ${waitingFor} before the socket closed`,
        });
      }

      yield* Queue.take(socket.signal);
    }
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.seconds(10),
      orElse: () =>
        Effect.fail(
          new SocketFailed({
            label: socket.label,
            stage: `receive ${waitingFor} within 10 seconds`,
          })
        ),
    })
  );
