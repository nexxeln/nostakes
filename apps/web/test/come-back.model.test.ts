import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViewSchema } from "@nostakes/room";
import type { MemberCommand } from "@nostakes/room";
import { Option, Schema } from "effect";

import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import type { Model, RoomRecord } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const CODE = RoomCodeSchema.make("ABC234");

const BEN = PlayerIdSchema.make("player-0000000be");

const SentSchema = Schema.Struct({ command: MemberCommandSchema });

interface Walked {
  readonly issued: readonly string[];
  readonly model: Model;
  readonly sent: readonly MemberCommand[];
}

const walk = (model: Model, messages: readonly Message[]): Walked => {
  const issued: string[] = [];
  const sent: MemberCommand[] = [];
  let current = model;

  for (const message of messages) {
    const next = update(current, message);
    const commands = next.commands ?? [];

    issued.push(...commands.map(({ name }) => name));
    sent.push(
      ...commands.flatMap((command) =>
        command.name === "SendToRoom"
          ? Option.toArray(
              Schema.decodeUnknownOption(SentSchema)(command.args)
            ).map(({ command: decoded }) => decoded)
          : []
      )
    );
    current = next.model;
  }

  return { issued, model: current, sent };
};

const record = (door: RoomRecord["door"]): RoomRecord => ({
  closed: false,
  code: CODE,
  door,
  left: door === "Inside",
  others: ["Ana"],
  removed: false,
  seenAt: 0,
});

const device = (door: RoomRecord["door"], holdsPass: boolean) =>
  init({
    deck: "TwoColour",
    invite: holdsPass ? Option.some(CODE) : Option.none(),
    learned: [],
    profile: { avatar: "", name: "Someone else" },
    reloadedFor: Option.none(),
    rooms: [{ player: BEN, record: record(door) }],
    saved: holdsPass ? Option.some({ code: CODE, player: BEN }) : Option.none(),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  }).model;

const linked = (refusal: Option.Option<CloseReason>) =>
  Messages.ReceivedLink({
    link: {
      newBuild: Option.none(),
      phase: Option.isSome(refusal) ? "Refused" : "Live",
      presence: [BEN],
      receivedAt: 0,
      refusal,
      retryDelayMs: Option.none(),
    },
  });

const leftAs = (view: OpenView, name: string, avatar: string): OpenView => ({
  ...view,
  code: CODE,
  departed: [
    ...view.departed.filter(({ player }) => player !== BEN),
    { avatar, name, player: BEN },
  ],
  members: view.members.filter(({ player }) => player !== BEN),
  you: Option.some(BEN),
});

const TURNED_AWAY = Messages.ReceivedKnock({
  at: 0,
  knock: { answer: "TurnedAway", avatar: "", code: CODE, name: "Ben" },
});

const Ways = Schema.Literals(["Left", "Removed", "TurnedAway"]);

const inside = (way: typeof Ways.Type, view: OpenView): readonly Message[] => {
  if (way === "TurnedAway") {
    return [TURNED_AWAY];
  }

  return way === "Removed"
    ? [linked(Option.some("Removed"))]
    : [
        linked(Option.none()),
        Messages.ReceivedUpdate({ events: [], receivedAt: 0, seq: 1, view }),
      ];
};

const joinsAsNew = (walked: Walked) =>
  walked.issued.some((name) => name === "JoinRoom" || name === "KnockAtRoom");

describe("a player who left the room and comes back", () => {
  it.prop(
    "on a device holding the pass, the room link, Back home, and the home list's row all keep the pass and Come back joins as the same player; a removed or turned-away player's routes stay as they were",
    {
      avatar: Schema.Literals(["", "h1-face", "🦈"]),
      name: Schema.Literals(["Ben", "Zoë", "李"]),
      view: RoomViewSchema.cases.Open,
      way: Ways,
    },
    ({ avatar, name, view: generated, way }) => {
      const view = leftAs(generated, name, avatar);
      const door = way === "TurnedAway" ? "TurnedAway" : "Inside";

      const fromLink = walk(device(door, true), [
        ...inside(way, view),
        Messages.ClickedComeBack(),
      ]);

      const home = walk(device(door, true), [
        ...inside(way, view),
        Messages.ClickedHome(),
      ]);

      const fromRow = walk(home.model, [
        Messages.ClickedKnownRoom({ code: CODE }),
        ...inside(way, view),
        Messages.ClickedComeBack(),
      ]);

      const comeBack =
        way === "Left"
          ? [MemberCommandSchema.cases.Join.make({ avatar, name })]
          : [];

      expect({
        fromLink: fromLink.sent,
        fromRow: fromRow.sent,
        homeForgets: home.issued.includes("ForgetRoom"),
        homeKeeps: home.model.rooms.map(({ player }) => player),
        newPlayer: [fromLink, home, fromRow].some(joinsAsNew),
        rowOpens: Screens.guards.Room(fromRow.model.screen)
          ? fromRow.model.screen.room.player
          : "elsewhere",
      }).toStrictEqual({
        fromLink: comeBack,
        fromRow: comeBack,
        homeForgets: false,
        homeKeeps: [BEN],
        newPlayer: false,
        rowOpens: BEN,
      });
    },
    { arbitrary: { runs: 60 } }
  );
});
