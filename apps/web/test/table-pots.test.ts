import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Antes,
  ChipsSchema,
  Commands,
  DeckSchema,
  PendingDecisions,
  Phases,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  TableConfigSchema,
  TableStates,
  buildPots,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "@nostakes/engine";
import type { Command, TableState } from "@nostakes/engine";
import type { HandViewSchema } from "@nostakes/room";
import { Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  bettingClosed,
  potsOnTheTable,
} from "../src/features/table/from-room.js";

type HandView = typeof HandViewSchema.Type;

type InHand = Extract<TableState, { readonly _tag: "InHand" }>;

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const chipCount = (amount: number) => ChipsSchema.make(amount);

const randomFrom = (seed: number) => {
  let state = seed % 2_147_483_647;

  return (below: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, below);
  };
};

const shuffled = (below: (count: number) => number) => {
  const cards = Array.from({ length: 52 }, (_, index) => index);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return Schema.decodeSync(DeckSchema)(cards);
};

const applied = (state: TableState, command: Command) => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw new Error(`${command._tag} was refused: ${decision.failure._tag}`);
  }

  let next = state;

  for (const event of decision.success) {
    next = evolve(next, event);
  }

  return next;
};

const nextMove = (
  state: TableState,
  below: (count: number) => number
): Command =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) => {
      const roll = below(100);

      if (roll < 20) {
        return Commands.Act({
          action: legal.canCheck ? Actions.Check() : Actions.Fold(),
          seat: legal.seat,
        });
      }

      const calm = legal.canCheck ? Actions.Check() : Actions.Call();

      return Option.match(legal.raise, {
        onNone: () => Commands.Act({ action: calm, seat: legal.seat }),
        onSome: ({ maxTo, minTo }) =>
          Commands.Act({
            action:
              roll < 60
                ? calm
                : Actions.RaiseTo({
                    to: chipCount(roll < 85 ? minTo : maxTo),
                  }),
            seat: legal.seat,
          }),
      });
    },
    ChooseRuns: ({ maxRuns, seats }) =>
      Commands.ChooseRuns({
        runs: RunCountSchema.make(1 + below(maxRuns)),
        seat: seats[0] ?? SeatIndexSchema.make(0),
      }),
    Nothing: () => Commands.StartHand({ deck: shuffled(below), straddles: [] }),
    Show: ({ choices }) =>
      choices.canMuck && below(3) === 0
        ? Commands.MuckHand({ seat: choices.seat })
        : Commands.TableHand({ seat: choices.seat }),
  });

const potsTheViewShows = (inHand: InHand) => {
  const { hand } = inHand;

  const collected = buildPots({
    ...hand,
    players: hand.players.map((player) => ({
      ...player,
      committedTotal: chipCount(
        player.committedTotal - player.committedThisStreet
      ),
    })),
  }).map(({ amount, eligible }) => ({ amount, eligible }));

  const contenders = hand.players
    .filter((player) => player.status !== "Folded")
    .map((player) => player.seat);

  return collected.length === 0 && hand.deadMoney > 0
    ? [{ amount: hand.deadMoney, eligible: contenders }]
    : collected;
};

const handViewOf = (inHand: InHand): HandView => {
  const { hand } = inHand;
  const pending = pendingDecisions(inHand);

  return {
    bigBlindSeat: hand.bigBlindSeat,
    boards: [hand.board],
    bombPot: false,
    button: inHand.button,
    choosingRuns: Option.none(),
    handNumber: inHand.handNumber,
    players: hand.players.map((player) => ({
      committedThisStreet: player.committedThisStreet,
      committedTotal: player.committedTotal,
      mucked: player.mucked,
      player: player.player,
      seat: player.seat,
      shown: player.publicCards,
      status: player.status,
    })),
    pots: potsTheViewShows(inHand),
    smallBlindSeat: hand.smallBlindSeat,
    street: hand.street,
    toAct: PendingDecisions.$is("Bet")(pending)
      ? Option.some(pending.legal.seat)
      : Option.none(),
    toShow: PendingDecisions.$is("Show")(pending)
      ? Option.some(pending.choices.seat)
      : Option.none(),
  };
};

const statesOfAHand = (seed: number): readonly InHand[] => {
  const below = randomFrom(seed);
  const players = 2 + below(8);

  let state = initialTable(
    TableConfigSchema.make({
      ante:
        [
          Antes.NoAnte(),
          Antes.EveryPlayer({ amount: chipCount(1 + below(5)) }),
          Antes.BigBlindPays({ amount: chipCount(5 + below(10)) }),
        ][below(3)] ?? Antes.NoAnte(),
      bigBlind: chipCount(10),
      maxRuns: RunCountSchema.make(1 + below(3)),
      rabbitHunt: false,
      showdown: below(2) === 0 ? "Interactive" : "Automatic",
      smallBlind: chipCount(5),
      straddle: { button: false, underTheGun: 0 },
    })
  );

  for (let index = 0; index < players; index += 1) {
    state = applied(
      state,
      Commands.SitDown({
        buyIn: chipCount(20 + below(600)),
        player: PlayerIdSchema.make(`p${index}`),
        seat: SeatIndexSchema.make(index),
      })
    );
  }

  const seen: InHand[] = [];

  do {
    state = applied(state, nextMove(state, below));

    if (TableStates.$is("InHand")(state)) {
      seen.push(state);
    }
  } while (TableStates.$is("InHand")(state));

  return seen;
};

const amountsOf = (pots: readonly { readonly amount: number }[]) =>
  pots.map(({ amount }) => amount);

describe("the pot on the table", () => {
  it.prop(
    "holds every chip in the hand, split into the pots the engine will award, once the betting closes, and only the chips of earlier streets while a round is being bet",
    { seed: handSeed },
    ({ seed }) => {
      const wrong = statesOfAHand(seed).flatMap((inHand) => {
        const view = handViewOf(inHand);
        const closed = !Phases.$is("Betting")(inHand.hand.phase);

        const expected = closed
          ? amountsOf(buildPots(inHand.hand))
          : amountsOf(view.pots);

        const shown = potsOnTheTable(view);

        return JSON.stringify(shown) === JSON.stringify(expected) &&
          bettingClosed(view) === closed
          ? []
          : [
              `${inHand.hand.street} in ${inHand.hand.phase._tag}: the table shows ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`,
            ];
      });

      expect(wrong).toStrictEqual([]);
    },
    { arbitrary: { runs: 300 } }
  );

  it("closes the betting with this street's bets still committed in some of the hands it plays, so the property above sees them", () => {
    const closedWithBets = Array.from({ length: 60 }, (__, at) =>
      statesOfAHand(at + 1)
    )
      .flat()
      .filter(
        (inHand) =>
          !Phases.$is("Betting")(inHand.hand.phase) &&
          inHand.hand.players.some(
            ({ committedThisStreet }) => committedThisStreet > 0
          )
      );

    const withDeadMoney = closedWithBets.filter(
      ({ hand }) => hand.deadMoney > 0
    );

    expect([
      closedWithBets.length > 20,
      withDeadMoney.length > 0,
    ]).toStrictEqual([true, true]);
  });
});
