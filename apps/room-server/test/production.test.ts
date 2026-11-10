import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Events, SeatIndexSchema } from "@nostakes/engine";
import {
  CLOSE_CODES,
  CommandIdSchema,
  HttpRefusalSchema,
  PROTOCOL_VERSION,
} from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import { ChipAmountSchema, RoomViews, SeenEvents } from "@nostakes/room";
import { Deferred, Effect, Option, Queue, Redacted, Schema } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { ADDRESS_LIMITS } from "../src/address-limits.js";
import { MemberCommandSchema } from "../src/poker-room.js";
import type { MemberCommand } from "../src/poker-room.js";
import {
  createPokerRoom,
  joinPokerRoom,
  postJson,
} from "./fixtures/poker-http.js";
import {
  awaitArrival,
  openSocket,
  pokerCodec,
} from "./fixtures/poker-socket.js";
import type {
  PokerServerMessage,
  PokerSocket,
} from "./fixtures/poker-socket.js";
import { ProductionStack, TEST_BUILD } from "./fixtures/production-stack.js";
import { socketUrl } from "./fixtures/room-client.js";
import { TEST_ORIGIN } from "./fixtures/toy-worker.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_production_${process.pid}`,
});

const deployed = beforeAll(deploy(ProductionStack));

afterAll(destroy(ProductionStack));

const Commands = MemberCommandSchema.cases;

const { guards } = pokerCodec.server;

const greet = (base: string, pass: RoomPass, label: string) =>
  Effect.gen(function* connectAndGreet() {
    const socket = yield* openSocket(base, pass.code, label);

    yield* socket.send(
      pokerCodec.client.cases.Hello.make({
        after: Option.none(),
        token: pass.token,
      })
    );

    const welcome = yield* awaitArrival(socket, "welcome", guards.Welcome);

    return { socket, welcome };
  });

const ask = (socket: PokerSocket, id: string, command: MemberCommand) =>
  Effect.gen(function* sendAndAwaitReply() {
    yield* socket.send(
      pokerCodec.client.cases.Command.make({
        command,
        id: CommandIdSchema.make(id),
      })
    );

    return yield* awaitArrival(
      socket,
      `reply ${id}`,
      (message): message is typeof pokerCodec.server.cases.Reply.Type =>
        guards.Reply(message) && message.id === id
    );
  });

const dealtCards = (message: PokerServerMessage) =>
  guards.Events(message)
    ? message.events
        .flatMap((event) =>
          SeenEvents.$is("Table")(event) &&
          Events.$is("HoleCardsDealt")(event.event)
            ? [{ cards: event.event.cards.length, seat: event.event.seat }]
            : []
        )
        .toSorted((left, right) => left.seat - right.seat)
    : [];

const isDeal = (
  message: PokerServerMessage
): message is typeof pokerCodec.server.cases.Events.Type =>
  dealtCards(message).length > 0;

test(
  "the production Worker opens a room at the default settings with a checked shuffle, refuses a foreign origin, and, switched to a plain shuffle so no beacon is fetched, deals a live shuffle to two seats over sockets",
  Effect.gen(function* production() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
    });

    const foreign = yield* postJson(
      new URL("/rooms", base),
      { avatar: "fox", name: "Eve" },
      "https://elsewhere.example"
    ).pipe(Effect.orDie);

    const benPass = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "owl",
      name: "Ben",
    });

    const ana = yield* greet(base, anaPass, "ana");
    const ben = yield* greet(base, benPass, "ben");

    const settings = RoomViews.$is("Open")(ana.welcome.view)
      ? Option.some(ana.welcome.view.settings)
      : Option.none();

    yield* ask(
      ana.socket,
      "sit-ana",
      Commands.RequestSeat.make({
        buyIn: ChipAmountSchema.make(100),
        seat: SeatIndexSchema.make(0),
      })
    );
    yield* ask(
      ben.socket,
      "sit-ben",
      Commands.RequestSeat.make({
        buyIn: ChipAmountSchema.make(100),
        seat: SeatIndexSchema.make(4),
      })
    );

    for (const chosen of Option.toArray(settings)) {
      yield* ask(
        ana.socket,
        "plain",
        Commands.ChangeSettings.make({
          settings: { ...chosen, shuffle: "Plain" },
        })
      );
    }

    yield* ask(ana.socket, "start", Commands.StartGame.make({}));

    const anaDeal = yield* awaitArrival(ana.socket, "the deal", isDeal);
    const benDeal = yield* awaitArrival(ben.socket, "the deal", isDeal);

    expect(foreign.status).toBe(403);
    expect(
      settings.pipe(
        Option.map(({ betweenHandsSeconds, timeBankSeconds, turnSeconds }) => [
          turnSeconds,
          timeBankSeconds,
          betweenHandsSeconds,
        ])
      )
    ).toEqual(Option.some([30, 60, 5]));
    expect(settings.pipe(Option.map(({ shuffle }) => shuffle))).toEqual(
      Option.some("Checked")
    );
    expect(dealtCards(anaDeal)).toEqual([
      { cards: 2, seat: 0 },
      { cards: 0, seat: 4 },
    ]);
    expect(dealtCards(benDeal)).toEqual([
      { cards: 0, seat: 0 },
      { cards: 2, seat: 4 },
    ]);
    expect([...ana.socket.problems, ...ben.socket.problems]).toEqual([]);

    yield* ana.socket.disconnect;
    yield* ben.socket.disconnect;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

