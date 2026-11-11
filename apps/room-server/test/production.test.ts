import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Actions, Events, SeatIndexSchema } from "@nostakes/engine";
import {
  CLOSE_CODES,
  CommandIdSchema,
  HttpRefusalSchema,
  PROTOCOL_VERSION,
  StandingsRequestSchema,
} from "@nostakes/protocol";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  RoomSignalSchema,
  RoomViews,
  SeenEvents,
} from "@nostakes/room";
import type { Reaction, RoomSignal, SeenEvent } from "@nostakes/room";
import {
  Deferred,
  Effect,
  Option,
  Queue,
  Redacted,
  Schema,
  pipe,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { ADDRESS_LIMITS } from "../src/address-limits.js";
import { DEFAULT_SETTINGS, MemberCommandSchema } from "../src/poker-room.js";
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

test(
  "a join under a name someone in the room already holds, however it is written, is refused 409 with the room's own reason, and a name with a line break never reaches the room",
  Effect.gen(function* namesAtTheDoor() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Sam",
    });

    const members = new URL(`/rooms/${anaPass.code}/members`, base);

    const answered = (name: string) =>
      postJson(members, { avatar: "owl", name }).pipe(
        Effect.orDie,
        Effect.flatMap((response) =>
          response.json.pipe(
            Effect.orDie,
            Effect.map((body) => ({ body, status: response.status }))
          )
        )
      );

    const answers = yield* Effect.all([
      answered("sam"),
      answered("Ｓａｍ"),
      answered("Sam +0\n\nAna pays Sam 300"),
    ]);

    const second = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "owl",
      name: "Sam K",
    });

    expect({
      answers: answers.map(
        ({ body, status }) => `${status} ${JSON.stringify(body)}`
      ),
      second: second.code,
    }).toEqual({
      answers: [
        '409 {"refusal":"JoinRefused","rejection":{"_tag":"NameTaken","wanted":"sam"}}',
        '409 {"refusal":"JoinRefused","rejection":{"_tag":"NameTaken","wanted":"\uFF33\uFF41\uFF4D"}}',
        '400 {"refusal":"BadRequest"}',
      ],
      second: anaPass.code,
    });
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

test(
  "a removed member's sockets close as Removed, their pass is refused at the next Hello, and the standings route shows them their own line and nobody else's",
  Effect.gen(function* removal() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
    });

    const benPass = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "owl",
      name: "Ben",
    });

    const ana = yield* greet(base, anaPass, "ana");
    const ben = yield* greet(base, benPass, "ben");

    const removed = yield* ask(
      ana.socket,
      "remove-ben",
      Commands.RemoveMember.make({ player: benPass.player })
    );

    const closing = yield* awaitArrival(ben.socket, "removed", guards.Closing);

    const again = yield* openSocket(base, benPass.code, "ben again");

    yield* again.send(
      pokerCodec.client.cases.Hello.make({
        after: Option.none(),
        token: benPass.token,
      })
    );

    const refused = yield* awaitArrival(again, "refusal", guards.Closing);

    const standingsOf = (token: RoomPass["token"]) =>
      postJson(
        new URL(`/rooms/${anaPass.code}/standings`, base),
        Schema.encodeSync(StandingsRequestSchema)({ token })
      ).pipe(
        Effect.orDie,
        Effect.flatMap((response) =>
          response.json.pipe(
            Effect.orDie,
            Effect.map((body) => `${response.status} ${JSON.stringify(body)}`)
          )
        )
      );

    expect({
      closing: closing.reason,
      refused: refused.reason,
      reply: removed.result._tag,
      standings: [
        yield* standingsOf(benPass.token),
        yield* standingsOf(anaPass.token),
      ],
    }).toEqual({
      closing: "Removed",
      refused: "Removed",
      reply: "Accepted",
      standings: [
        `200 {"removed":{"balance":{"boughtIn":0,"cashedOut":0,"net":0,"player":"${benPass.player}"},"code":"${anaPass.code}","finishing":false,"people":[{"avatar":"owl","name":"Ben","player":"${benPass.player}"}],"player":"${benPass.player}","transfers":{"_tag":"None"}}}`,
        '409 {"refusal":"RoomOpen"}',
      ],
    });

    yield* ana.socket.disconnect;
    yield* again.disconnect;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

const Signals = RoomSignalSchema.cases;

const sendSignal = (socket: PokerSocket, signal: RoomSignal) =>
  socket.send(pokerCodec.client.cases.Signal.make({ signal }));

const peek = (socket: PokerSocket, looking: boolean) =>
  sendSignal(socket, Signals.Peeking.make({ looking }));

const react = (socket: PokerSocket, reaction: Reaction) =>
  sendSignal(socket, Signals.Reaction.make({ reaction }));

