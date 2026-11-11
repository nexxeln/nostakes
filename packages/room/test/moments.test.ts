import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  RunCountSchema,
  ShowdownEntries,
  TableConfigSchema,
  evaluate,
} from "@nostakes/engine";
import type { Chips, Command, HandRank, SeatIndex } from "@nostakes/engine";
import { Match, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  MOST_MOMENTS,
  Moments,
  headline,
  momentsCountingEveryBoard,
  momentsOf,
} from "../src/index.js";
import type { Moment, SeenTableEvent } from "../src/index.js";
import {
  act,
  bets,
  calls,
  cardsOf,
  checks,
  chooses,
  feedFor,
  folds,
  generatedHand,
  homeConfig,
  played,
  seat,
  seatedAudiences,
  shows,
  spectatorFeed,
} from "./moment-hands.js";
import type { Scene } from "./moment-hands.js";
import { seededRandom } from "./random.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const FEW_HANDS = { arbitrary: { runs: 40 } };

const EVERY_AUDIENCE = { arbitrary: { runs: 20 } };

const QUICK_CHECKS = { arbitrary: { runs: 80 }, timeout: 120_000 };

const pot = (amount: number): Chips => ChipsSchema.make(amount);

const rankOf = (text: string): HandRank => evaluate(cardsOf(text));

const seats = (...indexes: readonly number[]): readonly SeatIndex[] =>
  indexes.map(seat);

const headsUp = (button: string, other: string, board: string) => {
  const [buttonFirst = "", buttonSecond = ""] = button.split(" ");
  const [otherFirst = "", otherSecond = ""] = other.split(" ");

  return `${otherFirst} ${buttonFirst} ${otherSecond} ${buttonSecond} ${board}`;
};

const checkedDown: readonly Command[] = [
  act(0, calls),
  act(1, checks),
  ...[1, 2, 3].flatMap(() => [act(1, checks), act(0, checks)]),
];

const riverBetCalled: readonly Command[] = [
  act(0, calls),
  act(1, checks),
  ...[1, 2].flatMap(() => [act(1, checks), act(0, checks)]),
  act(1, bets(300)),
  act(0, calls),
];

const allInPreflop: readonly Command[] = [act(0, bets(1000)), act(1, calls)];

const stacks = { 0: 1000, 1: 1000 };

const momentsIn = (scene: Scene) => momentsOf(spectatorFeed(played(scene)));

const kingsCrackAces: Scene = {
  deck: headsUp("Kd Kc", "Ah As", "2c 7h 9s Kh 3d"),
  moves: allInPreflop,
  stacks,
};

const riverOverbet: readonly Command[] = [
  act(0, bets(30)),
  act(1, calls),
  act(1, checks),
  act(0, bets(40)),
  act(1, calls),
  act(1, checks),
  act(0, checks),
  act(1, checks),
  act(0, bets(140)),
];