const closeAfterHello = (base: string, pass: RoomPass, hello: string) =>
  Effect.gen(function* helloThenClose() {
    const socket = yield* openSocket(base, pass.code, "outdated");

    yield* socket.sendText(hello);

    while (Option.isNone(socket.closed())) {
      yield* Queue.take(socket.signal);
    }

    return {
      closed: socket.closed(),
      frames: socket.arrivals.map(({ text }) => text),
    };
  });

test(
  "the production Worker names the web build it serves in each welcome, and turns away a client on another protocol with a reason it can read",
  Effect.gen(function* versions() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const pass = yield* createPokerRoom(base, { avatar: "fox", name: "Ana" });
    const ana = yield* greet(base, pass, "ana");
    const token = Redacted.value(pass.token);

    const unversioned = yield* closeAfterHello(
      base,
      pass,
      `{"_tag":"Hello","after":null,"token":"${token}"}`
    );

    const newer = yield* closeAfterHello(
      base,
      pass,
      `{"_tag":"Hello","after":null,"protocol":${PROTOCOL_VERSION + 1},"token":"${token}"}`
    );

    expect(ana.welcome.build).toEqual(Option.some(TEST_BUILD));
    expect(unversioned).toEqual({
      closed: Option.some({
        code: CLOSE_CODES.ProtocolViolation,
        reason: "ProtocolViolation",
      }),
      frames: ['{"_tag":"Closing","reason":"ProtocolViolation"}'],
    });
    expect(newer).toEqual({
      closed: Option.some({
        code: CLOSE_CODES.ServerOutdated,
        reason: "ServerOutdated",
      }),
      frames: ['{"_tag":"Closing","reason":"ServerOutdated"}'],
    });

    yield* ana.socket.disconnect;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

const createFrom = (base: string, address: string) =>
  HttpClientRequest.post(new URL("/rooms", base)).pipe(
    HttpClientRequest.setHeaders({
      "cf-connecting-ip": address,
      origin: TEST_ORIGIN,
    }),
    HttpClientRequest.bodyJsonUnsafe({ avatar: "fox", name: "Ana" }),
    HttpClient.execute,
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.map((body) => ({
          body,
          retryAfter: response.headers["retry-after"],
          status: response.status,
        }))
      )
    ),
    Effect.orDie
  );

test(
  "the production Worker lets one address open only its share of rooms a minute and answers the next with a TooManyRequests refusal that says how long to wait, while another address still gets in",
  Effect.gen(function* rateLimited() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const { limit } = ADDRESS_LIMITS.create;

    const allowed = yield* Effect.all(
      Array.from({ length: limit }, () => createFrom(base, "198.51.100.7"))
    );

    const refused = yield* createFrom(base, "198.51.100.7");
    const elsewhere = yield* createFrom(base, "198.51.100.8");

    expect(allowed.map(({ status }) => status)).toEqual(
      Array.from({ length: limit }, () => 201)
    );
    expect(refused).toEqual({
      body: { refusal: "TooManyRequests", retryAfterSeconds: 60 },
      retryAfter: "60",
      status: 429,
    });
    expect(Schema.decodeUnknownOption(HttpRefusalSchema)(refused.body)).toEqual(
      Option.some({ refusal: "TooManyRequests", retryAfterSeconds: 60 })
    );
    expect(elsewhere.status).toBe(201);
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

const probeSocket = (base: string, address: string) =>
  HttpClientRequest.get(new URL("/rooms/K7P2XZ/socket", base)).pipe(
    HttpClientRequest.setHeaders({
      "cf-connecting-ip": address,
      origin: TEST_ORIGIN,
    }),
    HttpClient.execute,
    Effect.map((response) => response.status),
    Effect.orDie
  );

const closeOfSocket = (base: string, address: string) =>
  Effect.gen(function* awaitSocketClose() {
    const closed = yield* Deferred.make<{ code: number; reason: string }>();

    const socket = new WebSocket(socketUrl(base, "K7P2XZ"), {
      headers: { "cf-connecting-ip": address, origin: TEST_ORIGIN },
    });

    socket.addEventListener("close", (event) => {
      Deferred.doneUnsafe(
        closed,
        Effect.succeed({ code: event.code, reason: event.reason })
      );
    });

    return yield* Deferred.await(closed);
  });

test(
  "the production Worker closes a socket as TooManySockets once its address has spent the minute's connections",
  Effect.gen(function* socketsLimited() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const { limit } = ADDRESS_LIMITS.connect;

    const fresh = yield* closeOfSocket(base, "198.51.100.9");

    const probes = yield* Effect.all(
      Array.from({ length: limit - 1 }, () =>
        probeSocket(base, "198.51.100.9")
      ),
      { concurrency: 8 }
    );

    const spent = yield* closeOfSocket(base, "198.51.100.9");

    expect(fresh).toEqual({ code: CLOSE_CODES.NotFound, reason: "NotFound" });
    expect(new Set(probes)).toEqual(new Set([426]));
    expect(spent).toEqual({
      code: CLOSE_CODES.TooManySockets,
      reason: "TooManySockets",
    });
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);
