import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Option, Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  BeaconRoundMismatch,
  CardSchema,
  CardSeenTwice,
  combine,
  Contributions,
  DealIndexSchema,
  dealingPlan,
  DeckSchema,
  MyContributionLeftOut,
  NoOutsideRandomness,
  OpeningMismatch,
  openDeck,
  RandomnessSchema,
  SaltSchema,
  SaltSecretSchema,
  sealCards,
  sealDeck,
  sealHand,
  sha256,
  ShownCardDiffers,
  SpareDeckMismatch,
  SpareDeckRepeatsCard,
  verifyHand,
  WrongPosition,
} from "../src/index.js";
import type {
  Contribution,
  Deck,
  HandContext,
  PlayerSaw,
  SealedHand,
  Sighting,
} from "../src/index.js";
import { dealHonestly, sawOf } from "./hands.js";
import type { HonestHand } from "./hands.js";

const text = (value: string) => new TextEncoder().encode(value);

const bytesFor = (label: string) => sha256(text(label));

const context: HandContext = { hand: 7, room: "QK7PLM" };

const DEALT_IN = 4;

const ROUND = 4_200_000;

const deckFrom = (cards: readonly number[]): Deck =>
  DeckSchema.make(cards.map((card) => CardSchema.make(card)));

const sorted = deckFrom(Arr.range(0, 51));

const reversed = deckFrom(Arr.range(0, 51).toReversed());

const secret = SaltSecretSchema.make(bytesFor("salt secret"));

const beacon = (label: string, round = ROUND) =>
  Contributions.Beacon({
    randomness: RandomnessSchema.make(bytesFor(label)),
    round,
  });

const honest = (contributions: readonly Contribution[] = [beacon("round")]) =>
  dealHonestly(
    sealHand(context, [sorted, reversed], secret, Option.some(ROUND)),
    contributions,
    DEALT_IN
  );

const outcome = (saw: PlayerSaw) =>
  Result.match(verifyHand(saw), {
    onFailure: (rejected) => rejected,
    onSuccess: () => "checked out",
  });

const dealtAt = (hand: HonestHand, dealIndex: number): Sighting =>
  Option.getOrThrow(Option.fromNullishOr(hand.dealt[dealIndex]));

const holeCardsOf = (hand: HonestHand, turn: number) => [
  dealtAt(hand, turn),
  dealtAt(hand, DEALT_IN + turn),
];

const board = (hand: HonestHand) =>
  Arr.range(0, 4).map((drawn) => dealtAt(hand, 2 * DEALT_IN + drawn));

const RIVER = 2 * DEALT_IN + 4;

const beaconPicking = (sealed: SealedHand, slot: 0 | 1): Contribution => {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = beacon(`search ${attempt}`);

    const seed = Result.getOrThrow(
      combine(sealed.context, sealed.seal, [candidate])
    );

    if (dealingPlan(seed).dealtSlot === slot) {
      return candidate;
    }
  }
};

