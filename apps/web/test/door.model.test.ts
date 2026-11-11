import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import {
  KnockViewSchema,
  KnockerViewSchema,
  RoomViewSchema,
} from "@nostakes/room";
import type { KnockAnswer } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { DOOR_LINES, KNOCK_PAUSE_MS } from "../src/features/door.js";
import { Messages } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import type { Model } from "../src/features/model.js";
import { connectionTarget } from "../src/features/room.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const BEN = PlayerIdSchema.make("player-0000000be");

const KNOCKED_AT = 1_000_000;

const invited = init({
  deck: "TwoColour",
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "", name: "Ben" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.none(),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const knock = (answer: KnockAnswer) =>
  Schema.decodeSync(KnockViewSchema)({
    answer,
    avatar: "",
    code: CODE,
    name: "Ben",
  });

const knocked = update(
  invited,
  Messages.KnockedAtRoom({
    at: KNOCKED_AT,
    code: CODE,
    knock: knock("Waiting"),
    player: BEN,
  })
);

const answered = (answer: KnockAnswer, at = KNOCKED_AT + 5000) =>
  update(knocked.model, Messages.GotKnock({ at, knock: knock(answer) }));

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

const doorOf = (model: Model) => model.rooms.map(({ record }) => record.door);

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

describe("knocking at a room whose host approves joins", () => {
  it("shows the person their own face and one calm line, opens no socket, remembers the room as waiting, and asks again on each poll", () => {
    expect({
      commands: namesOf(knocked),
      door: doorOf(knocked.model),
      poll: namesOf(update(knocked.model, Messages.PolledDoor())),
      says: shownText(knocked.model).includes(DOOR_LINES.Waiting),
      socket: connectionTarget(knocked.model),
    }).toStrictEqual({
      commands: ["ShowPath", "RememberRoom"],
      door: ["Knocking"],
      poll: ["ReadKnock"],
      says: true,
      socket: Option.none(),
    });
  });

  it("opens the room's socket once the host lets them in", () => {
    const inside = update(knocked.model, Messages.LetInside());

    expect({
      door: doorOf(inside.model),
      socket: connectionTarget(inside.model),
    }).toStrictEqual({
      door: ["Inside"],
      socket: Option.some({ code: CODE, player: BEN }),
    });
  });

  it("says the host didn't let them in, stops asking, keeps the room on the home list, and holds off the next knock from this device for ten minutes", () => {
    const away = answered("TurnedAway");
    const home = update(away.model, Messages.ClickedHome());

    const again = update(
      update(home.model, Messages.ChangedJoinCode({ value: CODE })).model,
      Messages.SubmittedJoin()
    );

    const join = (again.commands ?? []).find(({ name }) => name === "JoinRoom");

    expect({
      home: shownText(home.model).includes("Not let in"),
      paused: join?.args,
      poll: namesOf(update(away.model, Messages.PolledDoor())),
      says: shownText(away.model).includes(DOOR_LINES.TurnedAway),
    }).toStrictEqual({
      home: true,
      paused: {
        avatar: "",
        code: CODE,
        name: "Ben",
        pausedUntil: Option.some(KNOCKED_AT + 5000 + KNOCK_PAUSE_MS),
      },
      poll: [],
      says: true,
    });
  });

  it("offers to knock again after a lapse, and to pick another name when theirs was taken while they waited", () => {
    const lapsed = update(
      answered("Lapsed").model,
      Messages.ClickedKnockAgain()
    );

    const taken = update(
      answered("NameTaken").model,
      Messages.ClickedKnockAgain()
    );

    expect({
      lapsed: namesOf(lapsed),
      lapsedScreen: lapsed.model.screen._tag,
      taken: Screens.guards.Invited(taken.model.screen)
        ? taken.model.screen.problem
        : Option.none(),
    }).toStrictEqual({
      lapsed: ["JoinRoom"],
      lapsedScreen: "Invited",
      taken: Option.some(
        "Someone here already has that name. Pick another one and knock again."
      ),
    });
  });

  it("goes back to the door instead of the table when the room refuses this pass's socket as Knocking", () => {
    const reloaded = init({
      deck: "TwoColour",
      invite: Option.some(CODE),
      learned: [],
      profile: { avatar: "", name: "Ben" },
      reloadedFor: Option.none(),
      rooms: [],
      saved: Option.some({ code: CODE, player: BEN }),
      sound: false,
      systemTheme: "Light",
      theme: Option.none(),
    }).model;

    const turned = update(reloaded, refused("Knocking"));

    expect({
      commands: namesOf(turned),
      socket: connectionTarget(turned.model),
    }).toStrictEqual({
      commands: ["ReadKnock"],
      socket: Option.none(),
    });
  });
});

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
      Messages.GotUpdate({
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
