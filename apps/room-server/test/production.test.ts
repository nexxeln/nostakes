import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { Events, SeatIndexSchema } from "@nostakes/engine";
import { CommandIdSchema } from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import { ChipAmountSchema, RoomViews, SeenEvents } from "@nostakes/room";
import { Effect, Option } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

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
import { ProductionStack } from "./fixtures/production-stack.js";

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
