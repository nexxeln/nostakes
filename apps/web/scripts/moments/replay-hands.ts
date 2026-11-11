import { codeFor, randomAvatar } from "@nostakes/avatar";
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
  SevenDeuces,
  ShowdownEntries,
  ShownCardsSchema,
  TableConfigSchema,
  decide,
  evolve,
  initialTable,
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
import {
  Audiences,
  RoomEvents,
  SeenEvents,
  millis,
  redact,
} from "@nostakes/room";
import type { SeenTableEvent } from "@nostakes/room";
import { Option, Result, Schema } from "effect";

import type { MomentHand } from "../../src/features/moments/element.js";

const decodeCard = Schema.decodeSync(CardFromText);

const decodeDeck = Schema.decodeSync(DeckSchema);

const cardsOf = (text: string): readonly Card[] =>
  text
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => decodeCard(word));

const seat = (index: number) => SeatIndexSchema.make(index);

const chipCount = (amount: number) => ChipsSchema.make(amount);

type House = "BombPot" | "Bounty" | "Plain";

const configOf = (maxRuns: number, house: House): TableConfig =>
  TableConfigSchema.make({
    ante: Antes.NoAnte(),
    bigBlind: chipCount(10),
    bombPot:
      house === "BombPot"
        ? BombPots.BombPots({ ante: chipCount(50), everyHands: 1 })
        : BombPots.NoBombPots(),
    maxRuns: RunCountSchema.make(maxRuns),
    rabbitHunt: false,
    sevenDeuce:
      house === "Bounty"
        ? SevenDeuces.Bounty({ amount: chipCount(20) })
        : SevenDeuces.NoBounty(),
    showdown: "Automatic",
    smallBlind: chipCount(5),
    straddle: { button: false, underTheGun: 0 },
  });

