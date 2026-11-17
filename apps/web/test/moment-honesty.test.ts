import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Antes,
  BettingLimits,
  BombPots,
  ChipsSchema,
  HandRankSchema,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShowdownEntries,
  TableConfigSchema,
  TableStates,
  cardText,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "@nostakes/engine";
import type { Command, Event, TableState } from "@nostakes/engine";
import {
  Audiences,
  Moments,
  NameSchema,
  ReplaySteps,
  RoomEvents,
  SeenEvents,
  headline,
  millis,
  momentsOf,
  redact,
  replayOf,
} from "@nostakes/room";
import type {
  Audience,
  Headline,
  Moment,
  Replay,
  SeenTableEvent,
} from "@nostakes/room";
import { Match, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { buildPlan } from "../src/features/moments/build.js";
import type { BuildPlan } from "../src/features/moments/build.js";
import type { DriftPlan } from "../src/features/moments/drift/plan.js";
import type { Person } from "../src/features/moments/element.js";
import { reelPartOf, reelPlan } from "../src/features/moments/reel.js";
import type { ReelPlan } from "../src/features/moments/reel.js";
import type { LastHand } from "../src/features/moments/scene.js";
import { replayFor, sceneFor } from "../src/features/moments/scene.js";
import type { MomentPicture } from "../src/features/moments/schema.js";
import { slipOf } from "../src/features/moments/slip.js";
import type { SeatStack } from "../src/features/moments/watch.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const HANDS = { arbitrary: { runs: 60 }, timeout: 120_000 };

const chipCount = (amount: number) => ChipsSchema.make(amount);

const randomFrom = (seed: number) => {
  let state = seed % 2_147_483_647;

  return (below: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, below);
  };
};

const applied = (state: TableState, command: Command) => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw new Error(`${command._tag} was refused: ${decision.failure._tag}`);
  }

  let next = state;

  for (const event of decision.success) {
    next = evolve(next, event);
  }

  return { events: decision.success, state: next };
};

const shuffled = (below: (count: number) => number) => {
  const cards = Array.from({ length: 52 }, (_, index) => index);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return Schema.decodeSync(DeckSchema)(cards);
};

const nextMove = (
  state: TableState,
  below: (count: number) => number
): Command =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) => {
      const roll = below(100);

      if (roll < 15) {
        return Commands.Act({
          action: legal.canCheck ? Actions.Check() : Actions.Fold(),
          seat: legal.seat,
        });
      }

      const calm = legal.canCheck ? Actions.Check() : Actions.Call();

      return Option.match(legal.raise, {
        onNone: () => Commands.Act({ action: calm, seat: legal.seat }),
        onSome: ({ maxTo, minTo }) =>
          Commands.Act({
            action:
              roll < 60
                ? calm
                : Actions.RaiseTo({
                    to: chipCount(
                      roll < 85
                        ? Math.min(maxTo, minTo + below(Math.max(1, minTo * 2)))
                        : maxTo
                    ),
                  }),
            seat: legal.seat,
          }),
      });
    },
    ChooseRuns: ({ maxRuns, seats }) =>
      Commands.ChooseRuns({
        runs: RunCountSchema.make(1 + below(maxRuns)),
        seat: seats[0] ?? SeatIndexSchema.make(0),
      }),
    Nothing: () => Commands.StartHand({ deck: shuffled(below), straddles: [] }),
    Show: ({ choices }) =>
      choices.canMuck && below(3) === 0
        ? Commands.MuckHand({ seat: choices.seat })
        : Commands.TableHand({ seat: choices.seat }),
  });

