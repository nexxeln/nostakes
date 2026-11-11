import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { RemovedViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { Messages } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import type { Model } from "../src/features/model.js";
import { REMOVED_LINE } from "../src/features/room-view.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const ANA = PlayerIdSchema.make("player-00000000a");

const BEN = PlayerIdSchema.make("player-0000000be");

const opened = init({
  deck: "TwoColour",
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "", name: "Ben" },
  reloadedFor: Option.none(),
  rooms: [
    {
      player: BEN,
      record: {
        closed: false,
        code: CODE,
        door: "Inside",
        left: false,
        others: ["Ana"],
        removed: false,
        seenAt: 0,
      },
    },
  ],
  saved: Option.some({ code: CODE, player: BEN }),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const refused = (reason: CloseReason) =>
  Messages.GotLink({
    link: {
      newBuild: Option.none(),
      phase: "Refused",
      presence: [],
      receivedAt: 0,
      refusal: Option.some(reason),
      retryDelayMs: Option.none(),
    },
  });

const RESULT = Schema.decodeSync(RemovedViewSchema)({
  balance: { boughtIn: 200, cashedOut: 160, net: -40, player: BEN },
  code: CODE,
  finishing: false,
  people: [
    { avatar: "", name: "Ben", player: BEN },
    { avatar: "", name: "Ana", player: ANA },
  ],
  player: BEN,
  transfers: Option.some([{ amount: 40, from: BEN, to: ANA }]),
});

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

const namesOf = (step: {
  readonly commands?: readonly { readonly name: string }[];
}) => (step.commands ?? []).map(({ name }) => name);

describe("a member the host removed", () => {
  it("asks once for their own result when the room refuses the socket as Removed, marks the room removed on this device, and says the host removed them", () => {
    const first = update(opened, refused("Removed"));
    const again = update(first.model, refused("Removed"));
    const other = update(opened, refused("NotAuthorized"));

    expect({
      again: namesOf(again),
      first: namesOf(first),
      other: namesOf(other),
      record: first.model.rooms.map(({ record }) => record.removed),
      says: shownText(first.model).includes(REMOVED_LINE),
    }).toStrictEqual({
      again: [],
      first: ["RememberRoom", "ReadOwnResult"],
      other: [],
      record: [true],
      says: true,
    });
  });

  it("shows only their own line and the transfers that involve them, and checks again on a tap", () => {
    const shown = update(
      update(opened, refused("Removed")).model,
      Messages.GotOwnResult({ result: RESULT })
    );

    const text = shownText(shown.model);

    expect({
      again: namesOf(update(shown.model, Messages.ClickedCheckResult())),
      line: text.includes("You bought in 200 and left with 160."),
      pays: text.includes("You pay 40 to Ana"),
      state: Screens.guards.Room(shown.model.screen)
        ? shown.model.screen.room.removed.pipe(Option.map(({ _tag }) => _tag))
        : Option.none(),
    }).toStrictEqual({
      again: ["ReadOwnResult"],
      line: true,
      pays: true,
      state: Option.some("Shown"),
    });
  });
});
