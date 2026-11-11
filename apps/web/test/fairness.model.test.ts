import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Option } from "effect";

import { tonightLine } from "../src/features/fairness-text.js";
import { Messages } from "../src/features/message.js";
import { FairMarks } from "../src/features/model.js";
import type { FairMark, Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

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

const CHECKED = FairMarks.Checked({ cards: 9, round: 1234, timing: "InTime" });

const FAILED = FairMarks.Failed({
  proof: '{"hand":4}',
  reason: "The seal named one round and the deck was ordered with another.",
});

describe("the deck mark for each hand", () => {
  it("counts tonight's sealed hands dealt without drand in one line", () => {
    expect(
      [
        { fromBeacon: 31, withoutBeacon: 9 },
        { fromBeacon: 39, withoutBeacon: 1 },
        { fromBeacon: 1, withoutBeacon: 0 },
      ].map(tonightLine)
    ).toStrictEqual([
      "Dealt without drand tonight: 9 of 40 sealed hands.",
      "Dealt without drand tonight: 1 of 40 sealed hands.",
      "Dealt without drand tonight: none of 1 sealed hand.",
    ]);
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