describe("planted cheats the verifier catches", () => {
  it("a card swapped after the bets fails for everyone shown it", () => {
    const hand = honest();
    const river = dealtAt(hand, RIVER);
    const better = CardSchema.make((river.opening.card + 13) % 52);

    const forged = {
      ...river,
      opening: {
        ...river.opening,
        card: better,
        salt: SaltSchema.make(bytesFor("forged salt")),
      },
      shown: better,
    };

    for (let turn = 0; turn < DEALT_IN; turn += 1) {
      expect(
        outcome(
          sawOf(hand, [
            ...holeCardsOf(hand, turn),
            ...board(hand).slice(0, 4),
            forged,
          ])
        )
      ).toEqual(
        new OpeningMismatch({
          position: river.opening.position,
          slot: hand.plan.dealtSlot,
        })
      );
    }
  });

  it("a real sealed card dealt out of order to a friend fails for everyone once that hand is shown", () => {
    const hand = honest();
    const [first, second] = holeCardsOf(hand, 0);
    const deep = dealtAt(hand, 51);

    const friendsCards = [
      {
        ...Option.getOrThrow(Option.fromNullishOr(first)),
        opening: deep.opening,
        shown: deep.shown,
      },
      Option.getOrThrow(Option.fromNullishOr(second)),
    ];

    for (let turn = 1; turn < DEALT_IN; turn += 1) {
      expect(
        outcome(
          sawOf(hand, [
            ...holeCardsOf(hand, turn),
            ...board(hand),
            ...friendsCards,
          ])
        )
      ).toEqual(
        new WrongPosition({
          dealIndex: DealIndexSchema.make(0),
          expected: dealtAt(hand, 0).opening.position,
          opened: deep.opening.position,
        })
      );
    }
  });

  it("an order taken from a beacon round other than the sealed one fails", () => {
    const hand = honest();

    expect(
      outcome({
        ...sawOf(hand, holeCardsOf(hand, 1)),
        contributions: [beacon("a later round", ROUND + 1)],
      })
    ).toEqual(
      new BeaconRoundMismatch({
        sealed: Option.some(ROUND),
        used: Option.some(ROUND + 1),
      })
    );
  });

  it("last hand's seal and openings replayed as this hand fail", () => {
    const hand = honest();

    expect(
      outcome({
        ...sawOf(hand, holeCardsOf(hand, 1)),
        context: { ...context, hand: context.hand + 1 },
      })
    ).toEqual(new SpareDeckMismatch({ slot: hand.plan.spareSlot }));
  });

  it("a spare deck holding a card twice fails for every player", () => {
    const repeating = [...sorted.slice(0, 51), CardSchema.make(0)];

    const salts = Arr.range(0, 51).map((index) =>
      SaltSchema.make(bytesFor(`salt ${index}`))
    );

    const bad = sealCards(context, 1, repeating, salts);
    const good = sealDeck(context, 0, reversed, secret);

    const sealed: SealedHand = {
      context,
      decks: [good, bad],
      seal: { beaconRound: Option.some(ROUND), roots: [good.root, bad.root] },
    };

    const hand = dealHonestly(sealed, [beaconPicking(sealed, 0)], DEALT_IN);

    expect(outcome(sawOf(hand, []))).toEqual(
      new SpareDeckRepeatsCard({ card: CardSchema.make(0), slot: 1 })
    );
  });

  it("a dealt deck holding cards twice fails for a player shown both copies of one", () => {
    const pairs = Arr.range(0, 51).map((position) =>
      CardSchema.make(Math.floor(position / 2))
    );

    const salts = Arr.range(0, 51).map((index) =>
      SaltSchema.make(bytesFor(`salt ${index}`))
    );

    const bad = sealCards(context, 0, pairs, salts);
    const spare = sealDeck(context, 1, reversed, secret);

    const sealed: SealedHand = {
      context,
      decks: [bad, spare],
      seal: { beaconRound: Option.some(ROUND), roots: [bad.root, spare.root] },
    };

    const visible = [0, DEALT_IN, ...Arr.range(2 * DEALT_IN, 2 * DEALT_IN + 4)];

    const seesAPair = (contribution: Contribution) => {
      const plan = dealingPlan(
        Result.getOrThrow(combine(context, sealed.seal, [contribution]))
      );

      const cards = visible.map(
        (dealIndex) => pairs[plan.order[dealIndex] ?? 0] ?? 0
      );

      return plan.dealtSlot === 0 && new Set(cards).size < cards.length;
    };

    const chosen = Arr.range(0, 999)
      .map((attempt) => beacon(`search ${attempt}`))
      .find(seesAPair);

    const hand = Option.fromNullishOr(chosen).pipe(
      Option.map((contribution) =>
        dealHonestly(sealed, [contribution], DEALT_IN)
      )
    );

    const found = Option.getOrThrow(hand);

    expect(
      outcome(sawOf(found, [...holeCardsOf(found, 0), ...board(found)]))
    ).toBeInstanceOf(CardSeenTwice);

    expect(outcome(sawOf(found, holeCardsOf(found, 1).slice(0, 1)))).toBe(
      "checked out"
    );
  });

  it("a spare deck other than the sealed one fails", () => {
    const hand = honest();

    expect(
      outcome({
        ...sawOf(hand, []),
        spare: openDeck(
          sealDeck(
            context,
            hand.plan.spareSlot,
            deckFrom(Arr.range(0, 51).map((card) => (card + 1) % 52)),
            secret
          )
        ),
      })
    ).toEqual(new SpareDeckMismatch({ slot: hand.plan.spareSlot }));
  });

  it("a table showing a card other than the sealed one fails", () => {
    const hand = honest();
    const [mine] = holeCardsOf(hand, 2);
    const card = Option.getOrThrow(Option.fromNullishOr(mine));
    const shown = CardSchema.make((card.shown + 1) % 52);

    expect(outcome(sawOf(hand, [{ ...card, shown }]))).toEqual(
      new ShownCardDiffers({
        dealIndex: DealIndexSchema.make(2),
        opened: card.opening.card,
        shown,
      })
    );
  });

  it("a hand ordered by the server alone is not called fair", () => {
    const hand = honest();

    expect(
      outcome({
        ...sawOf(hand, holeCardsOf(hand, 1)),
        contributions: [],
        seal: { ...hand.sealed.seal, beaconRound: Option.none() },
      })
    ).toEqual(new NoOutsideRandomness({ hand: context.hand }));
  });

  it("a server showing two players different seals cannot show them the same board", () => {
    const alice = honest();

    const bob = dealHonestly(
      sealHand(
        context,
        [sorted, reversed],
        SaltSecretSchema.make(bytesFor("another secret")),
        Option.some(ROUND)
      ),
      [beacon("round")],
      DEALT_IN
    );

    const sharedBoard = board(alice);

    const bobsBoard = board(bob).map((sighting, drawn) => ({
      ...sighting,
      shown: sharedBoard[drawn]?.shown ?? sighting.shown,
    }));

    expect(outcome(sawOf(alice, sharedBoard))).toBe("checked out");
    expect(outcome(sawOf(bob, bobsBoard))).toBeInstanceOf(ShownCardDiffers);
  });
});

