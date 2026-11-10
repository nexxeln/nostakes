import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Result } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import * as Hex from "effect/encoding/Hex";

import {
  BeaconRoundMismatch,
  BeaconSignatureInvalid,
  CardSchema,
  Deals,
  DeckSchema,
  EpochMillisSchema,
  judgeHand,
  OpeningMismatch,
  PHONE_CLOCK_TOLERANCE_MS,
  QUICKNET,
  RandomnessSchema,
  roundTime,
  SaltSecretSchema,
  SealArrivals,
  SealArrivedAfterRound,
  sealHand,
  SEALING_MARGIN_MS,
  seedOf,
  selfSignedChain,
  sha256,
  Verdicts,
  verifyBeacon,
} from "../src/index.js";
import type {
  Beacon,
  DrandChain,
  HandEvidence,
  HandRejected,
  SealArrival,
  Sighting,
  Verdict,
} from "../src/index.js";
import { between, deck, handContext, saltSecret } from "./arbitraries.js";
import { QUICKNET_ROUNDS } from "./fixtures/drand-rounds.js";
import { dealHonestly, keepFlags, pickedFrom, seats } from "./hands.js";
import type { HonestHand } from "./hands.js";

const drand = selfSignedChain("test beacon");

const serversOwn = selfSignedChain("a key the server holds");

const at = (millis: number) => EpochMillisSchema.make(millis);

const DELIVERY_MS = 400;

const sealedInTime = (chain: DrandChain, round: number): SealArrival =>
  SealArrivals.Live({
    at: at(roundTime(chain, round) - SEALING_MARGIN_MS + DELIVERY_MS),
  });

interface Played {
  readonly hand: HonestHand;
  readonly signature: Uint8Array;
  readonly seen: readonly Sighting[];
}

const played = Arbitrary.all({
  context: handContext,
  decks: Arbitrary.all([deck, deck]),
  keep: keepFlags,
  round: between(1000, 100_000_000),
  seats,
  secret: saltSecret,
}).pipe(
  Arbitrary.map(({ context, decks, keep, round, seats: dealtIn, secret }) => {
    const signature = drand.sign(round);

    const beacon = Result.getOrThrow(
      verifyBeacon(drand.chain, round, signature)
    );

    const hand = dealHonestly(
      sealHand(context, decks, secret, round, dealtIn),
      beacon
    );

    return { hand, seen: pickedFrom(hand, keep), signature };
  })
);

