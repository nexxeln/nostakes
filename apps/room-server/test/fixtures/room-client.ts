import {
  CommandIdSchema,
  PING_FRAME,
  PING_INTERVAL_MS,
  RoomPassSchema,
} from "@nostakes/protocol";
import type { RoomCode, RoomPass, Seq } from "@nostakes/protocol";
import { Duration, Effect, Option, Queue, Schedule, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { roomCodec } from "../../src/room-codec.js";
import type { ClientMessage, ServerMessage } from "../../src/room-codec.js";
import { toyRoom } from "./toy-room.js";
import type { Profile, ToyMemberCommand, ToyTypes } from "./toy-room.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export const codec = roomCodec(toyRoom);

export type ToyServerMessage = ServerMessage<ToyTypes>;

type ToyClientMessage = ClientMessage<ToyTypes>;

const decodeServerFrame = Schema.decodeSync(
  Schema.fromJsonString(codec.server)
);

const encodeClientFrame = Schema.encodeSync(
  Schema.fromJsonString(codec.client)
);

export class ClientFailed extends Schema.TaggedError<
  ClientFailed,
  { readonly brand: unique symbol }
>()("ClientFailed", { label: Schema.String, waitingFor: Schema.String }) {}

export interface Closed {
  readonly code: number;
  readonly reason: string;
}

export interface RoomClient {
  readonly label: string;
  readonly frames: string[];
  readonly messages: ToyServerMessage[];
  readonly arrivals: number[];
  readonly closed: Effect.Effect<Option.Option<Closed>>;
  readonly send: (message: ToyClientMessage) => Effect.Effect<void>;
  readonly sendText: (text: string) => Effect.Effect<void>;
  readonly next: <A extends ToyServerMessage>(
    waitingFor: string,
    match: (message: ToyServerMessage) => message is A
  ) => Effect.Effect<A, ClientFailed>;
  readonly waitClosed: Effect.Effect<Closed, ClientFailed>;
  readonly disconnect: Effect.Effect<void>;
}

export const socketUrl = (base: string, code: string) => {
  const url = new URL(`/rooms/${code}/socket`, base);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
};

export const connect = (
  base: string,
  code: string,
  label: string,
  origin: string = TEST_ORIGIN
) =>
  Effect.gen(function* connectClient() {
    const inbox = yield* Queue.unbounded<ToyServerMessage>();
    const frames: string[] = [];
    const messages: ToyServerMessage[] = [];
    const arrivals: number[] = [];
    const consumed = new Set<number>();
    const closeSignal = yield* Queue.unbounded<Closed>();
    let closed = Option.none<Closed>();

    const socket = new WebSocket(socketUrl(base, code), {
      headers: { origin },
    });

    socket.addEventListener("message", (event) => {
      const frame = String(event.data);
      const message = decodeServerFrame(frame);

      arrivals.push(performance.now());
      frames.push(frame);
      messages.push(message);
      Queue.offerUnsafe(inbox, message);
    });

    socket.addEventListener("close", (event) => {
      const info = { code: event.code, reason: event.reason };

      closed = Option.some(info);
      Queue.offerUnsafe(closeSignal, info);
    });

    yield* Effect.callback<boolean, ClientFailed>((resume) => {
      socket.addEventListener("open", () => {
        resume(Effect.succeed(true));
      });
      socket.addEventListener("error", () => {
        resume(Effect.fail(new ClientFailed({ label, waitingFor: "open" })));
      });
    });

    const next = <A extends ToyServerMessage>(
      waitingFor: string,
      match: (message: ToyServerMessage) => message is A
    ) =>
      Effect.gen(function* waitForMessage() {
        while (true) {
          const index = messages.findIndex(
            (message, at) => !consumed.has(at) && match(message)
          );

          const found = messages[index];

          if (found !== undefined && match(found)) {
            consumed.add(index);

            return found;
          }

          yield* Queue.take(inbox);
        }
      }).pipe(
        Effect.timeoutOrElse({
          duration: Duration.seconds(10),
          orElse: () => Effect.fail(new ClientFailed({ label, waitingFor })),
        })
      );

    const client: RoomClient = {
      arrivals,
      closed: Effect.sync(() => closed),
      disconnect: Effect.sync(() => {
        socket.close(1000, "done");
      }),
      frames,
      label,
      messages,
      next,
      send: (message) =>
        Effect.sync(() => {
          socket.send(encodeClientFrame(message));
        }),
      sendText: (text) =>
        Effect.sync(() => {
          socket.send(text);
        }),
      waitClosed: Option.match(closed, {
        onNone: () =>
          Queue.take(closeSignal).pipe(
            Effect.timeoutOrElse({
              duration: Duration.seconds(10),
              orElse: () =>
                Effect.fail(new ClientFailed({ label, waitingFor: "close" })),
            })
          ),
        onSome: Effect.succeed,
      }),
    };

    return client;
  });

export const keepAlive = (client: RoomClient) =>
  client
    .sendText(PING_FRAME)
    .pipe(
      Effect.repeat(Schedule.spaced(Duration.millis(PING_INTERVAL_MS))),
      Effect.forkScoped,
      Effect.asVoid
    );

export const hello = (
  pass: RoomPass,
  after: Option.Option<Seq> = Option.none()
) => codec.client.cases.Hello.make({ after, token: pass.token });

export const command = (id: string, payload: ToyMemberCommand) =>
  codec.client.cases.Command.make({
    command: payload,
    id: CommandIdSchema.make(id),
  });

export const isWelcome = codec.server.guards.Welcome;

export type ToyWelcome = typeof codec.server.cases.Welcome.Type;

export const missedIn = (welcome: ToyWelcome) =>
  codec.catchUp.guards.Missed(welcome.catchUp) ? welcome.catchUp.events : [];

export const describeCatchUp = (welcome: ToyWelcome) =>
  codec.catchUp.match(welcome.catchUp, {
    Missed: ({ events, from }) => `Missed ${from}..${from + events.length - 1}`,
    Skipped: ({ from, to }) => `Skipped ${from}..${to}`,
    UpToDate: () => "UpToDate",
  });

export const isEvents = codec.server.guards.Events;

export const isPresence = codec.server.guards.Presence;

export const isClosing = codec.server.guards.Closing;

export const replyTo =
  (id: string) =>
  (
    message: ToyServerMessage
  ): message is typeof codec.server.cases.Reply.Type =>
    codec.server.guards.Reply(message) && message.id === id;

export const joinAs = (
  base: string,
  pass: RoomPass,
  label: string,
  after: Option.Option<Seq> = Option.none()
) =>
  Effect.gen(function* connectAndGreet() {
    const client = yield* connect(base, pass.code, label);

    yield* client.send(hello(pass, after));

    const welcome = yield* client.next("welcome", isWelcome);

    return { client, welcome };
  });

const postJson = (url: URL, body: Profile, origin = TEST_ORIGIN) =>
  HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeader("origin", origin),
    HttpClientRequest.bodyJsonUnsafe(body),
    HttpClient.execute
  );

