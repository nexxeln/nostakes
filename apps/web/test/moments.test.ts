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

import { CAPTIONS } from "../src/features/moments/captions.js";
import type { CaptionFacts } from "../src/features/moments/captions.js";
import { pictureSvg } from "../src/features/moments/picture.js";
import { pictureOf } from "../src/features/moments/scene.js";
import {
  LONGEST_SCORE_SECONDS,
  momentScore,
  scoreLength,
} from "../src/features/moments/score.js";

const FACTS: CaptionFacts = {
  against: "Dev",
  bet: 1400,
  category: "FullHouse",
  hand: "kings full of nines",
  other: "four nines",
  percent: 81,
  runs: 2,
  start: "eight-seven",
  who: "Maya",
};

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
    SevenDeuce: () => Moments.SevenDeuce({ ...shared, showdown: true }),
    SplitRuns: () => Moments.SplitRuns({ ...shared, runs: 2 }),
    Suckout: () => Moments.Suckout({ ...shared, odds, street: "Turn" }),
  };

  return facts[kind]();
};

describe("what the table says about a moment", () => {
  it("has a title and a line for every kind and tier the room can call out", () => {
    const missing = everyKindAndTier.filter(
      ({ kind, tier }) => CAPTIONS[kind][tier] === undefined
    );

    expect(missing).toStrictEqual([]);
  });

  it("says it in a few calm words: a title of at most three words and no exclamation marks", () => {
    for (const { kind, tier } of everyKindAndTier) {
      const caption = CAPTIONS[kind][tier]?.(FACTS);

      expect(caption?.title.split(" ").length ?? 0).toBeLessThanOrEqual(3);
      expect(`${caption?.title ?? ""} ${caption?.line ?? ""}`).not.toMatch(
        /!/u
      );
    }
  });
});

describe("the sound of a moment", () => {
  it("is a sting under two seconds for every kind and tier", () => {
    for (const { kind, tier } of everyKindAndTier) {
      expect(scoreLength(momentScore(kind, tier))).toBeLessThanOrEqual(
        LONGEST_SCORE_SECONDS
      );
    }
  });

  it("plays everything a lower tier plays, and more, at each higher tier", () => {
    for (const kind of MOMENT_KINDS) {
      const tiers = TIERS[kind];

      for (const [index, tier] of tiers.entries()) {
        const louder = tiers[index + 1];

        if (louder !== undefined) {
          const quiet = momentScore(kind, tier).map((step) =>
            JSON.stringify(step)
          );

          const loud = momentScore(kind, louder).map((step) =>
            JSON.stringify(step)
          );

          expect(quiet.every((step) => loud.includes(step))).toBe(true);
          expect(loud.length).toBeGreaterThan(quiet.length);
        }
      }
    }
  });
});

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
