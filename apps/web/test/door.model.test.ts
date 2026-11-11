import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { KnockerViewSchema, RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { Messages } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const BEN = PlayerIdSchema.make("player-0000000be");

const shownText = (model: Model) => {
  const texts: string[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      texts.push(...findAll(simulation.html, "main").map(textContent));
    })
  );

  return texts.join("\n");
};

const ANA = PlayerIdSchema.make("player-00000000a");

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

const knocking = Schema.decodeSync(Schema.Array(KnockerViewSchema))([
  { avatar: "", lapsesAt: 9000, name: "Flo", player: BEN, since: 1000 },
  {
    avatar: "",
    lapsesAt: 9500,
    name: "Gus",
    player: "player-0000000c9",
    since: 1500,
  },
]);

const seenBy = (
  table: typeof RoomViewSchema.cases.Open.Type,
  you: typeof ANA
) =>
  shownText(
    update(
      init({
        deck: "TwoColour",
        invite: Option.some(CODE),
        learned: [],
        profile: { avatar: "", name: "Ana" },
        reloadedFor: Option.none(),
        rooms: [],
        saved: Option.some({ code: CODE, player: you }),
        sound: false,
        systemTheme: "Light",
        theme: Option.none(),
      }).model,
      Messages.ReceivedUpdate({
        events: [],
        receivedAt: 1000,
        seq: 1,
        view: {
          ...table,
          code: CODE,
          departed: [],
          host: ANA,
          knocking,
          members: [{ avatar: "", name: "Ana", player: ANA }],
          you: Option.some(you),
        },
      })
    ).model
  );

describe("the host's line at the door", () => {
  it.prop(
    "shows the first knock and how many more wait to the host, and nothing to anyone else",
    { table: tables },
    ({ table }) => {
      expect([
        seenBy(table, ANA).includes("at the door · +1"),
        seenBy(table, PlayerIdSchema.make("player-0000000dd")).includes(
          "at the door"
        ),
      ]).toStrictEqual([true, false]);
    },
    { arbitrary: { runs: 20 } }
  );
});