export const createRoom = (base: string, profile: Profile) =>
  postJson(new URL("/rooms", base), profile).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(RoomPassSchema)),
    Effect.orDie
  );

export const joinRoom = (base: string, code: RoomCode, profile: Profile) =>
  postJson(new URL(`/rooms/${code}/members`, base), profile).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(RoomPassSchema)),
    Effect.orDie
  );

export const post = postJson;

export const openRoomWith = (base: string, names: readonly string[]) =>
  Effect.gen(function* openRoomWithMembers() {
    const [host = "Host", ...guests] = names;
    const hostPass = yield* createRoom(base, { avatar: "fox", name: host });
    const passes = [hostPass];

    for (const name of guests) {
      passes.push(
        yield* joinRoom(base, hostPass.code, { avatar: "owl", name })
      );
    }

    return passes;
  });

export const appliedSeqs = (client: RoomClient) =>
  client.messages.flatMap((message) => {
    if (isWelcome(message)) {
      const { catchUp } = message;

      return codec.catchUp.guards.Missed(catchUp)
        ? catchUp.events.map((_, index) => catchUp.from + index)
        : [];
    }

    return isEvents(message)
      ? message.events.map((_, index) => message.from + index)
      : [];
  });

export const lastSeq = (client: RoomClient) =>
  Math.max(
    0,
    ...client.messages.flatMap((message) => {
      if (isWelcome(message)) {
        return [message.seq];
      }

      return isEvents(message) ? [message.to] : [];
    })
  );
