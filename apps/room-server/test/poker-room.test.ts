import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  CardSchema,
  ChipsSchema,
  Events,
  SeatIndexSchema,
  SevenDeuces,
} from "@nostakes/engine";
import { PlayerIdSchema } from "@nostakes/protocol";
import {
  Actors,
  ChipAmountSchema,
  Deadlines,
  RoomCommands,
  RoomEvents,
  SealedDealSources,
  RoomSettingsSchema,
  RoomViews,
  SeenEvents,
  millis,
} from "@nostakes/room";
import type { RoomView } from "@nostakes/room";
import { Option, Result, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  DEAL_SHUFFLE_BYTES,
  DEFAULT_SETTINGS,
  MemberCommandSchema,
  pokerRoom,
} from "../src/poker-room.js";
import {
  hostRoom,
  loadRoom,
  Origins,
  ROOM_RETENTION_MS,
  StandingsAnswers,
} from "../src/room-host.js";
import { MAX_MEMBERS } from "../src/room-rpc.js";
import { ana, ben, cy, openPokerHost } from "./fixtures/poker-host.js";

const Commands = MemberCommandSchema.cases;

const encodeSettings = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomSettingsSchema))
);

const welcomeView = (
  room: ReturnType<typeof openPokerHost>,
  player: typeof ana,
  at: number
): RoomView => {
  const frame = room.decodeFrame(room.welcome(player, Option.none(), at));

  if (!room.host.codec.server.guards.Welcome(frame)) {
    throw new Error(`expected a welcome, got ${frame._tag}`);
  }

  return frame.view;
};

const openView = (view: RoomView) => {
  if (!RoomViews.$is("Open")(view)) {
    throw new Error(`expected an open room, got ${view._tag}`);
  }

  return view;
};

const seatTwoPlayers = (room: ReturnType<typeof openPokerHost>) => {
  room.join(ben, 1001, "Ben");
  room.send(
    ana,
    "sit-ana",
    1002,
    Commands.RequestSeat.make({
      buyIn: DEFAULT_SETTINGS.buyIn.min,
      seat: SeatIndexSchema.make(0),
    })
  );
  room.send(
    ben,
    "sit-ben",
    1003,
    Commands.RequestSeat.make({
      buyIn: DEFAULT_SETTINGS.buyIn.max,
      seat: SeatIndexSchema.make(1),
    })
  );
};

const bytesForDeck = (leading: readonly number[]) => {
  const deck = [
    ...leading,
    ...Array.from({ length: 52 }, (_, card) => card).filter(
      (card) => !leading.includes(card)
    ),
  ];

  const cards = Array.from({ length: 52 }, (_, card) => card);
  const bytes: number[] = [];

  for (let top = 51; top > 0; top -= 1) {
    const drawn = cards.indexOf(deck[top] ?? 0);
    const held = cards[top] ?? 0;

    bytes.push(drawn);
    cards[top] = cards[drawn] ?? 0;
    cards[drawn] = held;
  }

  return bytes;
};

const SEVEN_DEUCE_TO_THE_BIG_BLIND = bytesForDeck([22, 51, 0, 50]);

const plainRoom = {
  avatar: "fox",
  name: "Ana",
  settings: { ...DEFAULT_SETTINGS, shuffle: "Plain" as const },
};

const hashOf = (index: number) => index.toString(16).padStart(64, "0");

const hashOfHexName = (name: string) =>
  Result.getOrThrow(Hex.decode(name.padEnd(64, "0")));