const evidenceOf = (
  { hand, seen, signature }: Played,
  sealArrival: SealArrival = sealedInTime(drand.chain, hand.beacon.round)
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

const summary = (verdict: Verdict) =>
  Verdicts.$match(verdict, {
    Checked: ({ cardsChecked, round, timing }) => ({
      cardsChecked,
      round,
      timing: timing._tag,
      verdict: "checked",
    }),
    Failed: ({ reason }) => ({ reason, verdict: "failed" }),
    NotChecked: ({ reason, round }) => ({
      reason,
      round,
      verdict: "not checked",
    }),
  });

const checkedSummary = (game: Played, timing: string) => ({
  cardsChecked: game.seen.length,
  round: game.hand.beacon.round,
  timing,
  verdict: "checked",
});

const failedWith = (reason: HandRejected) => ({ reason, verdict: "failed" });

const hexOf = (value = "") => Result.getOrThrow(Hex.decode(value));

const RUNS = { arbitrary: { runs: 25 } };

describe("judgeHand on honest hands", () => {
  it.prop(
    "checks a hand whose seal arrived in time, counting the cards this player saw",
    { game: played },
    ({ game }) => {
      expect(summary(judgeHand(evidenceOf(game)))).toEqual(
        checkedSummary(game, "InTime")
      );
    },
    RUNS
  );

  it.prop(
    "still checks the cards when this device was away for the seal or got it too close to the round, and says so",
    { game: played },
    ({ game }) => {
      const due = roundTime(drand.chain, game.hand.beacon.round);

      expect(
        [
          SealArrivals.CaughtUp({ at: at(due + 60_000) }),
          SealArrivals.Live({ at: at(due) }),
        ].map((arrival) => summary(judgeHand(evidenceOf(game, arrival))))
      ).toEqual([
        checkedSummary(game, "NotWatched"),
        checkedSummary(game, "TooCloseToCall"),
      ]);
    },
    RUNS
  );

  it("checks every card of a hand ordered by real quicknet round 33,000,000 from its published signature", () => {
    const round = 33_000_000;
    const published = QUICKNET_ROUNDS.find((entry) => entry.round === round);

    const beacon: Beacon = {
      randomness: RandomnessSchema.make(hexOf(published?.randomness)),
      round,
    };

    const context = { hand: 9, room: "QK7PLM" };
    const cards = Arr.range(0, 51).map((card) => CardSchema.make(card));

    const sealed = sealHand(
      context,
      [DeckSchema.make(cards), DeckSchema.make(cards.toReversed())],
      SaltSecretSchema.make(sha256(new TextEncoder().encode("salt secret"))),
      round,
      [4, 7, 1]
    );

    const hand = dealHonestly(sealed, beacon);

    const verdict = judgeHand({
      chain: QUICKNET,
      context,
      deal: Deals.FromBeacon({
        round,
        seats: [4, 7, 1],
        sightings: hand.dealt,
        signature: hexOf(published?.signature),
        spare: hand.spare,
      }),
      seal: sealed.seal,
      sealArrival: sealedInTime(QUICKNET, round),
    });

    expect([
      summary(verdict),
      Verdicts.$is("Checked")(verdict) && Hex.encode(verdict.seed),
    ]).toEqual([
      { cardsChecked: 52, round, timing: "InTime", verdict: "checked" },
      Hex.encode(seedOf(context, sealed.seal, beacon)),
    ]);
  });
});

describe("judgeHand on a hand dealt without the beacon", () => {
  it.prop(
    "never shows it as checked, whenever the seal arrived",
    { game: played, offset: between(-60_000, 60_000) },
    ({ game, offset }) => {
      const due = roundTime(drand.chain, game.hand.beacon.round);

      const evidence = {
        ...evidenceOf(game, SealArrivals.Live({ at: at(due + offset) })),
        deal: Deals.BeaconUnavailable({ round: game.hand.beacon.round }),
      };

      expect(summary(judgeHand(evidence))).toEqual({
        reason: "beacon unavailable",
        round: game.hand.beacon.round,
        verdict: "not checked",
      });
    },
    RUNS
  );
});

describe("judgeHand on a cheating server", () => {
  it.prop(
    "fails a hand ordered by a beacon the server signed itself, though every card opens",
    { game: played },
    ({ game }) => {
      const { round } = game.hand.beacon;
      const forged = serversOwn.sign(round);

      const beacon = Result.getOrThrow(
        verifyBeacon(serversOwn.chain, round, forged)
      );

      const hand = dealHonestly(game.hand.sealed, beacon);

      expect(
        summary(
          judgeHand(evidenceOf({ hand, seen: hand.dealt, signature: forged }))
        )
      ).toEqual(
        failedWith(
          new BeaconSignatureInvalid({ beaconId: "test beacon", round })
        )
      );
    },
    RUNS
  );

  it.prop(
    "fails a real signature for the next round, whether it is passed off as the sealed round or named as its own",
    { game: played },
    ({ game }) => {
      const { round } = game.hand.beacon;
      const next = drand.sign(round + 1);
      const base = evidenceOf(game);

      const offered = (named: number) => ({
        ...base,
        deal: Deals.FromBeacon({
          round: named,
          seats: game.hand.sealed.seal.seats,
          sightings: game.seen,
          signature: next,
          spare: game.hand.spare,
        }),
      });

      expect([
        summary(judgeHand(offered(round))),
        summary(judgeHand(offered(round + 1))),
      ]).toEqual([
        failedWith(
          new BeaconSignatureInvalid({ beaconId: "test beacon", round })
        ),
        failedWith(new BeaconRoundMismatch({ sealed: round, used: round + 1 })),
      ]);
    },
    RUNS
  );

  it.prop(
    "fails a hand whose seal reached this live device after its round was due",
    { game: played, late: between(0, 600_000) },
    ({ game, late }) => {
      const { round } = game.hand.beacon;
      const due = roundTime(drand.chain, round);
      const arrivedAt = due + PHONE_CLOCK_TOLERANCE_MS + late;

      expect(
        summary(
          judgeHand(evidenceOf(game, SealArrivals.Live({ at: at(arrivedAt) })))
        )
      ).toEqual(
        failedWith(
          new SealArrivedAfterRound({
            arrivedAt,
            round,
            roundAt: due,
            tolerance: PHONE_CLOCK_TOLERANCE_MS,
          })
        )
      );
    },
    RUNS
  );

  it.prop(
    "still fails a card changed after the seal",
    { game: played, pick: between(0, 51) },
    ({ game, pick }) => {
      const sighting = game.hand.dealt[pick] ?? game.hand.dealt[0];

      if (sighting === undefined) {
        return;
      }

      const card = CardSchema.make((sighting.opening.card + 1) % 52);

      const changed = {
        ...sighting,
        opening: { ...sighting.opening, card },
        shown: card,
      };

      expect(
        summary(judgeHand(evidenceOf({ ...game, seen: [changed] })))
      ).toEqual(
        failedWith(
          new OpeningMismatch({
            position: sighting.opening.position,
            slot: game.hand.plan.dealtSlot,
          })
        )
      );
    },
    RUNS
  );
});
