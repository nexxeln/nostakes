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
  handCategory,
  initialTable,
} from "@nostakes/engine";
import type { Command, Event, SeatIndex, TableState } from "@nostakes/engine";
import { Result, Schema } from "effect";

import learnPage from "../learn.html?raw";
import {
  GUIDE_STEPS,
  stepAt,
  stepReport,
  timeTaken,
  tookReport,
} from "../src/features/learn/counts.js";
import { cardWords, factsOf } from "../src/features/learn/facts.js";
import { HABITS, RANKING } from "../src/features/learn/guide.js";
import { LESSON, RECAP } from "../src/features/learn/hands.js";
import {
  BIG_BLIND,
  SEATS,
  SMALL_BLIND,
  STARTING_STACK,
  beatOf,
} from "../src/features/learn/lesson.js";
import type { Hand, Move, Seat } from "../src/features/learn/lesson.js";
import { afterMoves, DEALT } from "../src/features/learn/table.js";
import type { Table } from "../src/features/learn/table.js";
import {
  back,
  begin,
  choose,
  here,
  jump,
  skip,
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

const everyWalk = (walk: Walk): readonly Walk[] => [
  walk,
  ...(here(LESSON, walk)?.choices ?? []).flatMap((_, index) =>
    everyWalk(choose(LESSON, walk, index))
  ),
];

const ALL_WALKS = everyWalk(begin(LESSON));

const sorted = (cards: readonly string[]) => cards.toSorted();

describe("the hands of the lesson, replayed by the engine", () => {
  it("seats you on the button with Bo and Mara in the blinds", () => {
    expect([
      PROBE.started.button,
      PROBE.started.smallBlindSeat,
      PROBE.started.bigBlindSeat,
    ]).toStrictEqual([PROBE.seats.you, PROBE.seats.bo, PROBE.seats.mara]);
  });

  it.each(LESSON.hands.map((hand) => [hand.id, hand] as const))(
    "plays every line of %s as a legal hand with the lesson's chips",
    (_, hand) => {
      const paths = pathsOf(hand);

      expect(paths.length).toBeGreaterThan(0);

      for (const path of paths) {
        const { events, state } = replayed(hand, path.moves);
        const table = tableAt(LESSON, path.walk);

        expect(events.some(Events.$is("HandEnded"))).toBe(true);
        expect({ id: path.walk.at, stacks: stacksOf(state) }).toStrictEqual({
          id: path.walk.at,
          stacks: table.stacks,
        });
        expect({ id: path.walk.at, won: awardsOf(events) }).toStrictEqual({
          id: path.walk.at,
          won: [table.won],
        });
        expect(boardOf(events)).toStrictEqual(hand.board.slice(0, table.board));
      }
    }
  );

  it.each(LESSON.hands.map((hand) => [hand.id, hand] as const))(
    "deals %s the cards the lesson shows",
    (_, hand) => {
      const { events } = replayed(hand, []);

      expect(
        Object.fromEntries(
          events
            .filter(Events.$is("HoleCardsDealt"))
            .map((dealt) => [seatOf(dealt.seat), dealt.cards.map(cardText)])
        )
      ).toStrictEqual(hand.hole);
    }
  );

  it("names every tabled hand and its best five cards as the evaluator does", () => {
    for (const beat of LESSON.beats.values()) {
      const hand = LESSON.hands.find((each) => each.id === beat.hand);

      for (const tabled of beat.tabled) {
        const hole = (hand?.hole[tabled.seat] ?? []).map((text) =>
          decodeCard(text)
        );

        const board = (hand?.board ?? []).map((text) => decodeCard(text));

        expect({
          five: sorted(bestFive(hole, board).map(cardText)),
          id: beat.id,
          name: handName(evaluate([...hole, ...board])),
        }).toStrictEqual({
          five: sorted(tabled.five),
          id: beat.id,
          name: tabled.name,
        });
      }
    }
  });

  it("lights only cards that are on the table or in a tabled hand", () => {
    for (const walk of ALL_WALKS) {
      const beat = here(LESSON, walk);
      const hand = LESSON.hands.find((each) => each.id === beat?.hand);
      const table = tableAt(LESSON, walk);

      const seen = new Set([
        ...(hand?.board.slice(0, table.board) ?? []),
        ...(hand?.hole.you ?? []),
        ...table.shown.flatMap((seat) => hand?.hole[seat] ?? []),
      ]);

      expect({
        id: beat?.id,
        unseen: (beat?.lit ?? []).filter((card) => !seen.has(card)),
      }).toStrictEqual({ id: beat?.id, unseen: [] });
    }
  });

  it("shows a tabled hand only for a seat whose cards are face up", () => {
    for (const walk of ALL_WALKS) {
      const beat = here(LESSON, walk);
      const table = tableAt(LESSON, walk);

      expect({
        hidden: (beat?.tabled ?? [])
          .map((tabled) => tabled.seat)
          .filter((seat) => seat !== "you" && !table.shown.includes(seat)),
        id: beat?.id,
      }).toStrictEqual({ hidden: [], id: beat?.id });
    }
  });
});

describe("the walk through the lesson", () => {
  it("reaches the recap whatever the learner chooses", () => {
    const ends = ALL_WALKS.filter(
      (walk) => (here(LESSON, walk)?.choices.length ?? 0) === 0
    );

    expect(ends.length).toBeGreaterThan(0);
    expect(new Set(ends.map((walk) => walk.at))).toStrictEqual(
      new Set([RECAP])
    );
  });

  it("names a beat that exists in every choice, and no beat is unreachable", () => {
    const reached = new Set(ALL_WALKS.map((walk) => walk.at));

    expect(
      [...LESSON.beats.keys()].filter((id) => !reached.has(id))
    ).toStrictEqual([]);
    expect(
      [...LESSON.beats.values()].flatMap((beat) =>
        beat.choices
          .filter((choice) => beatOf(LESSON, choice.to) === undefined)
          .map((choice) => `${beat.id} -> ${choice.to}`)
      )
    ).toStrictEqual([]);
  });

  it("gives every gesture one meaning in a beat", () => {
    expect(
      [...LESSON.beats.values()].flatMap((beat) =>
        new Set(beat.choices.map((choice) => choice.gesture)).size ===
        beat.choices.length
          ? []
          : [beat.id]
      )
    ).toStrictEqual([]);
  });

  it("goes back to exactly where the learner was, from anywhere", () => {
    for (const walk of ALL_WALKS) {
      for (const [index] of (here(LESSON, walk)?.choices ?? []).entries()) {
        expect(back(choose(LESSON, walk, index))).toBe(walk);
      }

      for (const hand of LESSON.hands) {
        const jumped = jump(LESSON, walk, hand.id);

        expect(jumped === walk || back(jumped) === walk).toBe(true);
      }
    }

    expect(back(begin(LESSON))).toStrictEqual(begin(LESSON));
  });

  it("finishes in a bounded number of skips from anywhere", () => {
    const skipsFrom = (walk: Walk, taken = 0): number =>
      (here(LESSON, walk)?.choices.length ?? 0) === 0 || taken > 60
        ? taken
        : skipsFrom(skip(LESSON, walk), taken + 1);

    expect(skipsFrom(begin(LESSON))).toBe(19);
    expect(Math.max(...ALL_WALKS.map((walk) => skipsFrom(walk)))).toBeLessThan(
      30
    );
  });

  it("lets the learner jump to any hand and play on from there", () => {
    for (const hand of LESSON.hands) {
      const jumped = jump(LESSON, begin(LESSON), hand.id);

      expect(jumped.at).toBe(hand.first);
      expect(tableAt(LESSON, jumped)).toStrictEqual(
        afterMoves(DEALT, [
          ...hand.played,
          ...(beatOf(LESSON, hand.first)?.moves ?? []),
        ])
      );
    }
  });

  it("keeps the last hand free of advice until it is over", () => {
    const playing = [...LESSON.beats.values()].filter(
      (beat) => beat.hand === "Yours" && beat.kind === "Play"
    );

    expect(playing.length).toBe(11);
    expect(
      playing.filter(
        (beat) =>
          beat.cue.length > 0 || beat.talk.length > 0 || beat.lit.length > 0
      )
    ).toStrictEqual([]);
    expect(
      playing.filter((beat) => beat.id !== "Yours.Start" && beat.line !== "")
    ).toStrictEqual([]);
  });

  it("plays the last hand fifteen ways and grades each in two sentences", () => {
    const ends = [...LESSON.beats.values()].filter(
      (beat) => beat.hand === "Yours" && beat.kind === "Outcome"
    );

    expect(ends.length).toBe(15);
    expect(
      ends.filter(
        (beat) => !/^(?:You|Mara) .+\. A regular .+\.$/u.test(beat.line)
      )
    ).toStrictEqual([]);
  });
});

const tableOf = (id: string): Table | undefined => {
  const walk = ALL_WALKS.find((each) => each.at === id);

  return walk === undefined ? undefined : tableAt(LESSON, walk);
};

const lost = (id: string, seat: Seat) => {
  const table = tableOf(id);

  return table === undefined ? -1 : STARTING_STACK - table.stacks[seat];
};

const potAt = (id: string) => {
  const table = tableOf(id);

  return table === undefined
    ? -1
    : table.pot +
        table.bets.bo +
        table.bets.jonas +
        table.bets.mara +
        table.bets.you;
};

const AMOUNT = /^(?:Bet|Call|Raise to) (?<amount>\d+)$/u;

describe("what the lesson says about chips", () => {
  it("counts what each mistake cost as the table does", () => {
    expect({
      bo: lost("Fold.Folded", "bo"),
      first: lost("Fold.Paid60", "you"),
      second: lost("Fold.Paid160", "you"),
    }).toStrictEqual({ bo: 140, first: 60, second: 160 });
  });

  it("puts 30 in the pot from the blinds before anyone acts", () => {
    expect(potAt("Whole.Peek")).toBe(30);
  });

  it("makes every amount on a button the amount the move puts in", () => {
    for (const walk of ALL_WALKS) {
      const beat = here(LESSON, walk);
      const table = tableAt(LESSON, walk);

      for (const choice of beat?.choices ?? []) {
        const amount = AMOUNT.exec(choice.label)?.groups?.amount;
        const after = afterMoves(table, choice.moves);

        expect({
          bet: amount === undefined ? "" : String(after.bets.you),
          id: beat?.id,
        }).toStrictEqual({ bet: amount ?? "", id: beat?.id });
      }
    }
  });
});

const readable = (html: string) =>
  html
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll("&#9829;&#xFE0E;", "h")
    .replaceAll(/\s+/gu, " ");

describe("the guide as text", () => {
  it("holds the whole ranking and every habit in the page's own HTML", () => {
    const page = readable(learnPage);

    expect(
      [
        ...RANKING.flatMap((ranked) => [ranked.name, ranked.means]),
        ...HABITS,
      ].filter((words) => !page.includes(words))
    ).toStrictEqual([]);
  });

  it("gives each ranked hand the example the sheet draws", () => {
    expect(
      RANKING.filter(
        (ranked) =>
          !learnPage.includes(`data-cards="${ranked.cards.join(" ")}"`)
      ).map((ranked) => ranked.name)
    ).toStrictEqual([]);
  });

  it("names every example hand what the evaluator calls it", () => {
    expect(
      RANKING.map((ranked) =>
        handCategory(evaluate(ranked.cards.map((text) => decodeCard(text))))
      )
    ).toStrictEqual([
      "StraightFlush",
      "FourOfAKind",
      "FullHouse",
      "Flush",
      "Straight",
      "ThreeOfAKind",
      "TwoPair",
      "OnePair",
      "HighCard",
    ]);
  });
});

describe("what a screen reader is told", () => {
  it("never names a card the learner cannot see", () => {
    for (const walk of ALL_WALKS) {
      const beat = here(LESSON, walk);
      const hand = LESSON.hands.find((each) => each.id === beat?.hand);
      const table = tableAt(LESSON, walk);

      const hidden =
        beat === undefined || hand === undefined
          ? []
          : [
              ...hand.board.slice(table.board),
              ...(beat.peeked ? [] : hand.hole.you),
              ...SEATS.flatMap((seat) =>
                seat === "you" || table.shown.includes(seat)
                  ? []
                  : hand.hole[seat]
              ),
            ];

      const said =
        beat === undefined ? "" : factsOf(hand, table, beat).toLowerCase();

      expect({
        id: beat?.id,
        leaked: hidden.filter((card) => said.includes(cardWords(card))),
      }).toStrictEqual({ id: beat?.id, leaked: [] });
    }
  });

  it("says the learner's cards and the board once they are up", () => {
    const walk = ALL_WALKS.find((each) => each.at === "Whole.Bet");
    const beat = walk === undefined ? undefined : here(LESSON, walk);

    expect(
      walk === undefined || beat === undefined
        ? ""
        : factsOf(LESSON.hands[0], tableAt(LESSON, walk), beat)
    ).toBe(
      "Your cards: ace of spades, king of hearts. On the table: king of diamonds, eight of clubs, three of spades. In the pot: 50. Bo: Fold. Mara: Check. Jonas: Fold."
    );
  });
});

const skipped = (walk: Walk): readonly Walk[] =>
  (here(LESSON, walk)?.choices.length ?? 0) === 0
    ? [walk]
    : [walk, ...skipped(skip(LESSON, walk))];

describe("what the guide counts", () => {
  it("counts the start, each later hand, and the end, once and in order", () => {
    expect(
      skipped(begin(LESSON)).flatMap((walk) => {
        const step = stepAt(LESSON, walk.at);

        return step === undefined ? [] : [step];
      })
    ).toStrictEqual([...GUIDE_STEPS]);
  });

  it("writes its two reports as the server reads them", () => {
    expect([stepReport("Hand3"), tookReport(90_000)]).toStrictEqual([
      '{"_tag":"GuideStep","step":"Hand3"}',
      '{"_tag":"GuideTook","took":"1to2m"}',
    ]);
  });

  it("files how long it took in five coarse buckets", () => {
    expect(
      [0, 59_999, 60_000, 119_999, 120_000, 180_000, 299_999, 300_000].map(
        (ms) => timeTaken(ms)
      )
    ).toStrictEqual([
      "Under1m",
      "Under1m",
      "1to2m",
      "1to2m",
      "2to3m",
      "3to5m",
      "3to5m",
      "Over5m",
    ]);
  });
});