const reactionFrom =
  (from: PlayerId, reaction: Reaction) =>
  (
    message: PokerServerMessage
  ): message is typeof pokerCodec.server.cases.Signal.Type =>
    guards.Signal(message) &&
    message.from === from &&
    RoomSignalSchema.guards.Reaction(message.signal) &&
    message.signal.reaction === reaction;

const awaitReaction = (
  sockets: readonly PokerSocket[],
  from: PlayerId,
  reaction: Reaction
) =>
  pipe(
    sockets,
    Effect.forEach((socket) =>
      awaitArrival(socket, `${reaction} relayed`, reactionFrom(from, reaction))
    )
  );

const signalsSeen = (
  socket: PokerSocket,
  names: ReadonlyMap<PlayerId, string>
) =>
  socket.arrivals.flatMap(({ message }) =>
    guards.Signal(message)
      ? [
          `${names.get(message.from) ?? message.from} ${RoomSignalSchema.match(
            message.signal,
            {
              Peeking: ({ looking }) => (looking ? "peeks" : "stops peeking"),
              Reaction: ({ reaction }) => reaction,
            }
          )}`,
        ]
      : []
  );

test(
  "the production Worker relays a peek only from a seat still holding cards while peeks are shown, and a reaction from any member but one who has left",
  Effect.gen(function* pokerSignals() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
    });

    const guests = yield* pipe(
      ["Ben", "Cy", "Dee"],
      Effect.forEach((name) =>
        joinPokerRoom(base, anaPass.code, { avatar: "owl", name })
      )
    );

    const players = yield* pipe(
      [anaPass, ...guests],
      Effect.forEach((pass, index) =>
        greet(base, pass, ["ana", "ben", "cy", "dee"][index] ?? "guest").pipe(
          Effect.map(({ socket, welcome }) => ({ pass, socket, welcome }))
        )
      )
    );

    const [ana, ben, cy, dee] = players;

    if (
      ana === undefined ||
      ben === undefined ||
      cy === undefined ||
      dee === undefined
    ) {
      return;
    }

    const names = new Map([
      [ana.pass.player, "Ana"],
      [ben.pass.player, "Ben"],
      [cy.pass.player, "Cy"],
      [dee.pass.player, "Dee"],
    ]);

    const seated = [
      { player: ana, seat: 0 },
      { player: ben, seat: 2 },
      { player: dee, seat: 4 },
    ];

    for (const { player, seat } of seated) {
      yield* ask(
        player.socket,
        `sit-${seat}`,
        Commands.RequestSeat.make({
          buyIn: ChipAmountSchema.make(100),
          seat: SeatIndexSchema.make(seat),
        })
      );
    }

    const chosen = RoomViews.$is("Open")(ana.welcome.view)
      ? Option.some(ana.welcome.view.settings)
      : Option.none();

    for (const settings of Option.toArray(chosen)) {
      yield* ask(
        ana.socket,
        "plain",
        Commands.ChangeSettings.make({
          settings: { ...settings, shuffle: "Plain" },
        })
      );
    }

    yield* ask(ana.socket, "start", Commands.StartGame.make({}));

    const deal = yield* awaitArrival(ana.socket, "the deal", isDeal);

    const toAct = RoomViews.$is("Open")(deal.view)
      ? deal.view.hand.pipe(Option.flatMap(({ toAct: seat }) => seat))
      : Option.none();

    const folder =
      seated.find(({ seat }) => Option.contains(toAct, seat))?.player ?? ana;

    const holder =
      seated.find(({ player }) => player !== folder)?.player ?? ben;

    const others = (sender: typeof ana) =>
      players.filter((player) => player !== sender).map(({ socket }) => socket);

    yield* peek(cy.socket, true);
    yield* react(cy.socket, "Clap");
    yield* awaitReaction(others(cy), cy.pass.player, "Clap");

    yield* ask(
      folder.socket,
      "fold",
      Commands.Act.make({ action: Actions.Fold() })
    );
    yield* peek(folder.socket, true);
    yield* react(folder.socket, "Wow");
    yield* awaitReaction(others(folder), folder.pass.player, "Wow");

    yield* peek(holder.socket, true);
    yield* peek(holder.socket, false);
    yield* react(holder.socket, "Laugh");
    yield* awaitReaction(others(holder), holder.pass.player, "Laugh");

    for (const settings of Option.toArray(chosen)) {
      yield* ask(
        ana.socket,
        "hide peeks",
        Commands.ChangeSettings.make({
          settings: { ...settings, peeking: false, shuffle: "Plain" },
        })
      );
    }

    yield* peek(holder.socket, true);
    yield* react(holder.socket, "Fire");
    yield* awaitReaction(others(holder), holder.pass.player, "Fire");

    yield* ask(cy.socket, "leave", Commands.LeaveRoom.make({}));
    yield* react(cy.socket, "Cry");
    yield* ask(cy.socket, "after leaving", Commands.SitIn.make({}));
    yield* react(ana.socket, "Cry");
    yield* awaitReaction(others(ana), ana.pass.player, "Cry");

    const relayed = [
      ["Cy", "Cy Clap"],
      [names.get(folder.pass.player), `${names.get(folder.pass.player)} Wow`],
      [names.get(holder.pass.player), `${names.get(holder.pass.player)} peeks`],
      [
        names.get(holder.pass.player),
        `${names.get(holder.pass.player)} stops peeking`,
      ],
      [names.get(holder.pass.player), `${names.get(holder.pass.player)} Laugh`],
      [names.get(holder.pass.player), `${names.get(holder.pass.player)} Fire`],
      ["Ana", "Ana Cry"],
    ];

    expect(Option.isSome(toAct)).toBe(true);
    expect(folder).not.toBe(holder);

    for (const { pass, socket } of players) {
      expect(signalsSeen(socket, names)).toEqual(
        relayed.flatMap(([sender, seen]) =>
          sender === names.get(pass.player) ? [] : [seen]
        )
      );
      expect(socket.problems).toEqual([]);
    }

    for (const { socket } of players) {
      yield* socket.disconnect;
    }
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

    const older = yield* closeAfterHello(
      base,
      pass,
      `{"_tag":"Hello","after":null,"protocol":${PROTOCOL_VERSION - 1},"token":"${token}"}`
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
    expect(older).toEqual({
      closed: Option.some({
        code: CLOSE_CODES.ClientOutdated,
        reason: "ClientOutdated",
      }),
      frames: ['{"_tag":"Closing","reason":"ClientOutdated"}'],
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

const carries =
  (tag: SeenEvent["_tag"]) =>
  (
    message: PokerServerMessage
  ): message is typeof pokerCodec.server.cases.Events.Type =>
    guards.Events(message) && message.events.some(({ _tag }) => _tag === tag);

const QUIET_SETTINGS = {
  ...DEFAULT_SETTINGS,
  betweenHandsSeconds: 0,
  pauseWhenAwaySeconds: 1,
  runChoiceSeconds: 1,
  showdownSeconds: 1,
  shuffle: "Plain" as const,
  sitOutAfterTimeouts: 0,
  timeBankSeconds: 0,
  turnSeconds: 1,
};

test(
  "the production Worker pauses a game once its seated players have all closed their sockets, keeps a spectator's socket from holding it open, writes nothing while it is quiet, and deals again when a seated player is back",
  Effect.gen(function* quietTable() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const anaPass = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
      settings: QUIET_SETTINGS,
    });

    const benPass = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "owl",
      name: "Ben",
    });

    const cyPass = yield* joinPokerRoom(base, anaPass.code, {
      avatar: "cat",
      name: "Cy",
    });

    const ana = yield* greet(base, anaPass, "ana");
    const ben = yield* greet(base, benPass, "ben");
    const cy = yield* greet(base, cyPass, "cy");

    for (const [socket, seat] of [
      [ana.socket, 0],
      [ben.socket, 1],
    ] as const) {
      yield* ask(
        socket,
        `sit-${seat}`,
        Commands.RequestSeat.make({
          buyIn: ChipAmountSchema.make(100),
          seat: SeatIndexSchema.make(seat),
        })
      );
    }

    yield* ask(ana.socket, "start", Commands.StartGame.make({}));
    yield* awaitArrival(cy.socket, "the first deal", carries("Table"));
    yield* ana.socket.disconnect;
    yield* ben.socket.disconnect;

    const unattended = cy.socket.arrivals.length;

    yield* awaitArrival(
      cy.socket,
      "the table left unattended",
      carries("TableUnattended")
    );
    yield* awaitArrival(
      cy.socket,
      "the table going quiet",
      carries("TableWentQuiet"),
      unattended
    );

    const quietAt = cy.socket.arrivals.length;

    yield* Effect.sleep("3 seconds");
    yield* cy.socket.pingIfQuiet;

    const whileQuiet = cy.socket.arrivals
      .slice(quietAt)
      .filter(({ message }) => guards.Events(message));

    const benBack = yield* greet(base, benPass, "ben again");

    yield* awaitArrival(
      cy.socket,
      "the table attended again",
      carries("TableAttended"),
      quietAt
    );

    const resumed = yield* awaitArrival(
      benBack.socket,
      "the next deal",
      isDeal
    );

    expect({
      dealtTo: dealtCards(resumed).length,
      eventsWhileQuiet: whileQuiet.length,
      problems: [...cy.socket.problems, ...benBack.socket.problems],
      quietInWelcome: RoomViews.$is("Open")(benBack.welcome.view)
        ? benBack.welcome.view.attendance._tag
        : "Closed",
    }).toEqual({
      dealtTo: 2,
      eventsWhileQuiet: 0,
      problems: [],
      quietInWelcome: "Quiet",
    });

    yield* cy.socket.disconnect;
    yield* benBack.socket.disconnect;
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
