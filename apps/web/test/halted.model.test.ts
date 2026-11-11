import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { RoomViewSchema, SettlementSchema } from "@nostakes/room";
import { Option, Schema } from "effect";

import { HALTED_LINE, haltedRows } from "../src/features/halted.js";
import { Messages } from "../src/features/message.js";
import { HaltedStandings, Screens } from "../src/features/model.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const ANA = PlayerIdSchema.make("player-00000000a");

const BEN = PlayerIdSchema.make("player-0000000be");

const opened = init({
  deck: "TwoColour",
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: ANA }),
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

const STANDINGS = RoomViewSchema.cases.Closed.make({
  code: CODE,
  departed: [],
  members: [
    { avatar: "fox", name: "Ana", player: ANA },
    { avatar: "owl", name: "Ben", player: BEN },
  ],
  settlement: Schema.decodeSync(SettlementSchema)({
    balances: [
      { boughtIn: 200, cashedOut: 199, net: -1, player: ANA },
      { boughtIn: 200, cashedOut: 201, net: 1, player: BEN },
    ],
    transfers: [{ amount: 1, from: ANA, to: BEN }],
  }),
  you: Option.some(ANA),
});

const asked = (model: Model, reason: CloseReason) => {
  const step = update(model, refused(reason));

  return {
    asks: (step.commands ?? []).filter(({ name }) => name === "ReadStandings")
      .length,
    model: step.model,
  };
};

const haltedOf = (model: Model) =>
  Screens.guards.Room(model.screen)
    ? model.screen.room.halted.pipe(Option.map(({ _tag }) => _tag))
    : Option.none();

describe("a room the server halted", () => {
  it("asks once for the standings when the room refuses the socket as halted, and not for any other refusal", () => {
    const first = asked(opened, "RoomHalted");
    const again = asked(first.model, "RoomHalted");
    const other = asked(opened, "NotAuthorized");

    expect({
      again: again.asks,
      first: first.asks,
      other: other.asks,
      state: haltedOf(first.model),
    }).toStrictEqual({
      again: 0,
      first: 1,
      other: 0,
      state: Option.some("Asking"),
    });
  });

  it("shows each player's buy-in, what they left with, and their net, and copies the standings under the line that says why", () => {
    const shown = update(
      asked(opened, "RoomHalted").model,
      Messages.GotStandings({ view: STANDINGS })
    ).model;

    const copied = update(shown, Messages.ClickedCopySettlement());

    expect({
      rows: haltedRows(STANDINGS).map(({ detail, name, net }) => ({
        detail,
        name,
        net,
      })),
      state: haltedOf(shown),
      text: copied.commands?.map(({ args }) => args),
    }).toStrictEqual({
      rows: [
        { detail: "in 200, left with 201", name: "Ben", net: 1 },
        { detail: "in 200, left with 199", name: "Ana", net: -1 },
      ],
      state: Option.some(HaltedStandings.Shown({ view: STANDINGS })._tag),
      text: [
        {
          copied: "Settlement",
          text: [
            HALTED_LINE,
            "+1 \u2068Ben\u2069 (in 200, left with 201)",
            "-1 \u2068Ana\u2069 (in 200, left with 199)",
            "",
            "nostakes ABC234",
            "+1 \u2068Ben\u2069",
            "-1 \u2068Ana\u2069",
            "",
            "\u2068Ana\u2069 pays 1 to \u2068Ben\u2069",
          ].join("\n"),
        },
      ],
    });
  });
});
