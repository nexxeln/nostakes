import {
  Seats,
  SevenDeuces,
  ShowdownEntries,
  isSevenDeuce,
} from "@nostakes/engine";
import type { Card, Event, SeatIndex, SevenDeuce } from "@nostakes/engine";
import { RoomStates } from "@nostakes/room";
import type { RoomState } from "@nostakes/room";
import { Match, Option } from "effect";

interface Payment {
  readonly amount: number;
  readonly seat: SeatIndex;
}

interface Due {
  readonly collector: SeatIndex;
  readonly ended: RoomState;
  readonly payers: readonly Payment[];
}

export interface BountyWatch {
  readonly awards: readonly {
    readonly eligible: readonly SeatIndex[];
    readonly winners: readonly SeatIndex[];
  }[];
  readonly dealt: readonly SeatIndex[];
  readonly due: Option.Option<Due>;
  readonly hand: number;
  readonly holes: ReadonlyMap<SeatIndex, readonly Card[]>;
  readonly rule: SevenDeuce;
  readonly shown: ReadonlySet<Card>;
}

export const NO_BOUNTY_WATCH: BountyWatch = {
  awards: [],
  dealt: [],
  due: Option.none(),
  hand: 0,
  holes: new Map(),
  rule: SevenDeuces.NoBounty(),
  shown: new Set(),
};

export interface BountySeen {
  readonly paid: number;
  readonly problems: readonly string[];
  readonly watch: BountyWatch;
}

const stackAt = (state: RoomState, seat: SeatIndex) =>
  RoomStates.$match(state, {
    Closed: () => 0,
    Open: (open) => {
      const occupant = open.table.seats[seat];

      return occupant !== undefined && Seats.$is("Occupied")(occupant)
        ? occupant.stack
        : 0;
    },
  });

const ruleOf = (state: RoomState) =>
  RoomStates.$match(state, {
    Closed: () => SevenDeuces.NoBounty(),
    Open: (open) => open.table.config.sevenDeuce,
  });

const owedAt = (watch: BountyWatch, ended: RoomState): Option.Option<Due> =>
  SevenDeuces.$match(watch.rule, {
    Bounty: ({ amount }) =>
      Option.fromUndefinedOr(
        watch.dealt.find((seat) => {
          const contested = watch.awards.filter((award) =>
            award.eligible.includes(seat)
          );

          return (
            isSevenDeuce(watch.holes.get(seat) ?? []) &&
            contested.length > 0 &&
            contested.every(
              (award) => award.winners.length === 1 && award.winners[0] === seat
            )
          );
        })
      ).pipe(
        Option.map((collector) => ({
          collector,
          ended,
          payers: watch.dealt.flatMap((seat) => {
            const owed = Math.min(amount, stackAt(ended, seat));

            return seat !== collector && owed > 0
              ? [{ amount: owed, seat }]
              : [];
          }),
        })),
        Option.filter(({ payers }) => payers.length > 0)
      ),
    NoBounty: () => Option.none(),
  });

const seen = (watch: BountyWatch, problems: readonly string[] = []) => ({
  paid: 0,
  problems,
  watch,
});

const showing = (watch: BountyWatch, cards: readonly Card[]): BountyWatch => ({
  ...watch,
  shown: new Set([...watch.shown, ...cards]),
});

const paidProblems = (
  watch: BountyWatch,
  after: RoomState,
  paid: Extract<Event, { readonly _tag: "BountyPaid" }>
): readonly string[] =>
  Option.match(watch.due, {
    onNone: () => [
      `hand ${watch.hand} paid seat ${paid.seat} a bounty nobody owed`,
    ],
    onSome: ({ collector, ended, payers }) => {
      const hole = watch.holes.get(collector) ?? [];

      const moved = (seat: SeatIndex) =>
        (seat === collector
          ? payers.reduce((total, payer) => total + payer.amount, 0)
          : 0) - (payers.find((payer) => payer.seat === seat)?.amount ?? 0);

      return [
        ...(paid.seat === collector &&
        JSON.stringify(paid.payers) === JSON.stringify(payers)
          ? []
          : [
              `hand ${watch.hand} paid ${JSON.stringify(paid)}, the log owes ${JSON.stringify(payers)} to seat ${collector}`,
            ]),
        ...(hole.every((card) => watch.shown.has(card))
          ? []
          : [`hand ${watch.hand} paid seat ${collector} without its cards`]),
        ...watch.dealt.flatMap((seat) =>
          stackAt(after, seat) - stackAt(ended, seat) === moved(seat)
            ? []
            : [
                `hand ${watch.hand} left seat ${seat} with ${stackAt(after, seat)} after a bounty of ${moved(seat)} on ${stackAt(ended, seat)}`,
              ]
        ),
      ];
    },
  });

const unpaid = (watch: BountyWatch, next: string): readonly string[] =>
  Option.match(watch.due, {
    onNone: () => [],
    onSome: ({ collector }) => [
      `hand ${watch.hand} owed seat ${collector} a bounty, then ${next}`,
    ],
  });

export const watchedBounty = (
  watch: BountyWatch,
  after: RoomState,
  event: Event
): BountySeen =>
  Match.value(event).pipe(
    Match.tag("HandStarted", ({ dealtIn, handNumber }) =>
      seen(
        {
          ...NO_BOUNTY_WATCH,
          dealt: dealtIn,
          hand: handNumber,
          rule: ruleOf(after),
        },
        unpaid(watch, "the next hand")
      )
    ),
    Match.tag("HoleCardsDealt", ({ cards, seat }) =>
      seen({ ...watch, holes: new Map([...watch.holes, [seat, cards]]) })
    ),
    Match.tag("PotAwarded", ({ eligible, winners }) =>
      seen({
        ...watch,
        awards: [
          ...watch.awards,
          { eligible, winners: winners.map((winner) => winner.seat) },
        ],
      })
    ),
    Match.tag("HandTabled", "CardsShown", ({ cards }) =>
      seen(showing(watch, cards))
    ),
    Match.tag("HandsTabled", ({ hands }) =>
      seen(
        showing(
          watch,
          hands.flatMap((hand) => hand.cards)
        )
      )
    ),
    Match.tag("ShowdownReached", ({ order }) =>
      seen(
        showing(
          watch,
          order.flatMap((entry) =>
            ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
          )
        )
      )
    ),
    Match.tag("HandEnded", () => seen({ ...watch, due: owedAt(watch, after) })),
    Match.tag("BountyPaid", (paid) => ({
      paid: 1,
      problems: paidProblems(watch, after, paid),
      watch: { ...watch, due: Option.none() },
    })),
    Match.orElse(() =>
      seen({ ...watch, due: Option.none() }, unpaid(watch, event._tag))
    )
  );

export const neverPaid = (watch: BountyWatch) =>
  unpaid(watch, "the end of the log");