const playedHand = (seed: number) => {
  const below = randomFrom(seed);
  const players = 2 + below(8);

  let state = initialTable(
    TableConfigSchema.make({
      allInHands: below(3) === 0 ? "Hidden" : "FaceUp",
      ante:
        below(4) === 0
          ? Antes.EveryPlayer({ amount: chipCount(1 + below(5)) })
          : Antes.NoAnte(),
      bigBlind: chipCount(10),
      bombPot:
        below(4) === 0
          ? BombPots.BombPots({
              ante: chipCount(10 + below(30)),
              boardCount: below(3) === 0 ? 1 : 2,
              everyHands: 1,
            })
          : BombPots.NoBombPots(),
      game: seed % 3 === 0 ? "Omaha" : "Holdem",
      limit:
        seed % 3 === 0 ? BettingLimits.PotLimit() : BettingLimits.NoLimit(),
      maxRuns: RunCountSchema.make(1 + below(3)),
      rabbitHunt: false,
      showdown: below(3) === 0 ? "Interactive" : "Automatic",
      smallBlind: chipCount(5),
      straddle: { button: false, underTheGun: 0 },
    })
  );

  const buyIns: SeatStack[] = [];

  for (let index = 0; index < players; index += 1) {
    const buyIn = 50 + below(1500);

    buyIns.push({ seat: SeatIndexSchema.make(index), stack: buyIn });
    ({ state } = applied(
      state,
      Commands.SitDown({
        buyIn: chipCount(buyIn),
        player: PlayerIdSchema.make(`p${index}`),
        seat: SeatIndexSchema.make(index),
      })
    ));
  }

  const events: Event[] = [];

  do {
    const step = applied(state, nextMove(state, below));

    events.push(...step.events);
    ({ state } = step);
  } while (TableStates.$is("InHand")(state));

  const after = state.seats.flatMap((occupant, index) =>
    Seats.$is("Occupied")(occupant)
      ? [{ seat: SeatIndexSchema.make(index), stack: occupant.stack }]
      : []
  );

  return { after, buyIns, events };
};

const generatedHand = (seed: number): readonly Event[] =>
  playedHand(seed).events;

const feedFor = (
  events: readonly Event[],
  audience: Audience
): readonly SeenTableEvent[] =>
  events.flatMap((event) => {
    const seen = redact(RoomEvents.Table({ at: millis(0), event }), audience);

    return SeenEvents.$is("Table")(seen) ? [seen.event] : [];
  });

const audiencesOf = (events: readonly Event[]) =>
  events.flatMap((event) =>
    Events.$is("HoleCardsDealt")(event)
      ? [
          Audiences.Seated({
            player: PlayerIdSchema.make(`p${event.seat}`),
            seat: event.seat,
          }),
        ]
      : []
  );

const revealedIn = (event: SeenTableEvent) =>
  Match.value(event).pipe(
    Match.tags({
      CardsShown: ({ cards }) => cards,
      HandTabled: ({ cards }) => cards,
      HandsTabled: ({ hands }) => hands.flatMap((hand) => hand.cards),
      ShowdownReached: ({ order }) =>
        order.flatMap((entry) =>
          ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
        ),
      StreetDealt: ({ cards }) => cards,
    }),
    Match.orElse(() => [])
  );

const peopleOf = (replay: Replay): readonly Person[] =>
  replay.dealtIn.map((seat) => ({
    avatar: "",
    name: NameSchema.make(`Player ${seat}`),
    player: PlayerIdSchema.make(`p${seat}`),
  }));

const lastHandOf = (replay: Replay): LastHand => {
  const folded = new Set(
    replay.steps.flatMap((step) =>
      ReplaySteps.$is("Acted")(step) && step.act === "Fold" ? [step.seat] : []
    )
  );

  const streets = replay.steps.flatMap((step) =>
    ReplaySteps.$is("StreetDealt")(step) ? [step] : []
  );

  const runsFrom =
    replay.steps.find((step) => ReplaySteps.$is("Runs")(step) && step.runs > 1)
      ?.at ?? Infinity;

  const runs = Math.max(1, ...streets.map((street) => street.run));

  const common =
    replay.boards > 1
      ? []
      : streets
          .filter((street) => street.run === 1 && street.at < runsFrom)
          .flatMap((street) => street.cards);

  const boards = Array.from({ length: runs }, (_, index) => {
    const run = index + 1;

    const own = streets
      .filter((street) => street.run === run)
      .flatMap((street) => street.cards);

    return run === 1 || replay.boards > 1 ? own : [...common, ...own];
  });

  return {
    awards: [],
    boards,
    bounty: Option.none(),
    dealtIn: replay.dealtIn.map((seat) => ({
      folded: folded.has(seat),
      player: PlayerIdSchema.make(`p${seat}`),
      seat,
    })),
    doubleBoard: replay.boards > 1,
    game: replay.game,
    handNumber: replay.handNumber,
    mucked: [],
    rabbit: [],
    shown: replay.tabled.map(({ cards, seat }) => ({
      cards,
      player: PlayerIdSchema.make(`p${seat}`),
      seat,
    })),
    yourCards: [],
  };
};