describe("the poker room adapter", () => {
  it("opens a room without settings at the agreed defaults, as members see them on the wire", () => {
    const room = openPokerHost({ avatar: "fox", name: "Ana" });
    const view = openView(welcomeView(room, ana, 1000));

    expect(encodeSettings(view.settings)).toBe(
      '{"approval":{"chips":false,"joins":false,"seats":false},"betweenHandsSeconds":5,"buyIn":{"max":400,"min":40},"dealing":"Automatic","knockSeconds":300,"leavingMidHand":"ActedFor","locked":false,"moments":"All","pauseWhenAwaySeconds":120,"peeking":true,"runChoiceSeconds":15,"seats":9,"showdownSeconds":15,"shuffle":"Checked","sitOutAfterTimeouts":1,"table":{"allInHands":"FaceUp","ante":{"_tag":"NoAnte"},"bigBlind":2,"blindPosting":"HomeGame","bombPot":{"_tag":"NoBombPots"},"maxRuns":1,"rabbitHunt":false,"rabbitHunters":"DealtIn","runCount":"Vote","sevenDeuce":{"_tag":"NoBounty"},"showdown":"Interactive","showdownOrder":"RiverAggressor","smallBlind":1,"straddle":{"button":false,"underTheGun":0},"straddleSize":"Doubling","voluntaryShows":"EitherCard"},"timeBankRefill":{"_tag":"NoRefill"},"timeBankSeconds":60,"topUps":"UpToMax","turnSeconds":30}'
    );
  });

  it("opens a room with the settings the request carries", () => {
    const settings = Schema.decodeSync(RoomSettingsSchema)({
      ...Schema.encodeSync(RoomSettingsSchema)(DEFAULT_SETTINGS),
      turnSeconds: 7,
    });

    const room = openPokerHost({ avatar: "fox", name: "Ana", settings });

    expect(openView(welcomeView(room, ana, 1000)).settings.turnSeconds).toBe(7);
  });

  it("decodes a member command without by or at from a client frame, and stamps it with the member and the server time", () => {
    const room = openPokerHost({ avatar: "fox", name: "Ana" });

    const decoded = room.host.codec.decodeClientFrame(
      '{"_tag":"Command","id":"c1","command":{"_tag":"RequestSeat","buyIn":100,"seat":3}}'
    );

    const frame = Result.getOrThrow(decoded);

    if (!room.host.codec.client.guards.Command(frame)) {
      throw new Error("expected a command frame");
    }

    expect(pokerRoom.stamp(ana, 4242, frame.command)).toEqual(
      RoomCommands.RequestSeat({
        at: millis(4242),
        buyIn: ChipAmountSchema.make(100),
        by: Actors.Member({ player: ana }),
        seat: SeatIndexSchema.make(3),
      })
    );

    expect(
      Result.isFailure(
        room.host.codec.decodeClientFrame(
          '{"_tag":"Command","id":"c2","command":{"_tag":"Deal","shuffleBytes":"AAAA"}}'
        )
      )
    ).toBe(true);
  });

  it("deals a sealed hand from the beacon round it fetched, and from fresh bytes when it fetched none", () => {
    const due = Deadlines.SealedDealDue({ at: millis(9000), round: 42 });
    const signature = Uint8Array.of(1, 2, 3);
    const bytes = Uint8Array.of(4, 5, 6);

    expect(pokerRoom.beaconRoundFor(due)).toEqual(Option.some(42));
    expect(
      pokerRoom.beaconRoundFor(Deadlines.DealDue({ at: millis(9000) }))
    ).toEqual(Option.none());
    expect(
      pokerRoom.serverCommand(due, 9001, bytes, Option.some(signature))
    ).toEqual(
      RoomCommands.DealSealed({
        at: millis(9001),
        by: Actors.Server(),
        source: SealedDealSources.FromBeacon({ round: 42, signature }),
      })
    );
    expect(pokerRoom.serverCommand(due, 9001, bytes, Option.none())).toEqual(
      RoomCommands.DealSealed({
        at: millis(9001),
        by: Actors.Server(),
        source: SealedDealSources.BeaconUnavailable({ shuffleBytes: bytes }),
      })
    );
  });

  it("asks for 128 shuffle bytes for a due deal and none for a clock, and expires a clock at the deadline it names", () => {
    expect(DEAL_SHUFFLE_BYTES).toBe(128);
    expect(pokerRoom.entropyFor(Deadlines.DealDue({ at: millis(5) }))).toBe(
      128
    );
    expect(
      pokerRoom.entropyFor(
        Deadlines.TurnClock({ at: millis(5), seat: SeatIndexSchema.make(2) })
      )
    ).toBe(0);
    expect(
      pokerRoom.entropyFor(Deadlines.RunChoiceClock({ at: millis(5) }))
    ).toBe(0);

    const expiry = pokerRoom.serverCommand(
      Deadlines.TurnClock({
        at: millis(31_000),
        seat: SeatIndexSchema.make(2),
      }),
      31_007,
      new Uint8Array(),
      Option.none()
    );

    expect(expiry).toEqual(
      RoomCommands.ExpireClock({
        at: millis(31_007),
        by: Actors.Server(),
        deadline: millis(31_000),
      })
    );
  });

  it("deals a running game from the bytes it is given when the deal is due", () => {
    const room = openPokerHost(plainRoom);

    seatTwoPlayers(room);
    room.send(ana, "start", 1004, Commands.StartGame.make({}));

    const due = Option.getOrThrow(room.host.nextDeadline());

    expect(due.at).toBe(1004);
    expect(room.runDue(1004).pipe(Option.map(({ note }) => note._tag))).toEqual(
      Option.some("Committed")
    );

    const view = openView(welcomeView(room, ben, 1005));

    expect(view.hand.pipe(Option.map((hand) => hand.handNumber))).toEqual(
      Option.some(1)
    );
    expect(view.holeCards).toHaveLength(2);
  });

  it("pays a seven-deuce bounty in the batch that ends the hand, and a watcher who catches up reads the show and the payment after the hand's end", () => {
    const room = openPokerHost({
      ...plainRoom,
      settings: {
        ...plainRoom.settings,
        table: {
          ...plainRoom.settings.table,
          sevenDeuce: SevenDeuces.Bounty({ amount: ChipsSchema.make(30) }),
        },
      },
    });

    room.join(cy, 1000, "Cy");
    seatTwoPlayers(room);
    room.send(ana, "start", 1004, Commands.StartGame.make({}));

    const before = room.host.snapshot().headSeq;

    room.runDue(1004, (size) =>
      Uint8Array.from({ length: size }, (_, index) =>
        index < SEVEN_DEUCE_TO_THE_BIG_BLIND.length
          ? (SEVEN_DEUCE_TO_THE_BIG_BLIND[index] ?? 0)
          : 0
      )
    );
    room.send(ana, "fold", 1006, Commands.Act.make({ action: Actions.Fold() }));

    const missed = room.decodeFrame(
      room.welcome(cy, Option.some(before), 1007)
    );

    const tableEvents =
      room.host.codec.server.guards.Welcome(missed) &&
      room.host.codec.catchUp.guards.Missed(missed.catchUp)
        ? missed.catchUp.events.flatMap((event) =>
            SeenEvents.$is("Table")(event) ? [event.event] : []
          )
        : [];

    expect(tableEvents.slice(-3)).toEqual([
      Events.HandEnded({ handNumber: 1 }),
      Events.CardsShown({
        cards: [CardSchema.make(22), CardSchema.make(0)],
        seat: SeatIndexSchema.make(1),
      }),
      Events.BountyPaid({
        payers: [
          { amount: ChipsSchema.make(30), seat: SeatIndexSchema.make(0) },
        ],
        seat: SeatIndexSchema.make(1),
      }),
    ]);

    const view = openView(welcomeView(room, cy, 1008));

    expect(
      view.seats
        .map((seat) =>
          Option.getOrUndefined(
            seat.occupant.pipe(Option.map((occupant) => occupant.stack))
          )
        )
        .slice(0, 2)
    ).toEqual([9, 431]);
  });

  it("serves the settlement to a member of a closed room and refuses every command after it", () => {
    const room = openPokerHost(plainRoom);

    seatTwoPlayers(room);
    room.send(ana, "start", 1004, Commands.StartGame.make({}));
    room.runDue(1004);

    const dealt = openView(welcomeView(room, ana, 1005));

    const toAct = Option.getOrThrow(
      dealt.hand.pipe(Option.flatMap((hand) => hand.toAct))
    );

    const folder = toAct === 0 ? ana : ben;

    room.send(
      folder,
      "fold",
      1006,
      Commands.Act.make({ action: Actions.Fold() })
    );
    room.send(ana, "close", 1007, Commands.CloseRoom.make({}));

    const closed = welcomeView(room, ben, 1008);

    if (!RoomViews.$is("Closed")(closed)) {
      throw new Error(`expected a closed room, got ${closed._tag}`);
    }

    const nets = closed.settlement.balances.map((row) => row.net);
    const moved = closed.settlement.transfers.map((each) => each.amount);

    expect(nets.reduce((total, net) => total + net, 0)).toBe(0);
    expect(moved).toHaveLength(1);
    expect(room.host.nextDeadline()).toEqual(Option.none());

    const refused = room.send(ben, "sit-in", 1009, Commands.SitIn.make({}));

    expect(refused.reply._tag).toBe("Rejected");
    expect(
      room.host.codec.reply.guards.Rejected(refused.reply)
        ? refused.reply.rejection._tag
        : "none"
    ).toBe("RoomIsClosed");
  });

  it("closes a removed member's sockets as Removed without sending them the batch that removed them, and gives them only their own line", () => {
    const room = openPokerHost(plainRoom);

    seatTwoPlayers(room);

    const anaSees = room.watch(ana);
    const benSees = room.watch(ben);

    const removed = room.send(
      ana,
      "remove-ben",
      1010,
      Commands.RemoveMember.make({ player: ben })
    );

    const anaGot = anaSees.frames.map((frame) => room.decodeFrame(frame));

    expect({
      anaSawRemoval: anaGot.some(
        (frame) =>
          room.host.codec.server.guards.Events(frame) &&
          frame.events.some(({ _tag }) => _tag === "MemberRemoved")
      ),
      benFrames: benSees.frames.length,
      closed: room.closed,
      line: pokerRoom.revokedView(room.host.snapshot().state, ben, 1011, false)
        .balance,
      reply: removed.reply._tag,
      revoked: room.host.revoked(ben),
    }).toStrictEqual({
      anaSawRemoval: true,
      benFrames: 0,
      closed: [{ player: ben, reason: "Removed" }],
      line: {
        boughtIn: DEFAULT_SETTINGS.buyIn.max,
        cashedOut: DEFAULT_SETTINGS.buyIn.max,
        net: 0,
        player: ben,
      },
      reply: "Accepted",
      revoked: true,
    });
  });

  it("replays a stored log to the live state, and refuses a log that does not open the room", () => {
    const room = openPokerHost({ avatar: "fox", name: "Ana" });

    seatTwoPlayers(room);
    room.send(ana, "start", 1004, Commands.StartGame.make({}));
    room.runDue(1004);

    const stored = room.memory.storage
      .eventsAfter(0)
      .map((row) => room.host.codec.decodeEvent(row.event));

    expect(pokerRoom.replay(stored)).toStrictEqual(room.host.snapshot().state);
    expect(() => pokerRoom.replay(stored.slice(1))).toThrow(
      "must start with RoomOpened, and this one starts with MemberJoined"
    );
  });
});

