import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema, SeatIndexSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViewSchema } from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages, ReplyOutcomes } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const ANA = PlayerIdSchema.make("player-00000000a");

const CAT = PlayerIdSchema.make("player-0000000ca");

const DAN = PlayerIdSchema.make("player-0000000da");

const EVE = PlayerIdSchema.make("player-0000000ee");

const FAY = PlayerIdSchema.make("player-0000000fa");

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const person = (player: typeof ANA, name: string) => ({
  avatar: "",
  name,
  player,
});

const sitting = (player: typeof ANA, seat: number) => ({
  occupant: Option.some({
    away: false,
    leaving: false,
    leavingRoom: false,
    owes: { big: false, entry: false, small: false },
    player,
    posts: false,
    sittingOut: false,
    stack: ChipsSchema.make(100),
    straddling: false,
  }),
  seat: SeatIndexSchema.make(seat),
});

const roomOf = (
  table: OpenView,
  members: readonly (typeof ANA)[],
  departed: readonly (typeof ANA)[],
  seated: readonly (typeof ANA)[]
): OpenView => {
  const names = new Map([
    [ANA, "Ana"],
    [CAT, "Cat"],
    [DAN, "Dan"],
    [EVE, "Eve"],
    [FAY, "Fay"],
  ]);

  return {
    ...table,
    code: CODE,
    departed: departed.map((player) => person(player, names.get(player) ?? "")),
    host: ANA,
    knocking: [],
    members: members.map((player) => person(player, names.get(player) ?? "")),
    seats: Array.from({ length: 9 }, (_, seat) => {
      const occupant = seated[seat];

      return occupant === undefined
        ? { occupant: Option.none(), seat: SeatIndexSchema.make(seat) }
        : sitting(occupant, seat);
    }),
    you: Option.some(ANA),
  };
};

const live = Messages.GotLink({
  link: {
    newBuild: Option.none(),
    phase: "Live",
    presence: [ANA],
    receivedAt: 900,
    refusal: Option.none(),
    retryDelayMs: Option.none(),
  },
});

const hostIn = (table: OpenView, seq: number): Model =>
  update(
    update(
      init({
        deck: "TwoColour",
        invite: Option.some(CODE),
        learned: [],
        profile: { avatar: "", name: "Ana" },
        reloadedFor: Option.none(),
        rooms: [],
        saved: Option.some({ code: CODE, player: ANA }),
        sound: false,
        systemTheme: "Light",
        theme: Option.none(),
      }).model,
      live
    ).model,
    Messages.GotUpdate({ events: [], receivedAt: 1000, seq, view: table })
  ).model;

const noticeOf = (model: Model) =>
  Screens.guards.Room(model.screen)
    ? model.screen.room.notice
    : Option.none<string>();

const cleared = (before: OpenView, after: OpenView, replyFirst: boolean) => {
  const sent = update(
    hostIn(before, 4),
    Messages.ClickedRoomCommand({
      command: MemberCommandSchema.cases.ClearRoom.make({
        players: [CAT, DAN, EVE],
      }),
      label: "Clearing the room",
    })
  ).model;

  const key = sent.nextKey - 1;

  const reply = Messages.GotReply({
    key,
    outcome: ReplyOutcomes.Accepted({ seq: 6 }),
  });

  const landed = Messages.GotUpdate({
    events: [],
    receivedAt: 1100,
    seq: 6,
    view: after,
  });

  return replyFirst
    ? update(update(sent, reply).model, landed).model
    : update(update(sent, landed).model, reply).model;
};

describe("clearing the room from the host's page", () => {
  it.prop(
    "says who the clear spared and why once the room has applied it, whichever of the reply and the update arrives first, and says nothing when everyone named went",
    { table: tables },
    ({ table }) => {
      const before = roomOf(table, [ANA, CAT, DAN, EVE], [], [ANA]);
      const raced = roomOf(table, [ANA, DAN, FAY], [], [ANA, DAN]);
      const asPromised = roomOf(table, [ANA, FAY], [], [ANA]);

      expect([
        noticeOf(cleared(before, raced, true)),
        noticeOf(cleared(before, raced, false)),
        noticeOf(cleared(before, asPromised, true)),
      ]).toStrictEqual([
        Option.some("2 removed. \u2068Dan\u2069 took a seat, so they stay."),
        Option.some("2 removed. \u2068Dan\u2069 took a seat, so they stay."),
        Option.none(),
      ]);
    },
    { arbitrary: { runs: 20 } }
  );
});
