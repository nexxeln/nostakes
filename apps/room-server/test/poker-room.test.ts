import { describe, expect, it } from "@effect/vitest";
import { Actions, SeatIndexSchema } from "@nostakes/engine";
import {
  Actors,
  ChipAmountSchema,
  Deadlines,
  RoomCommands,
  RoomSettingsSchema,
  RoomViews,
  millis,
} from "@nostakes/room";
import type { RoomView } from "@nostakes/room";
import { Option, Result, Schema } from "effect";

import {
  DEAL_SHUFFLE_BYTES,
  DEFAULT_SETTINGS,
  MemberCommandSchema,
  pokerRoom,
} from "../src/poker-room.js";
import { ana, ben, openPokerHost } from "./fixtures/poker-host.js";

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

describe("the poker room adapter", () => {
  it("opens a room without settings at the agreed defaults, as members see them on the wire", () => {
    const room = openPokerHost({ avatar: "fox", name: "Ana" });
    const view = openView(welcomeView(room, ana, 1000));

    expect(encodeSettings(view.settings)).toBe(
      '{"approval":{"chips":false,"seats":false},"betweenHandsSeconds":5,"buyIn":{"max":400,"min":40},"runChoiceSeconds":15,"table":{"ante":{"_tag":"NoAnte"},"bigBlind":2,"maxRuns":1,"rabbitHunt":false,"smallBlind":1,"straddle":{"button":false,"underTheGun":0}},"timeBankSeconds":60,"turnSeconds":30}'
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
      new Uint8Array()
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
    const room = openPokerHost({ avatar: "fox", name: "Ana" });

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

  it("serves the settlement to a member of a closed room and refuses every command after it", () => {
    const room = openPokerHost({ avatar: "fox", name: "Ana" });

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
