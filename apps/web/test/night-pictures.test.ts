import { describe, expect, it } from "@effect/vitest";
import { RoomViewSchema, millis } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { chipsText } from "../src/features/moments/captions.js";
import { recapSvg } from "../src/features/pictures/recap-card.js";
import {
  fitted,
  netText,
  settleUpCardOf,
  settleUpSvg,
  textWidth,
} from "../src/features/pictures/settle-up.js";
import {
  nightLength,
  recapCardOf,
  recapCardsShown,
  shownInRecap,
} from "../src/features/recap.js";

const closedViews = Arbitrary.schema(RoomViewSchema.cases.Closed);

const frames = Arbitrary.schema(Schema.Literals(["Chat", "Story"]));

const themes = Arbitrary.schema(Schema.Literals(["Light", "Dark"]));

const shownText = (svg: string) =>
  svg
    .replaceAll(/<[^>]*>/gu, "\n")
    .split("\n")
    .map((text) => text.trim())
    .filter((text) => text.length > 0);

describe("the settle-up picture", () => {
  it.prop(
    "draws every net and every transfer exactly as the view gives them, and never the room code",
    { frame: frames, theme: themes, view: closedViews },
    ({ frame, theme, view }) => {
      const card = settleUpCardOf(view);

      const svg = settleUpSvg(card, {
        deck: "TwoColour",
        fonts: "",
        frame,
        theme,
      });

      const shown = shownText(svg);

      expect(card.transfers.map(({ amount }) => amount)).toStrictEqual(
        view.settlement.transfers.map(({ amount }) => amount)
      );
      expect(card.players.map(({ net }) => net)).toStrictEqual(
        view.settlement.balances
          .map(({ net }) => net)
          .toSorted((left, right) => right - left)
      );
      expect(
        view.settlement.transfers
          .map(({ amount }) => chipsText(amount))
          .filter((amount) => !shown.includes(amount))
      ).toStrictEqual([]);
      expect(
        view.settlement.balances
          .map(({ net }) => netText(net))
          .filter((net) => !shown.includes(net))
      ).toStrictEqual([]);
      expect(svg.includes(view.code)).toBe(false);
    }
  );

  it("keeps a name that fits and cuts a long one with an ellipsis that fits", () => {
    const longest = "W".repeat(40);
    const cut = fitted(longest, 40, 300);

    expect({
      cut: cut.text.endsWith("…"),
      fits: textWidth(cut.text, 40) <= 300,
      kept: fitted("Ana", 40, 300).text,
    }).toStrictEqual({ cut: true, fits: true, kept: "Ana" });
  });
});

const spanOf = (minutes: number) => ({
  biggestPot: Option.none(),
  hands: 1,
  moments: [],
  span: Option.some({ from: millis(0), to: millis(minutes * 60_000) }),
});

describe("the night's recap on the page", () => {
  it.prop(
    "draws only cards the room's recap holds, the biggest pot as the room counted it, and never the room code",
    { frame: frames, theme: themes, view: closedViews },
    ({ frame, theme, view }) => {
      const card = recapCardOf(view);

      const svg = recapSvg(card, {
        deck: "TwoColour",
        fonts: "",
        frame,
        theme,
      });

      const held = shownInRecap(view.recap);

      expect(
        recapCardsShown(card).filter((cardName) => !held.includes(cardName))
      ).toStrictEqual([]);
      expect(
        Option.toArray(view.recap.biggestPot)
          .map(({ pot }) => chipsText(pot))
          .filter((pot) => !shownText(svg).includes(pot))
      ).toStrictEqual([]);
      expect(svg.includes(view.code)).toBe(false);
    }
  );

  it("says how long the night ran in hours and minutes", () => {
    expect(
      [0, 59, 60, 190].map((minutes) => nightLength(spanOf(minutes)))
    ).toStrictEqual(["1 min", "59 min", "1 h", "3 h 10 min"]);
  });
});