const KINDS = ["Cooler", "Bluff", "HeroCall", "BigHand", "BadBeat"] as const;

const madeUp = (replay: Replay, seed: number): Moment => {
  const [first = SeatIndexSchema.make(0), second = SeatIndexSchema.make(1)] =
    replay.dealtIn.slice(seed % 2);

  const pot = ChipsSchema.make(400);
  const rank = HandRankSchema.make(2_400_000);
  const kind = KINDS[seed % KINDS.length] ?? "Cooler";

  return Match.value(kind).pipe(
    Match.when("Bluff", () =>
      Moments.Bluff({ bet: pot, pot, seats: [first], street: "River", tier: 2 })
    ),
    Match.when("HeroCall", () =>
      Moments.HeroCall({
        call: pot,
        pot,
        rank,
        seats: [first, second],
        street: "River",
        tier: 2,
      })
    ),
    Match.when("BigHand", () =>
      Moments.BigHand({ pot, rank, seats: [first], tier: 2 })
    ),
    Match.when("BadBeat", () =>
      Moments.BadBeat({
        odds: { exact: true, percent: 81 },
        pot,
        rank,
        seats: [first, second],
        street: "Turn",
        tier: 3,
        winningRank: rank,
      })
    ),
    Match.orElse(() =>
      Moments.Cooler({
        pot,
        rank,
        seats: [first, second],
        street: "River",
        tier: 2,
        winningRank: rank,
      })
    )
  );
};

interface Told {
  readonly found: Headline;
  readonly lastHand: LastHand;
  readonly people: readonly Person[];
}

const toldFrom = (
  spectator: readonly SeenTableEvent[],
  seed: number
): Option.Option<Told> =>
  replayFor(spectator).pipe(
    Option.map((replay) => ({
      found: Option.getOrElse(headline(momentsOf(spectator), "All"), () => ({
        also: Option.none<Moment>(),
        lead: madeUp(replay, seed),
      })),
      lastHand: lastHandOf(replay),
      people: peopleOf(replay),
    }))
  );

const sceneOfTold = (told: Told, record: readonly SeenTableEvent[]) =>
  sceneFor(told.people, told.lastHand, told.found, record);

const planFor = (
  told: Told,
  record: readonly SeenTableEvent[],
  seed: number
): BuildPlan => {
  const { picture, story } = sceneOfTold(told, record);

  return buildPlan(picture, story, {
    calm: seed % 5 === 0,
    deck: "TwoColour",
    frame: seed % 2 === 0 ? "Story" : "Chat",
    theme: seed % 3 === 0 ? "Dark" : "Light",
  });
};

const shownBy = (spectator: readonly SeenTableEvent[]) =>
  new Set(spectator.flatMap(revealedIn).map((card) => cardText(card)));

const pictured = (picture: MomentPicture) => [
  ...picture.seats.flatMap((seat) => [...seat.cards, ...seat.playing]),
  ...picture.boards.flat(),
  ...picture.lifted,
  ...(picture.flag === null ? [] : [picture.flag.card]),
];

const faceUp = (plan: BuildPlan) =>
  plan.shots.flatMap((shot) =>
    shot.shows.map((card) => ({ card, shownAt: shot.keys[0]?.at ?? 0 }))
  );

const boardTooSoon = (
  plan: BuildPlan,
  spectator: readonly SeenTableEvent[]
) => {
  const order = spectator.flatMap((event) =>
    Events.$is("StreetDealt")(event) ? event.cards.map(cardText) : []
  );

  const dealtAt = new Map(plan.dealt.map((each) => [each.card, each.at]));

  const outOfOrder = order.flatMap((card, index) => {
    const before = order[index - 1];

    return before === undefined ||
      (dealtAt.get(before) ?? -1) <= (dealtAt.get(card) ?? -1)
      ? []
      : [{ before, card }];
  });

  const early = faceUp(plan).flatMap(({ card, shownAt }) =>
    order.includes(card) && shownAt < (dealtAt.get(card) ?? Infinity)
      ? [{ card, shownAt }]
      : []
  );

  const listed = new Set(plan.dealt.map((each) => each.card));
  const missing = [...new Set(order)].filter((card) => !listed.has(card));

  return [
    ...outOfOrder,
    ...early,
    ...missing.map((card) => ({ card, missing: true })),
  ];
};

