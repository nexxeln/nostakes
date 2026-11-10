import { Activities } from "@nostakes/client";
import type { ConnectionPhase, RoomClient, RoomUpdate } from "@nostakes/client";
import {
  emptyWitness,
  evidenceFor,
  handsWitnessed,
  MissingEvidences,
  RoomViews,
  sealsSeen,
  witnessEvent,
  witnessView,
} from "@nostakes/room";
import type { MissingEvidence, RoomView, Witness } from "@nostakes/room";
import {
  BeaconRoundSchema,
  EpochMillisSchema,
  judgeHand,
  QUICKNET,
  SealArrivals,
  sealsWithNoDeal,
  Verdicts,
  verifyBeacon,
} from "@nostakes/shuffle";
import type {
  HandEvidence,
  HandRejected,
  SealArrival,
  SealWithNoDeal,
} from "@nostakes/shuffle";
import {
  Clock,
  Data,
  Effect,
  Option,
  pipe,
  Ref,
  Result,
  Schema,
  Stream,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";

import { Messages } from "../features/message.js";
import type { Message } from "../features/message.js";
import { FairMarks } from "../features/model.js";
import type { FairHand } from "../features/model.js";
import type { PokerClientTypes } from "../features/wire.js";

const RELAYS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://drand.cloudflare.com",
  "https://api3.drand.sh",
];

const SETTLE_BEFORE_JUDGING = "1500 millis";

const RELAY_WAIT = "4 seconds";

type Input = Data.TaggedEnum<{
  Phase: { readonly phase: ConnectionPhase };
  Update: { readonly update: RoomUpdate<PokerClientTypes> };
}>;

const Inputs = Data.taggedEnum<Input>();

interface Watch {
  readonly witness: Witness;
  readonly settled: ReadonlySet<number>;
  readonly live: boolean;
  readonly caughtUp: boolean;
}

const startingWatch: Watch = {
  caughtUp: false,
  live: false,
  settled: new Set(),
  witness: emptyWitness,
};

const handIsOver = (view: RoomView, hand: number) =>
  RoomViews.$match(view, {
    Closed: () => true,
    Open: (open) =>
      Option.match(open.hand, {
        onNone: () =>
          Option.exists(open.lastHand, ({ handNumber }) => handNumber >= hand),
        onSome: ({ handNumber }) => handNumber > hand,
      }),
  });

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const bytesOf = (text: string) =>
  Uint8Array.from(text.match(/.{2}/gu) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  );

interface ProofFacts {
  readonly evidence?: HandEvidence;
  readonly reason?: HandRejected;
  readonly relay?: { readonly round: number; readonly signature: string };
  readonly unopened?: readonly number[];
  readonly withdrawn?: { readonly round: number; readonly when: string };
}

type ProofValue = Uint8Array | Schema.Json;

const proofText = (room: string, hand: number, found: ProofFacts) =>
  JSON.stringify(
    { found, hand, room },
    (_key: string, value: ProofValue) =>
      value instanceof Uint8Array ? hex(value) : value,
    2
  );

const RelayRoundSchema = Schema.Struct({
  round: Schema.Int,
  signature: Schema.String,
});

const relayHas = (round: number) =>
  Effect.firstSuccessOf(
    RELAYS.map((relay) =>
      HttpClient.get(`${relay}/${QUICKNET.chainHash}/public/${round}`).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknownEffect(RelayRoundSchema)),
        Effect.timeout(RELAY_WAIT)
      )
    )
  ).pipe(
    Effect.map(({ signature }) =>
      Result.isSuccess(
        verifyBeacon(
          QUICKNET,
          BeaconRoundSchema.make(round),
          bytesOf(signature)
        )
      )
        ? Option.some(signature)
        : Option.none()
    ),
    Effect.orElseSucceed(() => Option.none<string>()),
    Effect.provide(FetchHttpClient.layer)
  );

const whenIdle = Effect.callback<boolean>((resume) => {
  if (!("requestIdleCallback" in globalThis)) {
    resume(Effect.succeed(false));

    return Effect.void;
  }

  const id = globalThis.requestIdleCallback(() => {
    resume(Effect.succeed(true));
  });

  return Effect.sync(() => {
    globalThis.cancelIdleCallback(id);
  });
});

const judged = (room: string, hand: number, evidence: HandEvidence) =>
  Effect.sleep(SETTLE_BEFORE_JUDGING).pipe(
    Effect.andThen(whenIdle),
    Effect.flatMap(() =>
      Verdicts.$match(judgeHand(evidence), {
        Checked: ({ cardsChecked, round, timing }) =>
          Effect.succeed(
            FairMarks.Checked({
              cards: cardsChecked,
              round,
              timing: timing._tag,
            })
          ),
        Failed: ({ reason }) =>
          Effect.succeed(
            FairMarks.Failed({
              proof: proofText(room, hand, { evidence, reason }),
              reason: reason.message,
            })
          ),
        NotChecked: ({ round }) =>
          relayHas(round).pipe(
            Effect.map(
              Option.match({
                onNone: () => FairMarks.NotChecked({ round }),
                onSome: (signature) =>
                  FairMarks.Failed({
                    proof: proofText(room, hand, {
                      evidence,
                      relay: { round, signature },
                    }),
                    reason: `The server said drand's round ${round} was not available and shuffled the deck itself, but this device got round ${round} from drand and its signature is valid. The server's claim was false.`,
                  }),
              })
            )
          ),
      })
    ),
    Effect.map((mark): FairHand => ({ hand, mark }))
  );