const holeCardsIn = (room: ReturnType<typeof openPokerHost>, frame: string) => {
  const message = room.decodeFrame(frame);

  return room.host.codec.server.guards.Welcome(message) &&
    room.host.codec.catchUp.guards.Missed(message.catchUp)
    ? message.catchUp.events.flatMap((event) =>
        SeenEvents.$is("Table")(event) &&
        Events.$is("HoleCardsDealt")(event.event)
          ? [{ cards: event.event.cards, seat: event.event.seat }]
          : []
      )
    : [];
};

const eventTags = (room: ReturnType<typeof openPokerHost>, from: number) =>
  room.memory.storage
    .eventsAfter(from)
    .map((row) => room.host.codec.decodeEvent(row.event))
    .map((event) =>
      RoomEvents.$is("Table")(event) ? event.event._tag : event._tag
    );

const answerEveryDeadline = (room: ReturnType<typeof openPokerHost>) => {
  let alarms = 0;

  for (
    let deadline = room.host.nextDeadline();
    Option.isSome(deadline) && alarms < 200;
    deadline = room.host.nextDeadline()
  ) {
    room.runDue(deadline.value.at);
    alarms += 1;
  }

  return alarms;
};

describe("a table nobody is at", () => {
  const awayRoom = {
    avatar: "fox",
    name: "Ana",
    settings: {
      ...DEFAULT_SETTINGS,
      pauseWhenAwaySeconds: 60,
      shuffle: "Plain" as const,
      sitOutAfterTimeouts: 0,
      timeBankSeconds: 0,
    },
  };

  it("deals on through the pause after the last seated player leaves, then goes quiet once the hand in play ends, and stops its log until a seated player is back", () => {
    const room = openPokerHost(awayRoom);

    seatTwoPlayers(room);
    room.join(cy, 1004, "Cy");
    room.send(ana, "start", 1005, Commands.StartGame.make({}));

    const started = room.host.snapshot().headSeq;

    const left = room.host.noteAttendance([cy], 1006, room.connections());

    const alarms = answerEveryDeadline(room);
    const quietHead = room.host.snapshot().headSeq;

    const stillAway = room.host.noteAttendance(
      [cy],
      90_000_000,
      room.connections()
    );

    const back = room.host.noteAttendance(
      [ben, cy],
      90_000_000,
      room.connections()
    );

    const backHead = room.host.snapshot().headSeq;

    room.runDue(Option.getOrThrow(room.host.nextDeadline()).at);

    const whileAway = eventTags(room, started).slice(0, quietHead - started);

    expect({
      alarmsUntilQuiet: alarms < 200,
      back: back.pipe(Option.map(({ result }) => result.note._tag)),
      handsWhileAway: whileAway.filter((tag) => tag === "HandStarted").length,
      left: left.pipe(Option.map(({ result }) => result.note._tag)),
      nextDeadlineWhileQuiet: stillAway,
      quietEnds: whileAway.slice(-1),
      resumed: eventTags(room, backHead - 1).slice(0, 2),
    }).toStrictEqual({
      alarmsUntilQuiet: true,
      back: Option.some("Committed"),
      handsWhileAway: 2,
      left: Option.some("Committed"),
      nextDeadlineWhileQuiet: Option.none(),
      quietEnds: ["TableWentQuiet"],
      resumed: ["TableAttended", "HandStarted"],
    });
    expect(whileAway.slice(0, 1)).toStrictEqual(["TableUnattended"]);
  });

  it("tells the core who is connected only when that changes whether the table is attended", () => {
    const room = openPokerHost(awayRoom);

    seatTwoPlayers(room);

    expect(
      [
        room.host.noteAttendance([ana, ben], 1004, room.connections()),
        room.host.noteAttendance([ana], 1005, room.connections()),
        room.host.noteAttendance([], 1006, room.connections()),
        room.host.noteAttendance([], 1007, room.connections()),
        room.host.noteAttendance([ben], 1008, room.connections()),
      ].map((noted) => Option.isSome(noted))
    ).toStrictEqual([false, false, true, false, true]);
  });
});