const everyDevice = (events: readonly Event[]) => [
  Audiences.Spectator(),
  ...audiencesOf(events),
];

const eachDevice = <A>(
  seed: number,
  look: (
    told: Told,
    feed: readonly SeenTableEvent[],
    spectator: readonly SeenTableEvent[]
  ) => A
): readonly A[] => {
  const events = generatedHand(seed);
  const spectator = feedFor(events, Audiences.Spectator());

  return Option.match(toldFrom(spectator, seed), {
    onNone: () => [],
    onSome: (told) =>
      everyDevice(events).map((audience) =>
        look(told, feedFor(events, audience), spectator)
      ),
  });
};

describe("a moment's picture and clip", () => {
  it.prop(
    "never show a card face up that the table was not shown, in the picture, the slip, or the clip, on any device",
    { seed: handSeed },
    ({ seed }) => {
      expect(
        eachDevice(seed, (told, feed, spectator) => {
          const shown = shownBy(spectator);
          const { picture } = sceneOfTold(told, feed);

          const slipped = Option.match(
            slipOf(
              {
                callouts: "All",
                deck: "TwoColour",
                lastHand: told.lastHand,
                people: told.people,
                record: feed,
                theme: "Light",
              },
              picture
            ),
            {
              onNone: () => [],
              onSome: (slip) => [
                ...slip.streets.flatMap((street) => street.cards),
                ...slip.players.flatMap((player) => player.cards),
              ],
            }
          );

          return [
            ...pictured(picture),
            ...slipped,
            ...faceUp(planFor(told, feed, seed)).map(({ card }) => card),
          ].filter((card) => !shown.has(card));
        }).flat()
      ).toStrictEqual([]);
    },
    HANDS
  );

  it.prop(
    "show no board card in the clip before the beat that deals it",
    { seed: handSeed },
    ({ seed }) => {
      expect(
        eachDevice(seed, (told, feed, spectator) =>
          boardTooSoon(planFor(told, feed, seed), spectator)
        ).flat()
      ).toStrictEqual([]);
    },
    HANDS
  );

  it.prop(
    "are the same on every device",
    { seed: handSeed },
    ({ seed }) => {
      const drawn = eachDevice(seed, (told, feed) =>
        JSON.stringify([sceneOfTold(told, feed), planFor(told, feed, seed)])
      );

      expect(new Set(drawn).size).toBeLessThanOrEqual(1);
    },
    HANDS
  );

  it.prop(
    "draw both players' shown cards when the lead moment names two seats",
    { seed: handSeed },
    ({ seed }) => {
      expect(
        eachDevice(seed, (told, feed) => {
          const seats = [...new Set(told.found.lead.seats)];

          if (seats.length !== 2) {
            return [];
          }

          const { picture } = sceneOfTold(told, feed);

          const drawnCards = new Set(
            picture.seats.flatMap((seat) => seat.cards)
          );

          return told.lastHand.shown
            .filter((shown) => seats.includes(shown.seat))
            .flatMap((shown) => shown.cards.map(cardText))
            .filter((card) => !drawnCards.has(card));
        }).flat()
      ).toStrictEqual([]);
    },
    HANDS
  );
});

const evenChances = ({
  holes,
}: {
  readonly holes: readonly unknown[];
}): readonly number[] =>
  holes.map((_, index) => (index === 0 ? 100 - (holes.length - 1) * 11 : 11));

const REEL_HANDS = { arbitrary: { runs: 30 }, timeout: 120_000 };

const reelPart = (told: Told, feed: readonly SeenTableEvent[], seed: number) =>
  replayOf(feed, evenChances).pipe(
    Option.map((replay) =>
      reelPartOf(
        {
          hand: {
            callouts: "All",
            deck: "TwoColour",
            lastHand: told.lastHand,
            people: told.people,
            record: feed,
            theme: "Light",
          },
          scene: sceneOfTold(told, feed),
        },
        replay,
        { calm: seed % 3 === 0, deck: "TwoColour", theme: "Light" }
      )
    )
  );

