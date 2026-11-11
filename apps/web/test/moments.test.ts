import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  HandRankSchema,
  SeatIndexSchema,
  cardText,
} from "@nostakes/engine";
import { MOMENT_KINDS, Moments, RoomViewSchema, TIERS } from "@nostakes/room";
import type { Moment, MomentKind, Tier } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { pictureSvg } from "../src/features/moments/picture.js";
import { pictureOf } from "../src/features/moments/scene.js";

const everyKindAndTier = MOMENT_KINDS.flatMap((kind) =>
  TIERS[kind].map((tier) => ({ kind, tier }))
);

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const pick = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 10_000, minimum: 0 }))
);

const momentAt = (
  kind: MomentKind,
  tier: Tier,
  seats: readonly number[]
): Moment => {
  const shared = {
    pot: ChipsSchema.make(400),
    seats: seats.map((seat) => SeatIndexSchema.make(seat)),
    tier,
  };

  const odds = { exact: true, percent: 81 };
  const rank = HandRankSchema.make(2_400_000);

  const facts = {
    BadBeat: () =>
      Moments.BadBeat({
        ...shared,
        odds,
        rank,
        street: "Turn",
        winningRank: rank,
      }),
    BigHand: () => Moments.BigHand({ ...shared, rank }),
    Bluff: () =>
      Moments.Bluff({ ...shared, bet: ChipsSchema.make(200), street: "River" }),
    Cooler: () =>
      Moments.Cooler({
        ...shared,
        rank,
        street: "Flop",
        winningRank: rank,
      }),
    HeroCall: () =>
      Moments.HeroCall({
        ...shared,
        call: ChipsSchema.make(200),
        rank,
        street: "River",
      }),
    SameHand: () => Moments.SameHand({ ...shared, rank }),
    SevenDeuce: () =>
      Moments.SevenDeuce({
        ...shared,
        bounty: ChipsSchema.make(0),
        showdown: true,
      }),
    SplitRuns: () => Moments.SplitRuns({ ...shared, runs: 2 }),
    Suckout: () => Moments.Suckout({ ...shared, odds, street: "Turn" }),
  };

  return facts[kind]();
};

describe("the picture of a moment", () => {
  it.prop(
    "shows only cards the table was shown, and never the room code",
    { kindPick: pick, seatPick: pick, view: views },
    ({ kindPick, seatPick, view }) => {
      const lastHand = Option.getOrUndefined(view.lastHand);

      if (lastHand === undefined) {
        return;
      }

      const { kind, tier } = everyKindAndTier[
        kindPick % everyKindAndTier.length
      ] ?? { kind: "BigHand", tier: 1 };

      const seats = lastHand.dealtIn.map((dealt) => dealt.seat);
      const first = seats[seatPick % Math.max(1, seats.length)] ?? 0;
      const second = seats[(seatPick + 1) % Math.max(1, seats.length)] ?? 1;

      const picture = pictureOf([...view.members, ...view.departed], lastHand, {
        also: Option.none(),
        lead: momentAt(kind, tier, [first, second]),
      });

      const shown = new Set([
        ...lastHand.shown.flatMap((each) => each.cards.map(cardText)),
        ...lastHand.boards.flat().map(cardText),
      ]);

      const pictured = [
        ...picture.faces.flatMap((face) => face.cards),
        ...picture.boards.flat(),
        ...picture.lifted,
      ];

      const svg = pictureSvg(picture, {
        deck: "TwoColour",
        fonts: "",
        frame: "Chat",
        theme: "Light",
      });

      expect(pictured.filter((card) => !shown.has(card))).toStrictEqual([]);
      expect(svg.includes(view.code)).toBe(false);
    }
  );
});
