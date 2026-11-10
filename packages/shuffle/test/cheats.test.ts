import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Option, Result } from "effect";

import {
  beaconGiveUpTime,
  beaconWaitLimitMs,
  BeaconRoundMismatch,
  BeaconSignatureInvalid,
  CardSchema,
  CardSeenTwice,
  DealIndexSchema,
  dealingPlan,
  Deals,
  DealtSeatsDiffer,
  DeckSchema,
  EpochMillisSchema,
  judgeHand,
  openDeck,
  OpeningMismatch,
  OUTAGE_ARRIVAL_ALLOWANCE_MS,
  OutageClaimedEarly,
  PHONE_CLOCK_TOLERANCE_MS,
  RandomnessSchema,
  roundTime,
  SaltSchema,
  SaltSecretSchema,
  SEAL_DELIVERY_BUDGET_MS,
  SealArrivals,
  SealArrivedAfterRound,
  sealCards,
  sealDeck,
  sealHand,
  sealsWithNoDeal,
  seedOf,
  selfSignedChain,
  sha256,
  ShownCardDiffers,
  SpareDeckMismatch,
  SpareDeckRepeatsCard,
  Verdicts,
  verifyBeacon,
  verifyHand,
  WrongPosition,
} from "../src/index.js";
import type {
  Beacon,
  Deck,
  HandContext,
  HandEvidence,
  PlayerSaw,
  SealArrival,
  SealedHand,
  SealSeen,
  Sighting,
  Verdict,
} from "../src/index.js";
import { dealHonestly, sawOf } from "./hands.js";
import type { HonestHand } from "./hands.js";

const text = (value: string) => new TextEncoder().encode(value);

const bytesFor = (label: string) => sha256(text(label));

const context: HandContext = { hand: 7, room: "QK7PLM" };

const SEATS = [3, 5, 0, 1];

const DEALT_IN = SEATS.length;

const ROUND = 4_200_000;

const deckFrom = (cards: readonly number[]): Deck =>
  DeckSchema.make(cards.map((card) => CardSchema.make(card)));

const sorted = deckFrom(Arr.range(0, 51));

const reversed = deckFrom(Arr.range(0, 51).toReversed());

const secret = SaltSecretSchema.make(bytesFor("salt secret"));

const beacon = (label: string, round = ROUND): Beacon => ({
  randomness: RandomnessSchema.make(bytesFor(label)),
  round,
});