describe("big hands", () => {
  it("calls out the nut flush that wins a real pot at showdown", () => {
    expect(
      momentsIn({
        deck: headsUp("Kc Qd", "Ah 4h", "9h 7h 2c Jh 5s"),
        moves: riverBetCalled,
        stacks,
      })
    ).toStrictEqual([
      Moments.BigHand({
        pot: pot(620),
        rank: rankOf("Ah 4h 9h 7h 2c Jh 5s"),
        seats: seats(1),
        tier: 1,
      }),
    ]);
  });

  it("lets the nut flush take a pot of a few blinds without a fuss", () => {
    expect(
      momentsIn({
        deck: headsUp("Kc Qd", "Ah 4h", "9h 7h 2c Jh 5s"),
        moves: checkedDown,
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("leaves a king-high flush alone while the ace of that suit is still out", () => {
    expect(
      momentsIn({
        deck: headsUp("Kc Qd", "Kh 4h", "9h 7h 2c Jh 5s"),
        moves: riverBetCalled,
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("makes four nines louder than a flush", () => {
    expect(
      momentsIn({
        deck: headsUp("Kc Qd", "9s 9h", "9c 9d 2s Kd 4c"),
        moves: checkedDown,
        stacks,
      })
    ).toStrictEqual([
      Moments.BigHand({
        pot: pot(20),
        rank: rankOf("9s 9h 9c 9d 2s Kd 4c"),
        seats: seats(1),
        tier: 2,
      }),
    ]);
  });

  it("makes a royal flush the loudest there is", () => {
    expect(
      momentsIn({
        deck: headsUp("Kc Qd", "Ah Kh", "Qh Jh Th 2c 3d"),
        moves: checkedDown,
        stacks,
      }).map((moment) => [moment._tag, moment.tier, moment.seats])
    ).toStrictEqual([["BigHand", 3, seats(1)]]);
  });

  it("says nothing when the board itself holds the hand and everybody plays it", () => {
    expect(
      momentsIn({
        deck: headsUp("2c 3d", "4s 5c", "Ah Kh Qh Jh Th"),
        moves: checkedDown,
        stacks,
      })
    ).toStrictEqual([]);
  });
});

describe("a bluff", () => {
  it("is called out when a pot-sized river bet takes it down and the bettor shows a missed draw", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Ks Qd", "Ah 2h 9c 4s Kc"),
        moves: [...riverOverbet, act(1, folds), shows(0, "8h 7h")],
        stacks,
      })
    ).toStrictEqual([
      Moments.Bluff({
        bet: pot(140),
        pot: pot(140),
        seats: seats(0),
        street: "River",
        tier: 2,
      }),
    ]);
  });

  it("is only a bluff once the cards are shown", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Ks Qd", "Ah 2h 9c 4s Kc"),
        moves: [...riverOverbet, act(1, folds)],
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("is not a bluff when a minimum bet into the blinds takes it down", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Ks Qd", "Ah 2h 9c 4s Kc"),
        moves: [
          act(0, calls),
          act(1, checks),
          act(1, checks),
          act(0, bets(10)),
          act(1, folds),
          shows(0, "8h 7h"),
        ],
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("is not a bluff when a shove takes down a pot of only the blinds", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Ks Qd", "Ah 2h 9c 4s Kc"),
        moves: [
          act(0, calls),
          act(1, checks),
          ...[1, 2].flatMap(() => [act(1, checks), act(0, checks)]),
          act(1, checks),
          act(0, bets(990)),
          act(1, folds),
          shows(0, "8h 7h"),
        ],
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("is not a bluff when the shown hand had a pair of its own", () => {
    expect(
      momentsIn({
        deck: headsUp("9h 7h", "Ks Qd", "Ah 2h 9c 4s 3c"),
        moves: [...riverOverbet, act(1, folds), shows(0, "9h 7h")],
        stacks,
      })
    ).toStrictEqual([]);
  });
});

describe("a hero call", () => {
  it("is called out when king-high calls a river bluff and wins", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Kd Qs", "Ah 2h 9c 4s Jc"),
        moves: [...riverOverbet, act(1, calls)],
        stacks,
      })
    ).toStrictEqual([
      Moments.HeroCall({
        call: pot(140),
        pot: pot(420),
        rank: rankOf("Kd Qs Ah 2h 9c 4s Jc"),
        seats: seats(1, 0),
        street: "River",
        tier: 2,
      }),
    ]);
  });

  it("is not a hero call when the caller held top pair", () => {
    expect(
      momentsIn({
        deck: headsUp("8h 7h", "Ad Qs", "Ah 2h 9c 4s Jc"),
        moves: [...riverOverbet, act(1, calls)],
        stacks,
      })
    ).toStrictEqual([]);
  });
});

describe("a bad beat and a suckout", () => {
  it("calls aces cracked by a river king a bad beat, and the kings a suckout", () => {
    expect(momentsIn(kingsCrackAces)).toStrictEqual([
      Moments.BadBeat({
        odds: { exact: false, percent: 81 },
        pot: pot(2000),
        rank: rankOf("Ah As 2c 7h 9s Kh 3d"),
        seats: seats(1, 0),
        street: "Preflop",
        tier: 1,
        winningRank: rankOf("Kd Kc 2c 7h 9s Kh 3d"),
      }),
      Moments.Suckout({
        odds: { exact: false, percent: 19 },
        pot: pot(2000),
        seats: seats(0, 1),
        street: "Preflop",
        tier: 1,
      }),
    ]);
  });

  it("makes a two-outer on the river louder than a preflop coin flip gone wrong", () => {
    const moments = momentsIn({
      deck: headsUp("Qd Qc", "Ah As", "2c 7h 9s 4d Qh"),
      moves: [
        act(0, calls),
        act(1, checks),
        act(1, checks),
        act(0, checks),
        act(1, bets(990)),
        act(0, calls),
      ],
      stacks,
    });

    expect(
      moments.map((moment) => [
        moment._tag,
        moment.tier,
        "odds" in moment ? moment.odds : undefined,
      ])
    ).toStrictEqual([
      ["BadBeat", 3, { exact: true, percent: 95 }],
      ["Suckout", 3, { exact: true, percent: 5 }],
    ]);
  });

  it("needs the loser's cards on the table: aces mucked at the showdown are no bad beat", () => {
    expect(
      momentsIn({
        config: TableConfigSchema.make({ ...homeConfig, allInHands: "Hidden" }),
        deck: headsUp("Ah As", "Kd Kc", "2c 7h 9s Kh 3d"),
        moves: allInPreflop,
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("is no bad beat in a small pot", () => {
    expect(
      momentsIn({
        deck: headsUp("Kd Kc", "Ah As", "2c 7h 9s Kh 3d"),
        moves: checkedDown,
        stacks,
      })
    ).toStrictEqual([]);
  });
});

describe("a cooler", () => {
  it("calls kings all in against aces a cooler when the aces hold", () => {
    expect(
      momentsIn({
        deck: headsUp("Kd Kc", "Ah As", "2c 7h 9s 4d 3c"),
        moves: allInPreflop,
        stacks,
      })
    ).toStrictEqual([
      Moments.Cooler({
        pot: pot(2000),
        rank: rankOf("Kd Kc 2c 7h 9s 4d 3c"),
        seats: seats(0, 1),
        street: "Preflop",
        tier: 1,
        winningRank: rankOf("Ah As 2c 7h 9s 4d 3c"),
      }),
    ]);
  });

  it("puts a full house under a bigger one above the big hand that won it", () => {
    expect(
      momentsIn({
        deck: headsUp("7c 7d", "9s 9h", "9c 7h 2s 2d 4c"),
        moves: [
          act(0, calls),
          act(1, checks),
          act(1, bets(50)),
          act(0, bets(990)),
          act(1, calls),
        ],
        stacks,
      }).map((moment) => [moment._tag, moment.tier, moment.seats])
    ).toStrictEqual([
      ["Cooler", 2, seats(0, 1)],
      ["BigHand", 1, seats(1)],
    ]);
  });
});

describe("the rest of the catalogue", () => {
  it("cheers the seven-deuce that wins", () => {
    expect(
      momentsIn({
        deck: headsUp("7c 2d", "Qs Jd", "7h 2s Kd 9c 4h"),
        moves: checkedDown,
        stacks,
      })
    ).toStrictEqual([
      Moments.SevenDeuce({
        bounty: pot(0),
        pot: pot(20),
        seats: seats(0),
        showdown: true,
        tier: 1,
      }),
    ]);
  });

  it("notices two players all in with the same hand chopping it", () => {
    expect(
      momentsIn({
        deck: headsUp("Ac Ks", "Ah Kd", "2c 7h 9s 4d 3d"),
        moves: allInPreflop,
        stacks,
      })
    ).toStrictEqual([
      Moments.SameHand({
        pot: pot(2000),
        rank: rankOf("Ac Ks 2c 7h 9s 4d 3d"),
        seats: seats(1, 0),
        tier: 1,
      }),
    ]);
  });

  it("calls a chop on a board that plays for both nothing special", () => {
    expect(
      momentsIn({
        deck: headsUp("2c 3d", "4s 5c", "Ah Kh Qh Jh Th"),
        moves: allInPreflop,
        stacks,
      })
    ).toStrictEqual([]);
  });

  it("leaves a board run twice alone when the same hand wins both runs", () => {
    expect(
      momentsIn({
        config: TableConfigSchema.make({
          ...homeConfig,
          maxRuns: RunCountSchema.make(2),
        }),
        deck: headsUp("Kd Kc", "Ah As", "2c 7h 9s 4d 3c Jh 8d 5s Jc 6h"),
        moves: [...allInPreflop, chooses(0, 2), chooses(1, 2)],
        stacks,
      }).map((moment) => moment._tag)
    ).toStrictEqual(["Cooler"]);
  });

  it("notices a board run twice that goes one way and then the other", () => {
    expect(
      momentsIn({
        config: TableConfigSchema.make({
          ...homeConfig,
          maxRuns: RunCountSchema.make(2),
        }),
        deck: headsUp("Kd Kc", "Ah As", "2c 7h 9s 4d 3c Kh 8d 5s Jc 6h"),
        moves: [...allInPreflop, chooses(0, 2), chooses(1, 2)],
        stacks,
      }).map((moment) => [moment._tag, moment.tier, moment.seats])
    ).toStrictEqual([["SplitRuns", 1, seats(1, 0)]]);
  });
});

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

const kindsAndSeats = (moments: readonly Moment[]) =>
  moments.map((moment) => `${moment._tag} ${moment.seats.join(",")}`);

describe("the headline the table shows", () => {
  const beat = momentsIn(kingsCrackAces);

  it("leads with the bad beat and does not repeat it as a suckout", () => {
    expect(
      Option.map(headline(beat, "All"), ({ also, lead }) => [
        kindsAndSeats([lead]),
        Option.isSome(also),
      ])
    ).toStrictEqual(Option.some([["BadBeat 1,0"], false]));
  });

  it("tells the same hand as the winner's suckout when the host spares the painful ones", () => {
    expect(
      Option.map(headline(beat, "SkipPainful"), ({ lead }) =>
        kindsAndSeats([lead])
      )
    ).toStrictEqual(Option.some(["Suckout 0,1"]));
  });

  it("says nothing when the host turns moments off", () => {
    expect(headline(beat, "Off")).toStrictEqual(Option.none());
  });
});

describe("moments any device can compute", () => {
  it.prop(
    "a spectator and every player dealt in compute the same moments for the same hand",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const seen = momentsOf(spectatorFeed(events));

      for (const audience of seatedAudiences(events)) {
        expect(momentsOf(feedFor(events, audience))).toStrictEqual(seen);
      }
    },
    EVERY_AUDIENCE
  );

  it.prop(
    "a hand in which nobody's two cards were public has no moment except a board run twice that split",
    { seed: handSeed },
    ({ seed }) => {
      const feed = spectatorFeed(generatedHand(seededRandom(seed)));
      const moments = momentsOf(feed);

      if (bothCardsPublicSomewhere(feed)) {
        return;
      }

      expect(
        moments.filter((moment) => !Moments.$is("SplitRuns")(moment))
      ).toStrictEqual([]);
    },
    FEW_HANDS
  );

  it.prop(
    "a quick look at the first boards never hides a moment that counting every board would call",
    { seed: handSeed },
    ({ seed }) => {
      const feed = spectatorFeed(generatedHand(seededRandom(seed)));

      expect(momentsOf(feed)).toStrictEqual(momentsCountingEveryBoard(feed));
    },
    QUICK_CHECKS
  );

  it.prop(
    "a hand has at most a few moments, the loudest first",
    { seed: handSeed },
    ({ seed }) => {
      const moments = momentsOf(
        spectatorFeed(generatedHand(seededRandom(seed)))
      );

      const tiers = moments.map((moment) => moment.tier);

      expect(moments.length).toBeLessThanOrEqual(MOST_MOMENTS);
      expect(tiers).toStrictEqual(
        tiers.toSorted((left, right) => right - left)
      );
    },
    FEW_HANDS
  );
});