const deckStartingWith = (text: string) => {
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

const act = (index: number, action: Action): Command =>
  Commands.Act({ action, seat: seat(index) });

const raises = (to: number) => Actions.RaiseTo({ to: chipCount(to) });

const calls = Actions.Call();

const checks = Actions.Check();

const folds = Actions.Fold();

const chooses = (index: number, runs: number): Command =>
  Commands.ChooseRuns({ runs: RunCountSchema.make(runs), seat: seat(index) });

const shows = (index: number, text: string): Command =>
  Commands.ShowCards({
    cards: ShownCardsSchema.make(cardsOf(text)),
    seat: seat(index),
  });

interface Player {
  readonly name: string;
  readonly look: number;
  readonly stack: number;
}

type Noted =
  | { readonly kind: "Tanked"; readonly seat: number }
  | {
      readonly kind: "Reacted";
      readonly reaction: "Clap" | "Cry" | "Fire" | "Laugh" | "Wow";
      readonly seat: number;
    };

interface Scripted {
  readonly deck: string;
  readonly house?: House;
  readonly maxRuns: number;
  readonly moves: readonly Command[];
  readonly noted?: readonly Noted[];
  readonly players: readonly Player[];
}

export const REPLAY_HANDS = {
  AcesCracked: {
    deck: "Ad As 2c Ah 2s 2d 7h 9d Kh",
    maxRuns: 1,
    moves: [act(0, raises(1500)), act(1, calls)],
    players: [
      { look: 41, name: "Jonas", stack: 1500 },
      { look: 23, name: "Priya", stack: 1500 },
    ],
  },
  AllInBluff: {
    deck: "As Jc 8h Qd Jd 7h Ah 2h 9c 4s Kc",
    maxRuns: 1,
    moves: [
      act(0, raises(30)),
      act(1, calls),
      act(2, raises(100)),
      act(0, calls),
      act(1, folds),
      act(2, raises(120)),
      act(0, calls),
      act(2, checks),
      act(0, checks),
      act(2, checks),
      act(0, raises(1280)),
      act(2, folds),
      shows(0, "8h 7h"),
    ],
    noted: [
      { kind: "Tanked", seat: 2 },
      { kind: "Reacted", reaction: "Laugh", seat: 1 },
      { kind: "Reacted", reaction: "Clap", seat: 2 },
    ],
    players: [
      { look: 5, name: "Lou", stack: 1500 },
      { look: 3, name: "Sam", stack: 1500 },
      { look: 61, name: "Kit", stack: 1500 },
    ],
  },
  BombPot: {
    deck: "Kd 9s 5h Jc Kc 9h 5d Tc 9c Kh 2s 9d 4c",
    house: "BombPot",
    maxRuns: 1,
    moves: [
      act(1, raises(100)),
      act(2, calls),
      act(3, folds),
      act(0, folds),
      act(1, raises(300)),
      act(2, raises(900)),
      act(1, raises(1850)),
      act(2, calls),
    ],
    players: [
      { look: 61, name: "Kit", stack: 2000 },
      { look: 37, name: "Dev", stack: 2000 },
      { look: 11, name: "Maya", stack: 2000 },
      { look: 3, name: "Sam", stack: 2000 },
    ],
  },
  ChoppedPot: {
    deck: "As Ah Kd Kc 7d 2c 9s Jh 3d",
    maxRuns: 1,
    moves: [act(0, raises(1500)), act(1, calls)],
    players: [
      { look: 17, name: "Ana", stack: 1500 },
      { look: 29, name: "Ben", stack: 1500 },
    ],
  },
  HeroCall: {
    deck: "Ah 6s Td 5s Ks 9s 4d 2c Jh",
    maxRuns: 1,
    moves: [
      act(0, raises(30)),
      act(1, calls),
      act(1, checks),
      act(0, raises(40)),
      act(1, calls),
      act(1, checks),
      act(0, raises(110)),
      act(1, calls),
      act(1, checks),
      act(0, raises(400)),
      act(1, calls),
    ],
    players: [
      { look: 61, name: "Kit", stack: 1500 },
      { look: 3, name: "Sam", stack: 1500 },
    ],
  },
  QuadsIntoBoat: {
    deck: "Kd 9s Kc 9h 9c Kh 2s 9d 4c",
    maxRuns: 1,
    moves: [
      act(0, raises(30)),
      act(1, raises(90)),
      act(0, calls),
      act(1, raises(120)),
      act(0, raises(360)),
      act(1, calls),
      act(1, checks),
      act(0, raises(500)),
      act(1, raises(1550)),
      act(0, calls),
    ],
    players: [
      { look: 11, name: "Maya", stack: 2000 },
      { look: 37, name: "Dev", stack: 2000 },
    ],
  },
  RunItTwice: {
    deck: "Ad As 2c Ah 2s 7c 9h 4d 2d 3c 8h Jd Kh Qs",
    maxRuns: 2,
    moves: [act(0, raises(1500)), act(1, calls), chooses(0, 2), chooses(1, 2)],
    players: [
      { look: 41, name: "Jonas", stack: 1500 },
      { look: 23, name: "Priya", stack: 1500 },
    ],
  },
  SevenDeuce: {
    deck: "Ah Qs 7c Kd Jh 2d Ks 7h 4d 9c 2s",
    house: "Bounty",
    maxRuns: 1,
    moves: [
      act(0, raises(30)),
      act(1, calls),
      act(2, folds),
      act(1, checks),
      act(0, raises(30)),
      act(1, calls),
      act(1, checks),
      act(0, checks),
      act(1, raises(40)),
      act(0, calls),
    ],
    players: [
      { look: 5, name: "Lou", stack: 1500 },
      { look: 3, name: "Sam", stack: 1500 },
      { look: 61, name: "Kit", stack: 1500 },
    ],
  },
} satisfies Readonly<Record<string, Scripted>>;

export type ReplayHandName = keyof typeof REPLAY_HANDS;

export const REPLAY_HAND_NAMES = Object.keys(REPLAY_HANDS);

const playedOut = (scripted: Scripted): readonly Event[] => {
  let state = initialTable(
    configOf(scripted.maxRuns, scripted.house ?? "Plain")
  );

  for (const [index, player] of scripted.players.entries()) {
    ({ state } = applied(
      state,
      Commands.SitDown({
        buyIn: chipCount(player.stack),
        player: PlayerIdSchema.make(`p${index}`),
        seat: seat(index),
      })
    ));
  }

  const opened = applied(
    state,
    Commands.StartHand({ deck: deckStartingWith(scripted.deck), straddles: [] })
  );

  const events = [...opened.events];

  ({ state } = opened);

  for (const move of scripted.moves) {
    const step = applied(state, move);

    events.push(...step.events);
    ({ state } = step);
  }

  return events;
};

const spectatorFeed = (events: readonly Event[]): readonly SeenTableEvent[] =>
  events.flatMap((event) => {
    const seen = redact(
      RoomEvents.Table({ at: millis(0), event }),
      Audiences.Spectator()
    );

    return SeenEvents.$is("Table")(seen) ? [seen.event] : [];
  });

const shownCards = (feed: readonly SeenTableEvent[]) => {
  const shown = new Map<SeatIndex, Card[]>();

  const add = (at: SeatIndex, cards: readonly Card[]) => {
    const held = shown.get(at) ?? [];

    shown.set(at, [...held, ...cards.filter((card) => !held.includes(card))]);
  };

  for (const event of feed) {
    if (Events.$is("CardsShown")(event) || Events.$is("HandTabled")(event)) {
      add(event.seat, event.cards);
    } else if (Events.$is("HandsTabled")(event)) {
      for (const hand of event.hands) {
        add(hand.seat, hand.cards);
      }
    } else if (Events.$is("ShowdownReached")(event)) {
      for (const entry of event.order) {
        if (ShowdownEntries.$is("Shown")(entry)) {
          add(entry.seat, entry.cards);
        }
      }
    }
  }

  return shown;
};

const boardsOf = (feed: readonly SeenTableEvent[]) => {
  const runs = new Map<number, Card[]>();
  const common: Card[] = [];
  let split = false;

  for (const event of feed) {
    if (Events.$is("RunsAgreed")(event)) {
      split = true;
    } else if (Events.$is("StreetDealt")(event)) {
      if (split) {
        runs.set(event.run, [...(runs.get(event.run) ?? []), ...event.cards]);
      } else {
        common.push(...event.cards);
      }
    }
  }

  return runs.size === 0
    ? [common]
    : [...runs.entries()]
        .toSorted(([one], [other]) => one - other)
        .map(([, cards]) => [...common, ...cards]);
};

const player = (at: SeatIndex) => PlayerIdSchema.make(`p${at}`);

export const replayHand = (
  name: string,
  look: {
    readonly deck: MomentHand["deck"];
    readonly theme: MomentHand["theme"];
  }
): MomentHand => {
  const scripted: Scripted =
    new Map<string, Scripted>(Object.entries(REPLAY_HANDS)).get(name) ??
    REPLAY_HANDS.QuadsIntoBoat;

  const events = playedOut(scripted);
  const feed = spectatorFeed(events);
  const shown = shownCards(feed);
  const [first] = feed;

  const started =
    first !== undefined && Events.$is("HandStarted")(first) ? first : undefined;

  const folded = new Set(
    feed.flatMap((event) => (Events.$is("Folded")(event) ? [event.seat] : []))
  );

  const dealtIn = started?.dealtIn ?? [];

  return {
    callouts: "All",
    deck: look.deck,
    lastHand: {
      awards: feed.flatMap((event) =>
        Events.$is("PotAwarded")(event)
          ? [
              {
                amount: event.amount,
                eligible: event.eligible,
                pot: event.pot,
                run: event.run,
                winners: event.winners,
              },
            ]
          : []
      ),
      boards: boardsOf(feed),
      bounty: Option.none(),
      dealtIn: dealtIn.map((at) => ({
        folded: folded.has(at),
        player: player(at),
        seat: at,
      })),
      handNumber: started?.handNumber ?? 1,
      mucked: [],
      rabbit: [],
      shown: [...shown.entries()].map(([at, cards]) => ({
        cards,
        player: player(at),
        seat: at,
      })),
      yourCards: [],
    },
    notes: (scripted.noted ?? []).map((note) =>
      note.kind === "Tanked"
        ? {
            after: feed.findLastIndex(
              (event) => Events.$is("Folded")(event) && event.seat === note.seat
            ),
            kind: "Tanked" as const,
            player: player(seat(note.seat)),
          }
        : {
            after: feed.length,
            kind: "Reacted" as const,
            player: player(seat(note.seat)),
            reaction: note.reaction,
          }
    ),
    people: scripted.players.map((each, index) => ({
      avatar: codeFor(randomAvatar(each.look)),
      name: each.name,
      player: player(seat(index)),
    })),
    record: feed,
    stacks: scripted.players.map((each, index) => ({
      seat: seat(index),
      stack: each.stack,
    })),
    theme: look.theme,
  };
};
