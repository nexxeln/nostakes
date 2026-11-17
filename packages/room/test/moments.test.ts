import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  HandRankSchema,
  SeatIndexSchema,
  ShowdownEntries,
} from "@nostakes/engine";
import { Match, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Moments, momentsOf, ranked } from "../src/index.js";
import type { SeenTableEvent } from "../src/index.js";
import {
  feedFor,
  generatedHand,
  seatedAudiences,
  spectatorFeed,
} from "./moment-hands.js";
import { seededRandom } from "./random.js";
import { generated } from "./scale.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const PICK_STRIDE = 7;

const publicCards = (event: SeenTableEvent) =>
  Match.value(event).pipe(
    Match.tags({
      CardsShown: ({ cards, seat: shown }) => [{ cards, seat: shown }],
      HandTabled: ({ cards, seat: shown }) => [{ cards, seat: shown }],
      HandsTabled: ({ hands }) => hands,
      ShowdownReached: ({ order }) =>
        order.flatMap((entry) =>
          ShowdownEntries.$is("Shown")(entry)
            ? [{ cards: entry.cards, seat: entry.seat }]
            : []
        ),
    }),
    Match.orElse(() => [])
  );

const bothCardsPublicSomewhere = (feed: readonly SeenTableEvent[]) => {
  const seen = new Map<number, Set<number>>();

  for (const { cards, seat: shown } of feed.flatMap(publicCards)) {
    seen.set(shown, new Set([...(seen.get(shown) ?? []), ...cards]));
  }

  return [...seen.values()].some((cards) => cards.size >= 2);
};

describe("moments any device can compute", () => {
  it.prop(
    "a spectator and any player dealt in compute the same moments for the same hand",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const seen = momentsOf(spectatorFeed(events));
      const seated = seatedAudiences(events);

      const picked = [
        seated[seed % seated.length],
        seated[Math.floor(seed / PICK_STRIDE) % seated.length],
      ].filter((audience) => audience !== undefined);

      for (const audience of picked) {
        expect(momentsOf(feedFor(events, audience))).toStrictEqual(seen);
      }
    },
    generated(10, 40)
  );

  it.prop(
    "on a double board, a spectator and any player dealt in compute the same moments, each naming a board the hand dealt",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed), { doubleBoard: true });
      const seen = momentsOf(spectatorFeed(events));

      for (const audience of seatedAudiences(events)) {
        expect(momentsOf(feedFor(events, audience))).toStrictEqual(seen);
      }

      expect(
        seen.every(
          (moment) =>
            !("board" in moment) ||
            moment.board === undefined ||
            moment.board === 1 ||
            moment.board === 2
        )
      ).toBe(true);
    },
    generated(30, 240)
  );

  it.prop(
    "a hand in which nobody's two cards were public has no moment except a board run twice that split",
    { seed: handSeed },
    ({ seed }) => {
      const feed = spectatorFeed(generatedHand(seededRandom(seed)));

      if (bothCardsPublicSomewhere(feed)) {
        return;
      }

      expect(
        momentsOf(feed).filter((moment) => !Moments.$is("SplitRuns")(moment))
      ).toStrictEqual([]);
    },
    generated(20, 40)
  );
});

describe("the moment a hand leads with", () => {
  it("is the one about two seats when a nut flush is also a cooler", () => {
    const pot = ChipsSchema.make(1200);
    const rank = HandRankSchema.make(2_400_000);
    const winner = SeatIndexSchema.make(2);
    const loser = SeatIndexSchema.make(4);

    const [lead] = ranked([
      Moments.BigHand({ pot, rank, seats: [winner], tier: 2 }),
      Moments.Cooler({
        pot,
        rank,
        seats: [loser, winner],
        street: "River",
        tier: 2,
        winningRank: rank,
      }),
    ]);

    expect(lead?._tag).toBe("Cooler");
  });
});
