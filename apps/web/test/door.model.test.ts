import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { attr, findAll } from "foldkit/scene";

import { lockedSettings } from "../src/features/menu-view.js";
import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const CODE = RoomCodeSchema.make("ABC234");

const ANA = PlayerIdSchema.make("player-00000000a");

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

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

const hosting = (table: OpenView, host: boolean): OpenView => ({
  ...table,
  code: CODE,
  departed: [],
  host: host ? ANA : PlayerIdSchema.make("player-0000000be"),
  members: [
    { avatar: "", name: "Ana", player: ANA },
    {
      avatar: "",
      name: "Ben",
      player: PlayerIdSchema.make("player-0000000be"),
    },
  ],
  stalled: Option.none(),
  you: Option.some(ANA),
});

const inMenu = (table: OpenView): Model => {
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

const switches = (model: Model) => {
  const found: (string | undefined)[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      found.push(
        ...findAll(simulation.html, ".door-line .switch").map((node) =>
          Option.getOrUndefined(attr(node, "aria-checked"))
        )
      );
    })
  );

  return found;
};

describe("the door in the menu", () => {
  it.prop(
    "shows the host one switch, checked while the room is locked, and shows other members none",
    { table: tables },
    ({ table }) => {
      const model = inMenu(hosting(table, true));

      expect({
        host: switches(model),
        other: switches(inMenu(hosting(table, false))),
      }).toStrictEqual({
        host: [String(table.settings.locked)],
        other: [],
      });
    }
  );

  it.prop(
    "sends the table change the host queued for the next hand, not the table in play, so locking never drops it",
    { locked: Arbitrary.schema(Schema.Boolean), table: tables },
    ({ locked, table }) => {
      expect(lockedSettings(table, locked)).toStrictEqual({
        ...table.settings,
        locked,
        table: Option.getOrElse(table.queued.rules, () => table.settings.table),
      });
    }
  );
});
