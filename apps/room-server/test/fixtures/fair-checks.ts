import { Events } from "@nostakes/engine";
import {
  emptyWitness,
  evidenceFor,
  handsWitnessed,
  MissingEvidences,
  sealsSeen,
  witnessEvent,
  witnessView,
  RoomEvents,
} from "@nostakes/room";
import type { MissingEvidence, RoomEvent, Witness } from "@nostakes/room";
import {
  Deals,
  EpochMillisSchema,
  judgeHand,
  SealArrivals,
  sealsWithNoDeal,
  SealTimings,
  Verdicts,
} from "@nostakes/shuffle";
import type { HandEvidence, SealArrival, Verdict } from "@nostakes/shuffle";
import { Option, Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import { pokerCodec } from "./poker-socket.js";
import type { Arrival } from "./poker-socket.js";
import { relayAnswer, TEST_CHAIN } from "./test-beacon.js";

const { guards } = pokerCodec.server;

export const FAIRNESS_COUNT_NAMES = [
  "handsJudged",
  "checkedInTime",
  "checkedTooClose",
  "checkedNotWatched",
  "notChecked",
  "outagesConfirmed",
  "failedVerdicts",
  "plainHands",
  "unjudged",
  "sealsWithdrawn",
  "withdrawnWhileAway",
  "withdrawnStalled",
  "sealedDeals",
  "waitBeyondPauseMs",
] as const;

export type FairnessCountName = (typeof FAIRNESS_COUNT_NAMES)[number];

export type FairnessCounts = Record<FairnessCountName, number>;

export const emptyFairness = (): FairnessCounts => ({
  checkedInTime: 0,
  checkedNotWatched: 0,
  checkedTooClose: 0,
  failedVerdicts: 0,
  handsJudged: 0,
  notChecked: 0,
  outagesConfirmed: 0,
  plainHands: 0,
  sealedDeals: 0,
  sealsWithdrawn: 0,
  unjudged: 0,
  waitBeyondPauseMs: 0,
  withdrawnStalled: 0,
  withdrawnWhileAway: 0,
});

export interface Proof {
  readonly device: string;
  readonly hand: number;
  readonly verdict: string;
  readonly evidence: HandEvidence;
}

const hex = (bytes: Uint8Array) => Hex.encode(bytes);

export const proofRecord = (proof: Proof) => {
  const { evidence } = proof;

  return {
    chain: evidence.chain.chainHash,
    context: evidence.context,
    deal: Deals.$match(evidence.deal, {
      BeaconUnavailable: ({ round }) => ({ beaconUnavailable: round }),
      FromBeacon: ({ round, seats, signature, sightings, spare }) => ({
        round,
        seats,
        sightings: sightings.map(({ opening, role, shown }) => ({
          card: opening.card,
          path: opening.path.map(hex),
          position: opening.position,
          role,
          salt: hex(opening.salt),
          shown,
        })),
        signature: hex(signature),
        spare: { cards: spare.cards, salts: spare.salts.map(hex) },
      }),
    }),
    device: proof.device,
    hand: proof.hand,
    seal: {
      beaconRound: evidence.seal.beaconRound,
      roots: evidence.seal.roots.map(hex),
      seats: evidence.seal.seats,
    },
    sealArrival: evidence.sealArrival,
    verdict: proof.verdict,
  };
};

export interface DeviceJudgement {
  readonly counts: FairnessCounts;
  readonly problems: readonly string[];
  readonly proofs: readonly Proof[];
  readonly checkedHands: ReadonlySet<number>;
}

const at = (time: number) => EpochMillisSchema.make(Math.round(time));

export interface Stretch {
  readonly witness: Witness;
  readonly lastHeardAt: number;
}

const firstNewSeq = (message: Arrival["message"]): Option.Option<number> => {
  if (guards.Events(message)) {
    return Option.some(message.from);
  }

  if (!guards.Welcome(message)) {
    return Option.none();
  }

  const { catchUp } = message;

  return pokerCodec.catchUp.guards.Missed(catchUp)
    ? Option.some(catchUp.from)
    : Option.some(message.seq + 1);
};

export const stretchesFrom = (
  arrivals: readonly Arrival[]
): readonly Stretch[] => {
  const stretches: Stretch[] = [];
  let witness = emptyWitness;
  let applied = 0;
  let lastHeardAt = Option.none<number>();

  const apply = (
    events: readonly Parameters<typeof witnessEvent>[1][],
    from: number,
    arrival: SealArrival
  ) => {
    for (const [index, event] of events.entries()) {
      if (from + index > applied) {
        witness = witnessEvent(witness, event, arrival);
      }
    }
  };

  for (const { at: time, message } of arrivals) {
    const when = at(time);
    const first = firstNewSeq(message);

    const skipsAhead =
      applied > 0 && Option.isSome(first) && first.value > applied + 1;

    for (const heard of Option.toArray(lastHeardAt)) {
      if (skipsAhead) {
        stretches.push({ lastHeardAt: heard, witness });
      }
    }

    if (guards.Welcome(message)) {
      const { catchUp } = message;

      if (pokerCodec.catchUp.guards.Missed(catchUp)) {
        apply(
          catchUp.events,
          catchUp.from,
          SealArrivals.CaughtUp({ at: when })
        );
      }

      applied = Math.max(applied, message.seq);
      witness = witnessView(witness, message.view, when);
    }

    if (guards.Events(message)) {
      apply(message.events, message.from, SealArrivals.Live({ at: when }));
      applied = Math.max(applied, message.to);
      witness = witnessView(witness, message.view, when);
    }

    lastHeardAt = Option.some(time);
  }

  for (const heard of Option.toArray(lastHeardAt)) {
    stretches.push({ lastHeardAt: heard, witness });
  }

  return stretches;
};

const sealKeys = (witness: Witness): readonly string[] => {
  const ordinals = new Map<number, number>();

  return sealsSeen(witness).map(({ hand }) => {
    const ordinal = ordinals.get(hand) ?? 0;

    ordinals.set(hand, ordinal + 1);

    return `${hand}:${ordinal}`;
  });
};

export const undealtSeals = (stretches: readonly Stretch[]) =>
  stretches.flatMap((stretch, index) => {
    const before = new Set(
      Option.fromUndefinedOr(stretches[index - 1]).pipe(
        Option.map(({ witness }) => sealKeys(witness)),
        Option.getOrElse((): readonly string[] => [])
      )
    );

    const keys = sealKeys(stretch.witness);

    return sealsWithNoDeal(
      TEST_CHAIN,
      at(stretch.lastHeardAt),
      sealsSeen(stretch.witness).filter(
        (_, position) => !before.has(keys[position] ?? "")
      )
    );
  });

const verdictText = (verdict: Verdict) =>
  Verdicts.$match(verdict, {
    Checked: ({ cardsChecked, round, timing }) =>
      `checked ${cardsChecked} cards on round ${round} (${timing._tag})`,
    Failed: ({ reason }) => `FAILED: ${reason.message}`,
    NotChecked: ({ round }) => `not checked: beacon round ${round} unavailable`,
  });

const missingText = (missing: MissingEvidence) =>
  MissingEvidences.$match(missing, {
    NoDeal: () => "no deal",
    NoDealtSeats: () => "the deal was seen only after the hand",
    NoSeal: () => "a deal without a seal it saw",
    NotSealed: () => "a plain hand",
    Unopened: ({ cards }) =>
      `cards ${cards.join(",")} were shown with no opening`,
  });

export const sealKeyOf = (hand: number, round: number) => `${hand}:${round}`;

export const judgeDevice = (
  device: string,
  stretches: readonly Stretch[],
  room: string,
  now: number,
  withdrawnStalled: ReadonlySet<string> = new Set()
): DeviceJudgement => {
  const witness = stretches.at(-1)?.witness ?? emptyWitness;
  const counts = emptyFairness();
  const problems: string[] = [];
  const proofs: Proof[] = [];
  const checkedHands = new Set<number>();

  for (const hand of handsWitnessed(witness)) {
    Result.match(evidenceFor(witness, hand, room, TEST_CHAIN), {
      onFailure: (missing) => {
        if (MissingEvidences.$is("NotSealed")(missing)) {
          counts.plainHands += 1;

          return;
        }

        if (MissingEvidences.$is("NoDeal")(missing)) {
          return;
        }

        counts.unjudged += 1;

        if (MissingEvidences.$is("Unopened")(missing)) {
          problems.push(`${device} hand ${hand}: ${missingText(missing)}`);
        }
      },
      onSuccess: (evidence) => {
        const verdict = judgeHand(evidence);

        counts.handsJudged += 1;

        Verdicts.$match(verdict, {
          Checked: ({ timing }) => {
            checkedHands.add(hand);
            counts.checkedInTime += SealTimings.$is("InTime")(timing) ? 1 : 0;
            counts.checkedTooClose += SealTimings.$is("TooCloseToCall")(timing)
              ? 1
              : 0;
            counts.checkedNotWatched += SealTimings.$is("NotWatched")(timing)
              ? 1
              : 0;
          },
          Failed: () => {
            counts.failedVerdicts += 1;
            problems.push(`${device} hand ${hand}: ${verdictText(verdict)}`);
            proofs.push({
              device,
              evidence,
              hand,
              verdict: verdictText(verdict),
            });
          },
          NotChecked: ({ round }) => {
            counts.notChecked += 1;

            if (Option.isSome(relayAnswer(round, now))) {
              problems.push(
                `${device} hand ${hand}: the server dealt beacon round ${round} as unavailable, and the relay serves it`
              );
              proofs.push({
                device,
                evidence,
                hand,
                verdict: `${verdictText(verdict)}, though the relay serves it`,
              });
            } else {
              counts.outagesConfirmed += 1;
            }
          },
        });
      },
    });
  }

  for (const seal of sealsSeen(witness)) {
    counts.sealsWithdrawn += Option.isSome(seal.withdrawn) ? 1 : 0;
  }

  for (const problem of undealtSeals(stretches)) {
    if (withdrawnStalled.has(sealKeyOf(problem.hand, problem.round))) {
      counts.withdrawnStalled += 1;
    } else if (
      problem.withdrawal === "while away" ||
      problem.withdrawal === "too close to the round"
    ) {
      counts.withdrawnWhileAway += 1;
    } else {
      problems.push(`${device}: ${problem.message}`);
    }
  }

  return { checkedHands, counts, problems, proofs };
};

export const addFairness = (total: FairnessCounts, more: FairnessCounts) => {
  for (const name of FAIRNESS_COUNT_NAMES) {
    total[name] += more[name];
  }
};

export const waitBeyondPause = (
  events: readonly RoomEvent[]
): readonly number[] => {
  const waits: number[] = [];
  let pauseMs = 0;
  let readyAt = Option.none<number>();

  for (const event of events) {
    if (
      RoomEvents.$is("RoomOpened")(event) ||
      RoomEvents.$is("SettingsChanged")(event)
    ) {
      pauseMs = event.settings.betweenHandsSeconds * 1000;
    }

    if (RoomEvents.$is("GameStarted")(event)) {
      readyAt = Option.some(event.at);
    }

    if (
      RoomEvents.$is("Table")(event) &&
      Events.$is("HandEnded")(event.event)
    ) {
      readyAt = Option.some(event.at + pauseMs);
    }

    if (
      RoomEvents.$is("DealtFromBeacon")(event) ||
      RoomEvents.$is("DealtWithoutBeacon")(event)
    ) {
      for (const ready of Option.toArray(readyAt)) {
        waits.push(Math.max(0, event.at - ready));
      }

      readyAt = Option.none();
    }
  }

  return waits;
};
