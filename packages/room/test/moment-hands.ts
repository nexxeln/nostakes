import {
  Actions,
  Antes,
  CardFromText,
  ChipsSchema,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "@nostakes/engine";
import type {
  Action,
  Card,
  Command,
  Event,
  SeatIndex,
  TableConfig,
  TableState,
} from "@nostakes/engine";
import { Option, Result, Schema } from "effect";

import {
  Audiences,
  RoomEvents,
  SeenEvents,
  millis,
  redact,
} from "../src/index.js";
import type { Audience, SeenTableEvent } from "../src/index.js";
import type { SeededRandom } from "./random.js";

const decodeCard = Schema.decodeSync(CardFromText);

const decodeDeck = Schema.decodeSync(DeckSchema);

export const cardsOf = (text: string): readonly Card[] =>
  text
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => decodeCard(word));

export const seat = (index: number) => SeatIndexSchema.make(index);

const chipCount = (amount: number) => ChipsSchema.make(amount);

export const homeConfig: TableConfig = TableConfigSchema.make({
  ante: Antes.NoAnte(),
  bigBlind: chipCount(10),
  maxRuns: RunCountSchema.make(1),
  rabbitHunt: false,
  showdown: "Automatic",
  smallBlind: chipCount(5),
  straddle: { button: false, underTheGun: 0 },
});

export const deckStartingWith = (text: string) => {
  const top = cardsOf(text);

  return decodeDeck([
    ...top,
    ...Array.from({ length: 52 }, (_, index) => index).filter(
      (index) => !top.some((chosen) => chosen === index)
    ),
  ]);
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

  return { events: decision.success, state: next };
};

export const seatedTable = (
  config: TableConfig,
  stacks: Readonly<Record<number, number>>
) => {
  let state = initialTable(config);

  for (const [index, stack] of Object.entries(stacks)) {
    ({ state } = applied(
      state,
      Commands.SitDown({
        buyIn: chipCount(stack),
        player: PlayerIdSchema.make(`p${index}`),
        seat: seat(Number(index)),
      })
    ));
  }

  return state;
};

export const bets = (to: number) => Actions.RaiseTo({ to: chipCount(to) });

export const calls = Actions.Call();

export const checks = Actions.Check();

export const folds = Actions.Fold();

export const act = (index: number, action: Action): Command =>
  Commands.Act({ action, seat: seat(index) });

export const chooses = (index: number, runs: number): Command =>
  Commands.ChooseRuns({ runs: RunCountSchema.make(runs), seat: seat(index) });

export const shows = (index: number, text: string): Command =>
  Commands.ShowCards({
    cards: ShownCardsSchema.make(cardsOf(text)),
    seat: seat(index),
  });

export interface Scene {
  readonly config?: TableConfig;
  readonly deck: string;
  readonly moves: readonly Command[];
  readonly stacks: Readonly<Record<number, number>>;
}

export const played = (scene: Scene): readonly Event[] => {
  const opened = applied(
    seatedTable(scene.config ?? homeConfig, scene.stacks),
    Commands.StartHand({ deck: deckStartingWith(scene.deck), straddles: [] })
  );

  const events = [...opened.events];
  let { state } = opened;

  for (const move of scene.moves) {
    const step = applied(state, move);

    events.push(...step.events);
    ({ state } = step);
  }

  return events;
};

export const feedFor = (
  events: readonly Event[],
  audience: Audience
): readonly SeenTableEvent[] =>
  events.flatMap((event) => {
    const seen = redact(RoomEvents.Table({ at: millis(0), event }), audience);

    return SeenEvents.$is("Table")(seen) ? [seen.event] : [];
  });

export const spectatorFeed = (events: readonly Event[]) =>
  feedFor(events, Audiences.Spectator());

const dealtSeats = (events: readonly Event[]): readonly SeatIndex[] =>
  events.flatMap((event) =>
    Events.$is("HoleCardsDealt")(event) ? [event.seat] : []
  );

export const seatedAudiences = (events: readonly Event[]) =>
  dealtSeats(events).map((dealt) =>
    Audiences.Seated({ player: PlayerIdSchema.make(`p${dealt}`), seat: dealt })
  );

const ORDERED = Array.from({ length: 52 }, (_, index) => index);

const shuffled = (random: SeededRandom) => {
  const cards = [...ORDERED];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = random.below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return decodeDeck(cards);
};

const generatedConfig = (random: SeededRandom): TableConfig =>
  TableConfigSchema.make({
    allInHands: random.chance(1, 3) ? "Hidden" : "FaceUp",
    ante: random.chance(1, 4)
      ? Antes.EveryPlayer({ amount: chipCount(1 + random.below(5)) })
      : Antes.NoAnte(),
    bigBlind: chipCount(10),
    maxRuns: RunCountSchema.make(1 + random.below(3)),
    rabbitHunt: false,
    showdown: random.chance(1, 3) ? "Interactive" : "Automatic",
    smallBlind: chipCount(5),
    straddle: { button: false, underTheGun: 0 },
  });

const generatedAction = (state: TableState, random: SeededRandom): Command =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) => {
      const roll = random.below(100);
      const { raise } = legal;

      const action = (() => {
        if (roll < 12) {
          return legal.canCheck ? Actions.Check() : Actions.Fold();
        }

        if (roll < 55 || Option.isNone(raise)) {
          return legal.canCheck ? Actions.Check() : Actions.Call();
        }

        const { maxTo, minTo } = raise.value;

        return Actions.RaiseTo({
          to:
            roll < 80
              ? chipCount(
                  Math.min(maxTo, minTo + random.below(Math.max(1, minTo * 3)))
                )
              : maxTo,
        });
      })();

      return Commands.Act({ action, seat: legal.seat });
    },
    ChooseRuns: ({ maxRuns, seats }) =>
      Commands.ChooseRuns({
        runs: RunCountSchema.make(1 + random.below(maxRuns)),
        seat: seats[0] ?? seat(0),
      }),
    Nothing: () =>
      Commands.StartHand({ deck: shuffled(random), straddles: [] }),
    Show: ({ choices }) =>
      choices.canMuck && random.chance(1, 3)
        ? Commands.MuckHand({ seat: choices.seat })
        : Commands.TableHand({ seat: choices.seat }),
  });

const afterShows = (
  state: TableState,
  random: SeededRandom
): readonly Command[] => {
  if (!TableStates.$is("BetweenHands")(state)) {
    return [];
  }

  return Option.match(state.lastHand, {
    onNone: () => [],
    onSome: (lastHand) =>
      lastHand.players.flatMap((player) => {
        const hidden = player.holeCards.filter(
          (card) => !player.publicCards.includes(card)
        );

        return hidden.length > 0 && random.chance(2, 5)
          ? [
              Commands.ShowCards({
                cards: ShownCardsSchema.make(hidden),
                seat: player.seat,
              }),
            ]
          : [];
      }),
  });
};

export const generatedHand = (random: SeededRandom): readonly Event[] => {
  const players = 2 + random.below(8);
  const stacks: Record<number, number> = {};

  for (let index = 0; index < players; index += 1) {
    stacks[index] = 50 + random.below(1500);
  }

  let state = seatedTable(generatedConfig(random), stacks);
  const events: Event[] = [];

  do {
    const step = applied(state, generatedAction(state, random));

    events.push(...step.events);
    ({ state } = step);
  } while (TableStates.$is("InHand")(state));

  for (const show of afterShows(state, random)) {
    const step = applied(state, show);

    events.push(...step.events);
    ({ state } = step);
  }

  return events;
};
