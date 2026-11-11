import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Antes,
  BombPots,
  CardFromText,
  ChipsSchema,
  Commands,
  DeckSchema,
  Events,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  SevenDeuces,
  ShownCardsSchema,
  TableConfigSchema,
  cardText,
  decide,
  evaluate,
  evolve,
  initialTable,
} from "@nostakes/engine";
import type { Command, Event, SeatIndex, TableState } from "@nostakes/engine";
import { Result, Schema } from "effect";

import {
  GUIDE_STEPS,
  stepReport,
  tookReport,
} from "../src/features/learn/counts.js";
import { LESSON } from "../src/features/learn/hands.js";
import {
  BIG_BLIND,
  SEATS,
  SMALL_BLIND,
  STARTING_STACK,
} from "../src/features/learn/lesson.js";
import type { Hand, Move, Seat } from "../src/features/learn/lesson.js";
import {
  begin,
  choose,
  here,
  jump,
  tableAt,
} from "../src/features/learn/walk.js";
import type { Walk } from "../src/features/learn/walk.js";
import { bestFive, handName } from "../src/features/moments/hand-names.js";

const seatAt = (index: number) => SeatIndexSchema.make(index);

const chips = (amount: number) => ChipsSchema.make(amount);

const decodeCard = Schema.decodeSync(CardFromText);

const decodeDeck = Schema.decodeSync(DeckSchema);

const CONFIG = TableConfigSchema.make({
  ante: Antes.NoAnte(),
  bigBlind: chips(BIG_BLIND),
  bombPot: BombPots.NoBombPots(),
  maxRuns: RunCountSchema.make(1),
  rabbitHunt: false,
  sevenDeuce: SevenDeuces.NoBounty(),
  showdown: "Automatic",
  smallBlind: chips(SMALL_BLIND),
  straddle: { button: false, underTheGun: 0 },
});

interface Played {
  readonly events: readonly Event[];
  readonly state: TableState;
}

const applied = (state: TableState, command: Command): Played => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw new Error(
      `The engine refused ${JSON.stringify(command)}: ${decision.failure._tag}`
    );
  }

  let next = state;

  for (const event of decision.success) {
    next = evolve(next, event);
  }

  return { events: decision.success, state: next };
};

const appliedAll = (from: Played, commands: readonly Command[]): Played => {
  const events = [...from.events];
  let { state } = from;

  for (const command of commands) {
    const next = applied(state, command);

    events.push(...next.events);
    ({ state } = next);
  }

  return { events, state };
};

const seated = appliedAll(
  { events: [], state: initialTable(CONFIG) },
  SEATS.map((_, index) =>
    Commands.SitDown({
      buyIn: chips(STARTING_STACK),
      player: PlayerIdSchema.make(`p${index}`),
      seat: seatAt(index),
    })
  )
).state;

const IDENTITY = decodeDeck(Array.from({ length: 52 }, (_, index) => index));

const act = (
  seat: SeatIndex,
  action: Parameters<typeof Commands.Act>[0]["action"]
) => Commands.Act({ action, seat });

const probe = () => {
  const opened = applied(
    seated,
    Commands.StartHand({ deck: IDENTITY, straddles: [] })
  );

  const started = opened.events.find(Events.$is("HandStarted"));

  if (started === undefined) {
    throw new Error("The engine started no hand.");
  }

  const order = [0, 1, 2, 3].map((step) =>
    seatAt((started.button + step) % SEATS.length)
  );

  const [you, bo, mara, jonas] = order;

  if (
    you === undefined ||
    bo === undefined ||
    mara === undefined ||
    jonas === undefined
  ) {
    throw new Error("The table has four seats.");
  }

  const moves = [
    act(jonas, Actions.Call()),
    act(you, Actions.Call()),
    act(bo, Actions.Call()),
    act(mara, Actions.Check()),
    ...[0, 1, 2].flatMap(() => [
      act(bo, Actions.Check()),
      act(mara, Actions.Check()),
      act(jonas, Actions.Check()),
      act(you, Actions.Check()),
    ]),
  ];

  const { events } = appliedAll(opened, moves);

  return {
    board: events
      .filter(Events.$is("StreetDealt"))
      .flatMap((dealt) => dealt.cards),
    holes: new Map(
      events
        .filter(Events.$is("HoleCardsDealt"))
        .map((dealt) => [dealt.seat, dealt.cards] as const)
    ),
    seats: { bo, jonas, mara, you } satisfies Record<Seat, SeatIndex>,
    started,
  };
};

const PROBE = probe();

const deckFor = (hand: Hand) => {
  const placed = new Map<number, number>();

  for (const seat of SEATS) {
    const slots = PROBE.holes.get(PROBE.seats[seat]) ?? [];

    for (const [index, text] of hand.hole[seat].entries()) {
      placed.set(slots[index] ?? -1, decodeCard(text));
    }
  }

  for (const [index, text] of hand.board.entries()) {
    placed.set(PROBE.board[index] ?? -1, decodeCard(text));
  }

  const used = new Set(placed.values());
  const spare = IDENTITY.filter((card) => !used.has(card));

  return decodeDeck(
    IDENTITY.map((_, slot) => placed.get(slot) ?? spare.shift() ?? 0)
  );
};