describe("planted cheats one player cannot see", () => {
  it("a dropped contribution shows only on the screen of the player who sent it", () => {
    const values = Arr.range(0, DEALT_IN - 1).map((seat) =>
      Contributions.Player({
        seat,
        value: RandomnessSchema.make(bytesFor(`chain value ${seat}`)),
      })
    );

    const dropped = Option.getOrThrow(Option.fromNullishOr(values[3]));

    const kept = values.filter((value) => value !== dropped);

    const hand = dealHonestly(
      sealHand(context, [sorted, reversed], secret, Option.none()),
      kept,
      DEALT_IN
    );

    expect(
      outcome(sawOf(hand, holeCardsOf(hand, 3), Option.some(dropped)))
    ).toEqual(new MyContributionLeftOut({ seat: 3 }));

    for (const turn of [0, 1, 2]) {
      const own = values[turn];

      expect(
        outcome(
          sawOf(
            hand,
            [...holeCardsOf(hand, turn), ...board(hand)],
            Option.fromNullishOr(own)
          )
        )
      ).toBe("checked out");
    }
  });

  it("a server holding nine player values can choose among 511 different deals, and with only a beacon among one", () => {
    const sealed = sealHand(context, [sorted, reversed], secret, Option.none());

    const values = Arr.range(0, 8).map((seat) =>
      Contributions.Player({
        seat,
        value: RandomnessSchema.make(bytesFor(`chain value ${seat}`)),
      })
    );

    const deals = new Set<string>();

    for (let mask = 1; mask < 2 ** values.length; mask += 1) {
      const subset = values.filter(
        (_, seat) => Math.floor(mask / 2 ** seat) % 2 === 1
      );

      const plan = dealingPlan(
        Result.getOrThrow(combine(context, sealed.seal, subset))
      );

      deals.add(`${plan.dealtSlot}:${plan.order.join(",")}`);
    }

    const beaconSealed = sealHand(
      context,
      [sorted, reversed],
      secret,
      Option.some(ROUND)
    );

    const beaconDeals = new Set(
      [[beacon("round")], [beacon("round"), beacon("round")]].flatMap(
        (contributions) =>
          Result.match(combine(context, beaconSealed.seal, contributions), {
            onFailure: () => [],
            onSuccess: (seed) => [Hex.encode(seed)],
          })
      )
    );

    expect([deals.size, beaconDeals.size]).toEqual([511, 1]);
  });
});
