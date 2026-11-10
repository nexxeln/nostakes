import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { fairParagraph } from "../src/features/fairness-text.js";
import { Messages } from "../src/features/message.js";
import { FairMarks, Screens } from "../src/features/model.js";
import type { FairMark, Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const marks = Arbitrary.schema(FairMarks);

const room = init({
  deck: "TwoColour",
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const judgedIn = (model: Model, hand: number, mark: FairMark) =>
  update(model, Messages.JudgedHand({ hand, mark })).model;

const handsOf = (model: Model) =>
  Screens.guards.Room(model.screen)
    ? model.screen.room.fairness.map(({ hand }) => hand)
    : [];

const CHECKED = FairMarks.Checked({ cards: 9, round: 1234, timing: "InTime" });

const FAILED = FairMarks.Failed({
  proof: '{"hand":4}',
  reason: "The seal named one round and the deck was ordered with another.",
});

describe("the deck mark for each hand", () => {
  it.prop(
    "says in one plain paragraph which hand it is about, and asks for the proof only when the check failed",
    { mark: marks },
    ({ mark }) => {
      const text = fairParagraph({ hand: 17, mark });

      expect({
        asksForProof: text.includes("Copy the proof"),
        namesHand: text.startsWith("Hand 17 "),
        sentence: text.endsWith("."),
      }).toStrictEqual({
        asksForProof: FairMarks.guards.Failed(mark),
        namesHand: true,
        sentence: true,
      });
    }
  );

  it("keeps one mark per hand, newest first", () => {
    const marked = judgedIn(
      judgedIn(judgedIn(room, 3, CHECKED), 5, CHECKED),
      3,
      FAILED
    );

    expect(handsOf(marked)).toStrictEqual([5, 3]);
  });

  it("copies the proof of a failed hand and nothing for a hand that passed", () => {
    const marked = judgedIn(judgedIn(room, 3, CHECKED), 4, FAILED);
    const failed = update(marked, Messages.ClickedCopyProof({ hand: 4 }));
    const passed = update(marked, Messages.ClickedCopyProof({ hand: 3 }));

    expect(
      failed.commands?.map(({ args, name }) => ({ args, name }))
    ).toStrictEqual([
      { args: { copied: "Proof", text: '{"hand":4}' }, name: "CopyText" },
    ]);
    expect(passed.commands ?? []).toStrictEqual([]);
  });
});