const commandOf = (hand: Hand, move: Move): readonly Command[] => {
  if (move.kind === "Bet") {
    return [
      act(PROBE.seats[move.seat], Actions.RaiseTo({ to: chips(move.to) })),
    ];
  }

  if (move.kind === "Call") {
    return [act(PROBE.seats[move.seat], Actions.Call())];
  }

  if (move.kind === "Check") {
    return [act(PROBE.seats[move.seat], Actions.Check())];
  }

  if (move.kind === "Fold") {
    return [act(PROBE.seats[move.seat], Actions.Fold())];
  }

  if (move.kind === "Show") {
    return [
      Commands.ShowCards({
        cards: ShownCardsSchema.make(
          hand.hole[move.seat].map((text) => decodeCard(text))
        ),
        seat: PROBE.seats[move.seat],
      }),
    ];
  }

  return [];
};

const replayed = (hand: Hand, moves: readonly Move[]): Played =>
  appliedAll(
    applied(seated, Commands.StartHand({ deck: deckFor(hand), straddles: [] })),
    moves.flatMap((move) => commandOf(hand, move))
  );

const seatOf = (index: SeatIndex) =>
  SEATS.find((seat) => PROBE.seats[seat] === index) ?? "you";

const stacksOf = (state: TableState) =>
  Object.fromEntries(
    SEATS.map((seat) => {
      const at = state.seats[PROBE.seats[seat]];

      return [
        seat,
        at !== undefined && Seats.$is("Occupied")(at) ? at.stack : -1,
      ];
    })
  );

const boardOf = (events: readonly Event[]) =>
  events
    .filter(Events.$is("StreetDealt"))
    .flatMap((dealt) => dealt.cards.map(cardText));

const awardsOf = (events: readonly Event[]) =>
  events.filter(Events.$is("PotAwarded")).flatMap((pot) =>
    pot.winners.map((share) => ({
      amount: share.amount,
      seat: seatOf(share.seat),
    }))
  );

interface Path {
  readonly moves: readonly Move[];
  readonly walk: Walk;
}

const pathsFrom = (walk: Walk, moves: readonly Move[]): readonly Path[] => {
  const beat = here(LESSON, walk);

  if (beat === undefined) {
    return [];
  }

  const arrived = [...moves, ...beat.moves];

  return beat.choices.flatMap((choice, index) => {
    const next = choose(LESSON, walk, index);
    const landed = here(LESSON, next);

    return landed === undefined || landed.hand !== beat.hand
      ? [{ moves: arrived, walk }]
      : pathsFrom(next, [...arrived, ...choice.moves]);
  });
};

const pathsOf = (hand: Hand) =>
  pathsFrom(jump(LESSON, begin(LESSON), hand.id), hand.played);

const sorted = (cards: readonly string[]) => cards.toSorted();

const holesOf = (events: readonly Event[]) =>
  Object.fromEntries(
    events.flatMap((event) =>
      Events.$is("HoleCardsDealt")(event)
        ? [[seatOf(event.seat), event.cards.map(cardText)] as const]
        : []
    )
  );

const tabledBy = (hand: Hand) =>
  [...LESSON.beats.values()]
    .filter((beat) => beat.hand === hand.id)
    .flatMap((beat) =>
      beat.tabled.map((tabled) => ({ beat: beat.id, tabled }))
    );

describe("the hands of the lesson, replayed by the engine", () => {
  it.each(LESSON.hands.map((hand) => [hand.id, hand] as const))(
    "plays every line of %s as a legal hand that ends as the lesson says",
    (_, hand) => {
      const paths = pathsOf(hand);
      const board = hand.board.map((text) => decodeCard(text));

      expect(paths.length).toBeGreaterThan(0);

      for (const path of paths) {
        const { events, state } = replayed(hand, path.moves);
        const table = tableAt(LESSON, path.walk);

        expect({
          board: boardOf(events),
          ended: events.some(Events.$is("HandEnded")),
          holes: holesOf(events),
          id: path.walk.at,
          stacks: stacksOf(state),
          won: awardsOf(events),
        }).toStrictEqual({
          board: hand.board.slice(0, table.board),
          ended: true,
          holes: hand.hole,
          id: path.walk.at,
          stacks: table.stacks,
          won: [table.won],
        });
      }

      for (const { beat, tabled } of tabledBy(hand)) {
        const hole = hand.hole[tabled.seat].map((text) => decodeCard(text));

        expect({
          beat,
          five: sorted(bestFive(hole, board).map(cardText)),
          name: handName(evaluate([...hole, ...board])),
        }).toStrictEqual({
          beat,
          five: sorted(tabled.five),
          name: tabled.name,
        });
      }
    }
  );
});

describe("what the guide counts", () => {
  it("writes nothing but a step or a coarse time from the fixed lists", () => {
    expect([
      ...GUIDE_STEPS.map((step) => stepReport(step)),
      ...[0, 60_000, 120_000, 180_000, 300_000].map((ms) => tookReport(ms)),
    ]).toStrictEqual([
      '{"_tag":"GuideStep","step":"Started"}',
      '{"_tag":"GuideStep","step":"Hand2"}',
      '{"_tag":"GuideStep","step":"Hand3"}',
      '{"_tag":"GuideStep","step":"Hand4"}',
      '{"_tag":"GuideStep","step":"Hand5"}',
      '{"_tag":"GuideStep","step":"Finished"}',
      '{"_tag":"GuideTook","took":"Under1m"}',
      '{"_tag":"GuideTook","took":"1to2m"}',
      '{"_tag":"GuideTook","took":"2to3m"}',
      '{"_tag":"GuideTook","took":"3to5m"}',
      '{"_tag":"GuideTook","took":"Over5m"}',
    ]);
  });
});
