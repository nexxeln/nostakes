import { describe, expect, it } from "@effect/vitest";
import { RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { chipsText } from "../src/features/moments/captions.js";
import { recapSvg } from "../src/features/pictures/recap-card.js";
import {
  netText,
  settleUpCardOf,
  settleUpSvg,
} from "../src/features/pictures/settle-up.js";
import {
  recapCardOf,
  recapCardsShown,
  shownInRecap,
} from "../src/features/recap.js";
import { withHandsADeckCanDeal } from "./dealt-recap.js";

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
});

describe("the night's recap on the page", () => {
  it.prop(
    "draws only cards the room's recap holds, the biggest pot as the room counted it, and never the room code",
    { frame: frames, theme: themes, view: closedViews },
    ({ frame, theme, view: generated }) => {
      const view = withHandsADeckCanDeal(generated);
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
});