interface NightOfTwo {
  readonly devices: readonly {
    readonly first: DriftPlan;
    readonly reel: ReelPlan;
  }[];
  readonly firstFeed: readonly SeenTableEvent[];
}

const nightOfTwo = (seed: number): Option.Option<NightOfTwo> => {
  const second = generatedHand(seed + 1);
  const secondFeed = feedFor(second, Audiences.Spectator());

  return toldFrom(secondFeed, seed + 1).pipe(
    Option.flatMap((secondTold) => reelPart(secondTold, secondFeed, seed)),
    Option.map((secondPart) => {
      const first = generatedHand(seed);
      const firstFeed = feedFor(first, Audiences.Spectator());

      return {
        devices: Option.match(toldFrom(firstFeed, seed), {
          onNone: () => [],
          onSome: (firstTold) =>
            everyDevice(first).flatMap((audience) =>
              Option.toArray(
                reelPart(firstTold, feedFor(first, audience), seed).pipe(
                  Option.map((firstPart) => ({
                    first: firstPart,
                    reel: reelPlan([firstPart, secondPart], { svg: "" }),
                  }))
                )
              )
            ),
        }),
        firstFeed,
      };
    })
  );
};

const partFaceUp = (plan: DriftPlan) =>
  plan.shots.flatMap((shot) =>
    shot.shows.map((card) => ({ card, shownAt: shot.keys[0]?.at ?? 0 }))
  );

const partTooSoon = (plan: DriftPlan, spectator: readonly SeenTableEvent[]) => {
  const order = spectator.flatMap((event) =>
    Events.$is("StreetDealt")(event) ? event.cards.map(cardText) : []
  );

  const dealtAt = new Map(plan.dealt.map((each) => [each.card, each.at]));

  const outOfOrder = order.flatMap((card, index) => {
    const before = order[index - 1];

    return before === undefined ||
      (dealtAt.get(before) ?? -1) <= (dealtAt.get(card) ?? -1)
      ? []
      : [{ before, card }];
  });

  const early = partFaceUp(plan).flatMap(({ card, shownAt }) =>
    order.includes(card) && shownAt < (dealtAt.get(card) ?? Infinity)
      ? [{ card, shownAt }]
      : []
  );

  return [...outOfOrder, ...early];
};

describe("a moment that names more than two seats", () => {
  it.prop(
    "draws two of its own seats and names every one of them in its line",
    { seed: handSeed },
    ({ seed }) => {
      expect(
        eachDevice(seed, (told, feed) => {
          const seats = [...new Set(told.found.lead.seats)];

          if (seats.length <= 2) {
            return [];
          }

          const { picture } = sceneOfTold(told, feed);

          const names = seats.map((seat) => `Player ${seat}`);

          return [
            ...picture.seats.flatMap((drawn) =>
              names.includes(drawn.name) ? [] : [`drew ${drawn.name}`]
            ),
            ...names.flatMap((name) =>
              picture.line.includes(name)
                ? []
                : [`left ${name} out of the line`]
            ),
          ];
        }).flat()
      ).toStrictEqual([]);
    },
    HANDS
  );
});

describe("the night reel", () => {
  it.prop(
    "shows no card the table was not shown, and no board card before it is dealt, on any device",
    { seed: handSeed },
    ({ seed }) => {
      expect(
        Option.match(nightOfTwo(seed), {
          onNone: () => [],
          onSome: ({ devices, firstFeed }) => {
            const shown = shownBy(firstFeed);

            return devices.flatMap(({ first }) => [
              ...partFaceUp(first).filter(({ card }) => !shown.has(card)),
              ...partTooSoon(first, firstFeed),
            ]);
          },
        })
      ).toStrictEqual([]);
    },
    REEL_HANDS
  );

  it.prop(
    "is the same on every device",
    { seed: handSeed },
    ({ seed }) => {
      const drawn = Option.match(nightOfTwo(seed), {
        onNone: () => [],
        onSome: ({ devices }) =>
          devices.map(({ reel }) =>
            JSON.stringify([
              reel.dealt,
              reel.parts,
              reel.shots.map((shot) => [shot.box, shot.keys, shot.shows]),
            ])
          ),
      });

      expect(new Set(drawn).size).toBeLessThanOrEqual(1);
    },
    REEL_HANDS
  );
});
