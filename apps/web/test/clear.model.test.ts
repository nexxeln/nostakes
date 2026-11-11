import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { findAll } from "foldkit/scene";

import { CLEAR_FROM, clearingText } from "../src/features/menu-view.js";
import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { isolated } from "../src/features/names.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const CODE = RoomCodeSchema.make("ABC234");

const ANA = PlayerIdSchema.make("player-00000000a");

const WATCHERS = ["Ben", "Cy", "Di", "Ed", "Flo"];

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

const watchers = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: WATCHERS.length, minimum: 0 }))
);

const start = init({
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
}).model;

const crowded = (
  table: OpenView,
  count: number,
  host: boolean,
  locked = false
): OpenView => ({
  ...table,
  code: CODE,
  departed: [],
  host: host ? ANA : PlayerIdSchema.make("player-0000000zz"),
  members: [
    { avatar: "", name: "Ana", player: ANA },
    ...WATCHERS.slice(0, count).map((name) => ({
      avatar: "",
      name,
      player: PlayerIdSchema.make(`watcher-${name.padEnd(8, "x")}`),
    })),
  ],
  seats: table.seats.map((seat) => ({ ...seat, occupant: Option.none() })),
  settings: { ...table.settings, locked },
  stalled: Option.none(),
  you: Option.some(ANA),
});

const menuOf = (table: OpenView): Model => {
  let current = start;

  for (const message of [
    Messages.GotUpdate({ events: [], receivedAt: 0, seq: 1, view: table }),
    Messages.GotLink({
      link: {
        newBuild: Option.none(),
        phase: "Live",
        presence: [ANA],
        receivedAt: 0,
        refusal: Option.none(),
        retryDelayMs: Option.none(),
      },
    }),
    Messages.ClickedMenu(),
  ] satisfies readonly Message[]) {
    current = update(current, message).model;
  }

  return current;
};

const clearButtons = (model: Model) => {
  const found: number[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      found.push(findAll(simulation.html, ".clear-line").length);
    })
  );

  return found;
};

const named = (names: readonly string[]) => names.map(isolated);

describe("clearing the room from the menu", () => {
  it.prop(
    `offers the host one action once ${CLEAR_FROM} or more people are not seated, and never offers it to anyone else`,
    { count: watchers, table: tables },
    ({ count, table }) => {
      expect({
        host: clearButtons(menuOf(crowded(table, count, true))),
        other: clearButtons(menuOf(crowded(table, count, false))),
      }).toStrictEqual({
        host: [count >= CLEAR_FROM ? 1 : 0],
        other: [0],
      });
    }
  );

  it.prop(
    "says how many go, names the first three, and says the room locks",
    { table: tables },
    ({ table }) => {
      expect([
        clearingText(crowded(table, 5, true)),
        clearingText(crowded(table, 3, true)),
        clearingText(crowded(table, 3, true, true)).body.endsWith(
          "The room stays locked."
        ),
      ]).toStrictEqual([
        {
          action: "Remove 5",
          body: `${named(["Ben", "Cy", "Di"]).join(", ")} and 2 more go, and their passes stop working. Seated players stay. The room locks too, so unlock it to let a friend back in.`,
        },
        {
          action: "Remove 3",
          body: `${named(["Ben", "Cy"]).join(", ")} and ${isolated("Di")} go, and their passes stop working. Seated players stay. The room locks too, so unlock it to let a friend back in.`,
        },
        true,
      ]);
    }
  );
});
