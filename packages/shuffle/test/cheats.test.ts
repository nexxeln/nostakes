import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Option, Result } from "effect";

import {
  beaconWaitLimitMs,
  CardSchema,
  CardSeenTwice,
  dealingPlan,
  Deals,
  DeckSchema,
  EpochMillisSchema,
  judgeHand,
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
  Verdicts,
  verifyBeacon,
  verifyHand,
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

const drand = selfSignedChain("test beacon");

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

describe("planted cheats the verifier catches", () => {
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
});
