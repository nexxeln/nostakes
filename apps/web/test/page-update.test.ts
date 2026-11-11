import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema, SeatIndexSchema } from "@nostakes/engine";
import {
  BuildIdSchema,
  PlayerIdSchema,
  PROTOCOL_VERSION,
  RoomCodeSchema,
} from "@nostakes/protocol";
import type { BuildId } from "@nostakes/protocol";
import { HandViewSchema, RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import { ReloadTargets } from "../src/features/model.js";
import type {
  ConnectionPhase,
  Model,
  ReloadTarget,
} from "../src/features/model.js";
import { roomOf } from "../src/features/room.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const BUILD_B = BuildIdSchema.make("build-b");

const BUILD_C = BuildIdSchema.make("build-c");

type OpenView = typeof RoomViewSchema.cases.Open.Type;

type HandView = typeof HandViewSchema.Type;

type Status = HandView["players"][number]["status"];

const opened = (reloadedFor: Option.Option<ReloadTarget>) =>
  init({
    deck: "TwoColour",
    invite: Option.some(CODE),
    learned: [],
    profile: { avatar: "🦊", name: "Ana" },
    reloadedFor,
    rooms: [],
    saved: Option.some({ code: CODE, player: PLAYER }),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  }).model;

const link = (phase: ConnectionPhase, newBuild: Option.Option<BuildId>) =>
  Messages.GotLink({
    link: {
      newBuild,
      phase,
      presence: [],
      receivedAt: 0,
      refusal: Option.none(),
      retryDelayMs: Option.none(),
    },
  });

const shown = (table: OpenView, hand: Option.Option<HandView>) =>
  Messages.GotUpdate({
    events: [],
    receivedAt: 0,
    seq: 1,
    view: { ...table, hand },
  });

const seated = (
  player: typeof PLAYER,
  status: Status
): HandView["players"][number] => ({
  committedThisStreet: ChipsSchema.make(0),
  committedTotal: ChipsSchema.make(0),
  mucked: false,
  player,
  seat: SeatIndexSchema.make(0),
  shown: [],
  status,
});

const handWith = (base: HandView, player: typeof PLAYER, status: Status) =>
  Option.some({
    ...base,
    players: [
      ...base.players.filter((seat) => seat.player !== PLAYER),
      seated(player, status),
    ],
  });

const run = (model: Model, messages: readonly Message[]) => {
  let current = model;
  const reloads: ReloadTarget[] = [];

  for (const message of messages) {
    const next = update(current, message);

    current = next.model;

    for (const command of next.commands ?? []) {
      const target = Schema.decodeUnknownOption(
        Schema.Struct({ target: ReloadTargets })
      )(command.args);

      if (command.name === "ReloadPage" && Option.isSome(target)) {
        reloads.push(target.value.target);
      }
    }
  }

  return {
    reloads,
    stage: roomOf(current).pipe(
      Option.flatMap(({ update: pending }) => pending),
      Option.map(({ stage }) => stage),
      Option.getOrElse(() => "None")
    ),
  };
};

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

const hands = Arbitrary.schema(HandViewSchema);

const newBuild = ReloadTargets.NewBuild({ build: BUILD_B });

const newProtocol = ReloadTargets.NewProtocol({ outdated: PROTOCOL_VERSION });

describe("loading a new version of the page", () => {
  it.prop(
    "a server on a newer protocol reloads the page at once, even mid-hand",
    { hand: hands, table: tables },
    ({ hand, table }) => {
      expect(
        run(opened(Option.none()), [
          shown(table, handWith(hand, PLAYER, "Active")),
          link("Outdated", Option.none()),
        ])
      ).toEqual({ reloads: [newProtocol], stage: "Reloading" });
    }
  );

  it.prop(
    "a page that already reloaded for this version stops and says so instead of reloading again",
    { table: tables },
    ({ table }) => {
      expect([
        run(opened(Option.some(newBuild)), [
          shown(table, Option.none()),
          link("Live", Option.some(BUILD_B)),
        ]),
        run(opened(Option.some(newProtocol)), [
          shown(table, Option.none()),
          link("Outdated", Option.none()),
        ]),
        run(opened(Option.some(newBuild)), [
          shown(table, Option.none()),
          link("Live", Option.some(BUILD_C)),
        ]),
      ]).toEqual([
        { reloads: [], stage: "Stuck" },
        { reloads: [], stage: "Stuck" },
        {
          reloads: [ReloadTargets.NewBuild({ build: BUILD_C })],
          stage: "Reloading",
        },
      ]);
    }
  );
});
