import { Option, Result } from "effect";

import type { Card } from "./cards.js";
import type { CommandOf } from "./commands.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { buildPots, handEnded, uncalledExcess } from "./pots.js";
import { chips, splitEvenly } from "./primitives.js";
import { NoRunChoiceOwed, RunsOutOfRange } from "./rejection.js";
import { RunCountSchema } from "./rules.js";
import type { RunCount, TableConfig } from "./rules.js";
import { ShowdownEntries, awardPart, rankOnBoard } from "./showdown.js";
import {
  Phases,
  activePlayers,
  isInHand,
  notFolded,
  playersClockwiseAfter,
  updatePlayer,
  whenInHand,
  withHand,
} from "./state.js";
import type {
  ChoosingRuns,
  Hand,
  InHand,
  Street,
  TableState,
} from "./state.js";

const BOARD_SIZE = 5;

const MISSING_STREETS: readonly (readonly {
  readonly cards: number;
  readonly street: Street;
}[])[] = [
  [
    { cards: 3, street: "Flop" },
    { cards: 1, street: "Turn" },
    { cards: 1, street: "River" },
  ],
  [],
  [],
  [
    { cards: 1, street: "Turn" },
    { cards: 1, street: "River" },
  ],
  [{ cards: 1, street: "River" }],
  [],
];

export const runCap = (config: TableConfig, hand: Hand): RunCount => {
  const missing = BOARD_SIZE - hand.board.length;
  let runs = 1;

  while (runs < config.maxRuns && (runs + 1) * missing <= hand.deck.length) {
    runs += 1;
  }

  return RunCountSchema.make(runs);
};

export const choosesRuns = (hand: Hand, maxRuns: number) =>
  maxRuns > 1 &&
  hand.board.length < BOARD_SIZE &&
  notFolded(hand).length > 1 &&
  activePlayers(hand).length < 2 &&
  Option.isNone(uncalledExcess(hand));

export const chooseRuns = (
  state: TableState,
  command: CommandOf<"ChooseRuns">
) => {
  const phase = isInHand(state) ? state.hand.phase : undefined;

  if (
    phase === undefined ||
    !Phases.$is("ChoosingRuns")(phase) ||
    !phase.pending.includes(command.seat)
  ) {
    return Result.fail(new NoRunChoiceOwed({ seat: command.seat }));
  }

  return command.runs <= phase.maxRuns
    ? Result.succeed([
        Events.RunsChosen({ runs: command.runs, seat: command.seat }),
      ])
    : Result.fail(
        new RunsOutOfRange({
          maxRuns: phase.maxRuns,
          runs: command.runs,
          seat: command.seat,
        })
      );
};

export const recordRunChoice = (
  state: TableState,
  event: EventOf<"RunsChosen">
) =>
  whenInHand(state, (inHand) =>
    Phases.$is("ChoosingRuns")(inHand.hand.phase)
      ? withHand(inHand, {
          ...inHand.hand,
          phase: Phases.ChoosingRuns({
            choices: [
              ...inHand.hand.phase.choices,
              { runs: event.runs, seat: event.seat },
            ],
            maxRuns: inHand.hand.phase.maxRuns,
            pending: inHand.hand.phase.pending.filter(
              (seat) => seat !== event.seat
            ),
          }),
        })
      : inHand
  );

const dealRuns = (hand: Hand, runs: RunCount) => {
  const streets = MISSING_STREETS[hand.board.length] ?? [];
  const events: Event[] = [];
  const boards: Card[][] = [];
  let { deck } = hand;

  for (let run = 1; run <= runs; run += 1) {
    const board = [...hand.board];

    for (const { cards, street } of streets) {
      const dealt = deck.slice(0, cards);

      deck = deck.slice(cards);
      board.push(...dealt);
      events.push(Events.StreetDealt({ cards: dealt, run, street }));
    }

    boards.push(board);
  }

  return { boards, events };
};

export const runOut = (state: InHand, runs: RunCount): readonly Event[] => {
  const contenders = playersClockwiseAfter(notFolded(state.hand), state.button);
  const pots = buildPots(state.hand);
  const parts = pots.map((pot) => splitEvenly(pot.amount, runs));
  const dealt = dealRuns(state.hand, runs);

  const showdowns = dealt.boards.flatMap((board, index) => {
    const run = index + 1;
    const ranked = rankOnBoard(contenders, board);

    return [
      Events.ShowdownReached({
        order: ranked.map((entry) =>
          ShowdownEntries.Shown({
            cards: entry.player.holeCards,
            rank: entry.rank,
            seat: entry.player.seat,
          })
        ),
        run,
      }),
      ...pots.map((pot, potIndex) => {
        const part = parts[potIndex] ?? { remainder: 0, share: chips(0) };

        return awardPart(state, run, ranked, {
          index: potIndex,
          pot: {
            ...pot,
            amount: chips(part.share + (index < part.remainder ? 1 : 0)),
          },
        });
      }),
    ];
  });

  return [
    Events.RunsAgreed({ runs }),
    Events.HandsTabled({
      hands: contenders.map((player) => ({
        cards: player.holeCards,
        seat: player.seat,
      })),
    }),
    ...dealt.events,
    ...showdowns,
    handEnded(state),
  ];
};

const fewestChosen = (choosing: ChoosingRuns) => {
  let fewest = choosing.maxRuns;

  for (const choice of choosing.choices) {
    fewest = choice.runs < fewest ? choice.runs : fewest;
  }

  return fewest;
};

export const agreedRuns = (state: InHand): Option.Option<RunCount> => {
  const { phase } = state.hand;

  return Phases.$is("ChoosingRuns")(phase) && phase.pending.length === 0
    ? Option.some(fewestChosen(phase))
    : Option.none();
};

export const startRunning = (state: TableState, event: EventOf<"RunsAgreed">) =>
  whenInHand(state, (inHand) =>
    withHand(inHand, {
      ...inHand.hand,
      phase: Phases.RunningOut({
        runs: Array.from({ length: event.runs }, () => []),
      }),
    })
  );

export const tableHands = (state: TableState, event: EventOf<"HandsTabled">) =>
  whenInHand(state, (inHand) => {
    let { hand } = inHand;

    for (const tabled of event.hands) {
      hand = updatePlayer(hand, tabled.seat, (player) => ({
        ...player,
        publicCards: tabled.cards,
      }));
    }

    return withHand(inHand, hand);
  });