describe("catching up after a reconnect", () => {
  it("redacts each missed event for the audience the player had when it happened, not the seat the player holds now", () => {
    const room = openPokerHost(plainRoom);

    room.join(cy, 1000, "Cy");
    seatTwoPlayers(room);

    const before = room.host.snapshot().headSeq;

    room.send(ana, "start", 1004, Commands.StartGame.make({}));
    room.runDue(1004);

    const dealt = openView(welcomeView(room, ana, 1005));

    const toAct = Option.getOrThrow(
      dealt.hand.pipe(Option.flatMap((hand) => hand.toAct))
    );

    room.send(
      toAct === 0 ? ana : ben,
      "fold",
      1006,
      Commands.Act.make({ action: Actions.Fold() })
    );

    const bensCards = openView(welcomeView(room, ben, 1007)).lastHand.pipe(
      Option.map((last) => last.yourCards)
    );

    room.send(ben, "stand", 1008, Commands.LeaveSeat.make({}));
    room.send(
      cy,
      "sit",
      1009,
      Commands.RequestSeat.make({
        buyIn: DEFAULT_SETTINGS.buyIn.min,
        seat: SeatIndexSchema.make(1),
      })
    );

    const cyStale = holeCardsIn(
      room,
      room.welcome(cy, Option.some(before), 1010)
    );

    const benStale = holeCardsIn(
      room,
      room.welcome(ben, Option.some(before), 1010)
    );

    expect(cyStale.map(({ cards }) => cards)).toEqual([[], []]);
    expect(Option.some(benStale.flatMap(({ cards }) => cards))).toEqual(
      bensCards
    );

    const restarted = hostRoom(
      pokerRoom,
      room.memory.storage,
      Option.getOrThrow(loadRoom(pokerRoom, room.memory.storage)),
      ROOM_RETENTION_MS
    );

    const again = (player: typeof ana) =>
      Result.getOrThrow(
        restarted.welcome(player, Option.some(before), 1010, room.connections())
      );

    expect(again(cy)).toBe(room.welcome(cy, Option.some(before), 1010));
    expect(again(ben)).toBe(room.welcome(ben, Option.some(before), 1010));
  });

  it("holds a place for a knock only while it waits, answers a knock pass with its own answer, never delivers a batch to it, and lapses a knock nobody answers", () => {
    const room = openPokerHost({
      ...plainRoom,
      settings: {
        ...plainRoom.settings,
        approval: { ...plainRoom.settings.approval, joins: true },
      },
    });

    const benSees = room.watch(ben);

    room.join(ben, 1001, "Abe");
    room.join(cy, 1002, "Cad");

    const waiting = room.host.placesHeld();

    room.send(ana, "away-ben", 1003, Commands.TurnAway.make({ player: ben }));

    const lapsesAt = 1002 + DEFAULT_SETTINGS.knockSeconds * 1000;
    const lapsed = room.runDue(lapsesAt);

    const answerOf = (name: string) =>
      StandingsAnswers.$match(room.host.standings(hashOfHexName(name), 9000), {
        Halted: () => "halted",
        Knocking: ({ knock }) => knock.answer,
        NotAuthorized: () => "unknown",
        NotHalted: () => "open",
        Removed: () => "removed",
      });

    expect({
      answers: [answerOf("Abe"), answerOf("Cad")],
      benFrames: benSees.frames.length,
      closed: room.closed,
      lapsed: lapsed.pipe(Option.map(({ reply }) => reply._tag)),
      places: [waiting, room.host.placesHeld()],
    }).toStrictEqual({
      answers: ["TurnedAway", "Lapsed"],
      benFrames: 0,
      closed: [{ player: ben, reason: "Knocking" }],
      lapsed: Option.some("Accepted"),
      places: [3, 1],
    });
  });

  it("holds no place for a pass the host revoked: a host who removes more people than the server keeps passes for still has room for the next, and every removed pass still reads its own result", () => {
    const room = openPokerHost(plainRoom);

    const removed = Array.from({ length: MAX_MEMBERS }, (_, index) => {
      const player = PlayerIdSchema.make(`guest-${index}`.padEnd(16, "x"));
      const at = 2000 + index * 10;

      const joined = room.host.commit(
        {
          at,
          command: pokerRoom.stamp(
            player,
            at,
            pokerRoom.joinCommand({ avatar: "owl", name: `Guest ${index}` })
          ),
          grant: Option.some({ hash: hashOf(index + 1), player }),
          origin: Origins.Server({ trigger: "Join" }),
        },
        room.connections()
      );

      const gone = room.send(
        ana,
        `remove-${index}`,
        at + 5,
        Commands.RemoveMember.make({ player })
      );

      return [joined.reply._tag, gone.reply._tag];
    });

    const results = Array.from({ length: MAX_MEMBERS }, (_, index) =>
      StandingsAnswers.$is("Removed")(
        room.host.standings(
          Result.getOrThrow(Hex.decode(hashOf(index + 1))),
          9000
        )
      )
    );

    expect(removed).toStrictEqual(
      Array.from({ length: MAX_MEMBERS }, () => ["Accepted", "Accepted"])
    );
    expect(room.host.placesHeld()).toBeLessThan(MAX_MEMBERS);
    expect(room.host.placesHeld()).toBe(1);
    expect(room.host.snapshot().credentials).toHaveLength(MAX_MEMBERS + 1);
    expect(results.every(Boolean)).toBe(true);
  });
});
