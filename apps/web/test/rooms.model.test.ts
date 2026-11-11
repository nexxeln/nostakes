import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { Messages } from "../src/features/message.js";
import type { KnownRoom, Model } from "../src/features/model.js";
import { Screens } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const OTHER_CODE = RoomCodeSchema.make("XYZ789");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const flags = {
  deck: "TwoColour" as const,
  invite: Option.none(),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  saved: Option.none(),
  sound: false,
  systemTheme: "Light" as const,
  theme: Option.none(),
};

const known = (
  code: typeof CODE,
  seenAt: number,
  others: readonly string[]
): KnownRoom => ({
  player: PLAYER,
  record: { closed: false, code, left: false, others, removed: false, seenAt },
});

const seated = (table: OpenView): OpenView => ({
  ...table,
  code: CODE,
  departed: [],
  members: [
    { avatar: "🦊", name: "Ana", player: PLAYER },
    ...table.members.filter(({ player }) => player !== PLAYER),
  ],
  you: Option.some(PLAYER),
});

const inRoom = init({
  ...flags,
  invite: Option.some(CODE),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
}).model;

const seen = (model: Model, table: OpenView, receivedAt: number) =>
  update(
    model,
    Messages.GotUpdate({ events: [], receivedAt, seq: 1, view: table })
  );

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const namesOf = (commands: Issued | undefined) =>
  (commands ?? []).map(({ name }) => name);

describe("the rooms this device can go back to", () => {
  it.prop(
    "remembers a room it sees with who else was there, once until something changes",
    { table: tables },
    ({ table }) => {
      const watched = seated(table);
      const first = seen(inRoom, watched, 1000);
      const again = seen(first.model, watched, 2000);

      expect(namesOf(first.commands)).toContain("RememberRoom");
      expect(first.model.rooms).toStrictEqual([
        {
          player: PLAYER,
          record: {
            closed: false,
            code: CODE,
            left: false,
            others: watched.members
              .filter(({ player }) => player !== PLAYER)
              .map(({ name }) => name),
            removed: false,
            seenAt: 1000,
          },
        },
      ]);
      expect(namesOf(again.commands)).not.toContain("RememberRoom");
    }
  );

  it("checks every listed room when the home screen opens", () => {
    const opened = init({
      ...flags,
      rooms: [known(CODE, 2000, ["Ben"]), known(OTHER_CODE, 1000, [])],
    });

    expect(
      (opened.commands ?? []).flatMap(({ args, name }) =>
        name === "CheckRoom" ? [args] : []
      )
    ).toStrictEqual([{ code: CODE }, { code: OTHER_CODE }]);
  });

  it("forgets a room the server no longer has and keeps one it still has", () => {
    const home = init({
      ...flags,
      rooms: [known(CODE, 2000, ["Ben"]), known(OTHER_CODE, 1000, [])],
    }).model;

    const kept = update(
      home,
      Messages.CheckedRoom({ code: CODE, gone: false })
    );

    const gone = update(home, Messages.CheckedRoom({ code: CODE, gone: true }));

    expect(kept).toStrictEqual({ model: home });
    expect(gone.model.rooms).toStrictEqual([known(OTHER_CODE, 1000, [])]);
    expect(
      gone.commands?.map(({ args, name }) => ({ args, name }))
    ).toStrictEqual([{ args: { code: CODE }, name: "ForgetRoom" }]);
  });

  it("takes you back to your seat in one tap", () => {
    const home = init({ ...flags, rooms: [known(CODE, 2000, ["Ben"])] }).model;
    const back = update(home, Messages.ClickedKnownRoom({ code: CODE }));

    expect(
      Screens.guards.Room(back.model.screen)
        ? {
            code: back.model.screen.room.code,
            player: back.model.screen.room.player,
          }
        : "not in a room"
    ).toStrictEqual({ code: CODE, player: PLAYER });
    expect(namesOf(back.commands)).toStrictEqual(["ShowPath"]);
  });

  it("lists each room with its code and who was there", () => {
    const home = init({
      ...flags,
      rooms: [
        known(CODE, 3000, ["Ben", "Cy", "Di", "Ed"]),
        known(OTHER_CODE, 1000, ["Ben"]),
      ],
    }).model;

    const rows: string[] = [];

    Scene.scene(
      { update, view },
      Scene.given(home),
      Scene.tap((simulation) => {
        rows.push(
          ...findAll(simulation.html, ".room-row").map((row) =>
            textContent(row)
          )
        );
      })
    );

    expect(rows).toStrictEqual([
      "ABC234With Ben, Cy and 2 moreOpen",
      "XYZ789With BenOpen",
    ]);
  });
});