const honest = () =>
  dealHonestly(
    sealHand(context, [sorted, reversed], secret, ROUND, SEATS),
    beacon("round")
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

const drand = selfSignedChain("test beacon");

const serversOwn = selfSignedChain("a key the server holds");

const dueAt = (round: number) => roundTime(drand.chain, round);

const live = (millis: number): SealArrival =>
  SealArrivals.Live({ at: EpochMillisSchema.make(millis) });

const evidenceFor = (
  hand: HonestHand,
  signature: Uint8Array,
  seen: readonly Sighting[],
  sealArrival: SealArrival
): HandEvidence => ({
  chain: drand.chain,
  context: hand.sealed.context,
  deal: Deals.FromBeacon({
    round: hand.beacon.round,
    seats: hand.sealed.seal.seats,
    sightings: seen,
    signature,
    spare: hand.spare,
  }),
  seal: hand.sealed.seal,
  sealArrival,
});

const verdictTag = (verdict: Verdict) =>
  Verdicts.$match(verdict, {
    Checked: ({ timing }) => timing._tag,
    Failed: ({ reason }) => reason,
    NotChecked: ({ reason }) => reason,
  });

const beaconPicking = (sealed: SealedHand, slot: 0 | 1): Beacon => {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = beacon(`search ${attempt}`);

    if (
      dealingPlan(seedOf(sealed.context, sealed.seal, candidate)).dealtSlot ===
      slot
    ) {
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
        beacon: beacon("a later round", ROUND + 1),
      })
    ).toEqual(new BeaconRoundMismatch({ sealed: ROUND, used: ROUND + 1 }));
  });

  it("last hand's seal and openings replayed as this hand fail", () => {
    const hand = honest();
    const next = { ...context, hand: context.hand + 1 };

    const replayed = dealingPlan(
      seedOf(next, hand.sealed.seal, beacon("round"))
    );

    expect(
      outcome({ ...sawOf(hand, holeCardsOf(hand, 1)), context: next })
    ).toEqual(new SpareDeckMismatch({ slot: replayed.spareSlot }));
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
      seal: { beaconRound: ROUND, roots: [good.root, bad.root], seats: SEATS },
    };

    const hand = dealHonestly(sealed, beaconPicking(sealed, 0));

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
      seal: { beaconRound: ROUND, roots: [bad.root, spare.root], seats: SEATS },
    };

    const visible = [0, DEALT_IN, ...Arr.range(2 * DEALT_IN, 2 * DEALT_IN + 4)];

    const seesAPair = (candidate: Beacon) => {
      const plan = dealingPlan(seedOf(context, sealed.seal, candidate));

      const cards = visible.map(
        (dealIndex) => pairs[plan.order[dealIndex] ?? 0] ?? 0
      );

      return plan.dealtSlot === 0 && new Set(cards).size < cards.length;
    };

    const chosen = Arr.range(0, 999)
      .map((attempt) => beacon(`search ${attempt}`))
      .find(seesAPair);

    const hand = Option.fromNullishOr(chosen).pipe(
      Option.map((candidate) => dealHonestly(sealed, candidate))
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

  it("a server showing two players different seals cannot show them the same board", () => {
    const alice = honest();

    const bob = dealHonestly(
      sealHand(
        context,
        [sorted, reversed],
        SaltSecretSchema.make(bytesFor("another secret")),
        ROUND,
        SEATS
      ),
      beacon("round")
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

describe("planted cheats a beacon leaves the server", () => {
  it("dealing to other seats than the sealed ones after seeing the beacon fails for every player", () => {
    const hand = honest();
    const withoutSeatFive = SEATS.filter((seat) => seat !== 5);

    for (let turn = 0; turn < DEALT_IN; turn += 1) {
      expect(
        outcome({
          ...sawOf(hand, [...holeCardsOf(hand, turn), ...board(hand)]),
          seats: withoutSeatFive,
        })
      ).toEqual(
        new DealtSeatsDiffer({ dealt: withoutSeatFive, sealed: SEATS })
      );
    }
  });

  it("a beacon value the server made up fails for every player, though every card opens", () => {
    const forged = serversOwn.sign(ROUND);

    const beaconOfItsOwn = Result.getOrThrow(
      verifyBeacon(serversOwn.chain, ROUND, forged)
    );

    const hand = dealHonestly(
      sealHand(context, [sorted, reversed], secret, ROUND, SEATS),
      beaconOfItsOwn
    );

    for (let turn = 0; turn < DEALT_IN; turn += 1) {
      const seen = [...holeCardsOf(hand, turn), ...board(hand)];

      expect(outcome(sawOf(hand, seen))).toBe("checked out");

      expect(
        verdictTag(
          judgeHand(evidenceFor(hand, forged, seen, live(dueAt(ROUND) - 3000)))
        )
      ).toEqual(
        new BeaconSignatureInvalid({
          beaconId: drand.chain.beaconId,
          round: ROUND,
        })
      );
    }
  });

  it("a deck sealed after its round was out is never shown as sealed in time, and fails on a device that got it a second after", () => {
    const signature = drand.sign(ROUND);

    const beaconSeen = Result.getOrThrow(
      verifyBeacon(drand.chain, ROUND, signature)
    );

    const stacked = dealHonestly(
      sealHand(context, [sorted, reversed], secret, ROUND, SEATS),
      beaconSeen
    );

    const sealArrives = dueAt(ROUND) + 300;

    const verdicts = [-1000, -500, 0, 500, 699, 700, 1000].map((clockError) =>
      verdictTag(
        judgeHand(
          evidenceFor(
            stacked,
            signature,
            holeCardsOf(stacked, 0),
            live(sealArrives + clockError)
          )
        )
      )
    );

    const arrivedAfter = (clockError: number) =>
      new SealArrivedAfterRound({
        arrivedAt: sealArrives + clockError,
        round: ROUND,
        roundAt: dueAt(ROUND),
        tolerance: PHONE_CLOCK_TOLERANCE_MS,
      });

    expect(verdicts).toEqual([
      "TooCloseToCall",
      "TooCloseToCall",
      "TooCloseToCall",
      "TooCloseToCall",
      "TooCloseToCall",
      arrivedAfter(700),
      arrivedAfter(1000),
    ]);
  });

  it("a sealed hand the server cancels after its round shows on every connected player's screen", () => {
    const round = ROUND;
    const due = dueAt(round);

    const deadline =
      due + beaconWaitLimitMs(drand.chain) + SEAL_DELIVERY_BUDGET_MS;

    const neverDealt: SealSeen = {
      dealt: false,
      hand: context.hand,
      round,
      withdrawn: Option.none(),
    };

    const calledOffLate: SealSeen = {
      ...neverDealt,
      withdrawn: Option.some(live(due + 2000)),
    };

    for (const clockError of [-1000, 0, 1000]) {
      const now = EpochMillisSchema.make(
        deadline + PHONE_CLOCK_TOLERANCE_MS + clockError + 1000
      );

      expect(
        [neverDealt, calledOffLate].map((seen) =>
          sealsWithNoDeal(drand.chain, now, [seen]).map(
            ({ withdrawal }) => withdrawal
          )
        )
      ).toEqual([["never"], ["after the round"]]);
    }
  });

  it("a hand the server says it dealt without the beacon after its full wait is never shown as checked, and never as failed", () => {
    const hand = honest();
    const giveUpAt = beaconGiveUpTime(drand.chain, ROUND);

    for (const arrival of [
      live(giveUpAt - OUTAGE_ARRIVAL_ALLOWANCE_MS),
      live(giveUpAt + 5000),
      SealArrivals.CaughtUp({ at: EpochMillisSchema.make(giveUpAt - 9000) }),
    ]) {
      expect(
        verdictTag(
          judgeHand({
            chain: drand.chain,
            context,
            deal: Deals.BeaconUnavailable({
              arrival,
              dealtAt: Option.some(giveUpAt),
              round: ROUND,
            }),
            seal: hand.sealed.seal,
            sealArrival: live(dueAt(ROUND) - 3000),
          })
        )
      ).toBe("beacon unavailable");
    }
  });

  it("a claim that the beacon was unavailable, made before the server's full wait, fails for every device that can tell", () => {
    const hand = honest();
    const giveUpAt = beaconGiveUpTime(drand.chain, ROUND);

    const judged = (
      stamped: Option.Option<number>,
      arrival: SealArrival
    ): Verdict =>
      judgeHand({
        chain: drand.chain,
        context,
        deal: Deals.BeaconUnavailable({
          arrival,
          dealtAt: stamped.pipe(Option.map((at) => EpochMillisSchema.make(at))),
          round: ROUND,
        }),
        seal: hand.sealed.seal,
        sealArrival: live(dueAt(ROUND) - 3000),
      });

    expect([
      verdictTag(
        judged(
          Option.some(dueAt(ROUND) + 200),
          SealArrivals.CaughtUp({ at: EpochMillisSchema.make(giveUpAt) })
        )
      ),
      verdictTag(
        judged(
          Option.some(giveUpAt),
          live(giveUpAt - OUTAGE_ARRIVAL_ALLOWANCE_MS - 1)
        )
      ),
      verdictTag(judged(Option.none(), live(dueAt(ROUND) + 300))),
    ]).toEqual([
      new OutageClaimedEarly({
        allowance: 0,
        giveUpAt,
        round: ROUND,
        roundAt: dueAt(ROUND),
        seenAt: dueAt(ROUND) + 200,
        seenBy: "the server's record",
      }),
      new OutageClaimedEarly({
        allowance: OUTAGE_ARRIVAL_ALLOWANCE_MS,
        giveUpAt,
        round: ROUND,
        roundAt: dueAt(ROUND),
        seenAt: giveUpAt - OUTAGE_ARRIVAL_ALLOWANCE_MS - 1,
        seenBy: "this device",
      }),
      new OutageClaimedEarly({
        allowance: OUTAGE_ARRIVAL_ALLOWANCE_MS,
        giveUpAt,
        round: ROUND,
        roundAt: dueAt(ROUND),
        seenAt: dueAt(ROUND) + 300,
        seenBy: "this device",
      }),
    ]);
  });
});