const missing = (
  room: string,
  hand: number,
  gap: MissingEvidence
): Effect.Effect<Option.Option<FairHand>> =>
  MissingEvidences.$match(gap, {
    NoDeal: () => Effect.succeedNone,
    NoDealtSeats: () => Effect.succeedNone,
    NoSeal: () => Effect.succeedNone,
    NotSealed: () => Effect.succeedNone,
    Unopened: ({ cards }) =>
      Effect.succeed(
        Option.some({
          hand,
          mark: FairMarks.Failed({
            proof: proofText(room, hand, { unopened: cards }),
            reason: `The server showed ${cards.length === 1 ? "a card" : `${cards.length} cards`} without opening ${cards.length === 1 ? "it" : "them"} against the sealed deck, so this device cannot tell whether the deck was changed.`,
          }),
        })
      ),
  });

const markFor = (room: string, witness: Witness, hand: number) =>
  Result.match(evidenceFor(witness, hand, room, QUICKNET), {
    onFailure: (gap) => missing(room, hand, gap),
    onSuccess: (evidence) =>
      judged(room, hand, evidence).pipe(Effect.map(Option.some)),
  });

const cancelled = (room: string, problem: SealWithNoDeal): FairHand => ({
  hand: problem.hand,
  mark:
    problem.withdrawal === "while away"
      ? FairMarks.Cancelled({ round: problem.round })
      : FairMarks.Failed({
          proof: proofText(room, problem.hand, {
            withdrawn: { round: problem.round, when: problem.withdrawal },
          }),
          reason: problem.message,
        }),
});

const arrivalFor = (watch: Watch, at: number) => {
  const stamp = EpochMillisSchema.make(at);

  return watch.live &&
    watch.caughtUp &&
    globalThis.document.visibilityState === "visible"
    ? SealArrivals.Live({ at: stamp })
    : SealArrivals.CaughtUp({ at: stamp });
};

const foldOne = (
  witness: Witness,
  happened: RoomUpdate<PokerClientTypes>["activity"][number],
  arrival: SealArrival
) =>
  Activities.$match(happened, {
    Applied: ({ event }) => witnessEvent(witness, event, arrival),
    Skipped: () => witness,
  });

const folded = (
  watch: Watch,
  update: RoomUpdate<PokerClientTypes>,
  at: number
): Witness => {
  const arrival = arrivalFor(watch, at);
  let { witness } = watch;

  for (const happened of update.activity) {
    witness = foldOne(witness, happened, arrival);
  }

  return witnessView(witness, update.view, EpochMillisSchema.make(at));
};

const step = (room: string, watching: Ref.Ref<Watch>, input: Input) =>
  Inputs.$match(input, {
    Phase: ({ phase }) =>
      Ref.update(watching, (watch) => ({
        ...watch,
        caughtUp: phase === "Live" && watch.live ? watch.caughtUp : false,
        live: phase === "Live",
      })).pipe(Effect.as<readonly Message[]>([])),
    Update: ({ update }) =>
      Effect.gen(function* foldAndJudge() {
        const at = yield* Clock.currentTimeMillis;
        const before = yield* Ref.get(watching);
        const witness = folded(before, update, at);

        const over = handsWitnessed(witness).filter(
          (hand) => !before.settled.has(hand) && handIsOver(update.view, hand)
        );

        const problems = sealsWithNoDeal(
          QUICKNET,
          EpochMillisSchema.make(at),
          sealsSeen(witness)
        ).filter(({ hand }) => !before.settled.has(hand));

        yield* Ref.set(watching, {
          caughtUp: before.live,
          live: before.live,
          settled: new Set([
            ...before.settled,
            ...over,
            ...problems.map(({ hand }) => hand),
          ]),
          witness,
        });

        const marks = yield* pipe(
          over,
          Effect.forEach((hand) => markFor(room, witness, hand))
        );

        return [
          ...problems.map((problem) => cancelled(room, problem)),
          ...marks.flatMap(Option.toArray),
        ].map(({ hand, mark }) => Messages.JudgedHand({ hand, mark }));
      }),
  });

export const fairnessMarks = (
  client: RoomClient<PokerClientTypes>,
  room: string
): Stream.Stream<Message> =>
  Ref.make(startingWatch).pipe(
    Effect.map((watching) =>
      Stream.merge(
        client.states.pipe(
          Stream.map(({ connection }) => Inputs.Phase({ phase: connection }))
        ),
        client.updates.pipe(Stream.map((update) => Inputs.Update({ update })))
      ).pipe(
        Stream.mapEffect((input) => step(room, watching, input)),
        Stream.flatMap((messages) => Stream.fromIterable(messages))
      )
    ),
    Stream.unwrap
  );
