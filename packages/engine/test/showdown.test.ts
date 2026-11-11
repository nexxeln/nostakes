import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Commands,
  Events,
  NoShowdownChoiceOwed,
  PendingDecisions,
  ShowdownEntries,
  TableStates,
  WinningHandMustTable,
  evaluate,
  legalActions,
  pendingDecisions,
} from "../src/index.js";
import type {
  Action,
  Event,
  LegalActions,
  TableConfig,
  TableState,
} from "../src/index.js";
import {
  actAs,
  baseConfig,
  calls,
  cards,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  handOf,
  occupiedTable,
  play,
  raisesTo,
  rejection,
  run,
  seat,
  shownCards,
  stacksOf,
  startHand,
} from "./fixtures.js";

const shown = (index: number, hole: string, board: string) =>
  ShowdownEntries.Shown({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${board}`)),
    seat: seat(index),
  });

const mucked = (index: number) => ShowdownEntries.Mucked({ seat: seat(index) });

describe("showdown order", () => {
  it("makes a seat that cannot beat the short all-in still show for the side pot it can win, and lets a worse seat muck", () => {
    const board = "2h 7d 9c Jh 3d";

    const river = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 30, 2: 1000, 3: 1000 }),
        deckStartingWith(`As Ks Qs 4c Ac Kc Qc 5c ${board}`)
      ).state,
      [
        [3, calls],
        [0, folds],
        [1, raisesTo(30)],
        [2, calls],
        [3, calls],
        [2, raisesTo(100)],
        [3, calls],
        [2, checks],
        [3, checks],
        [2, checks],
        [3, checks],
      ]
    );

    expect(river.events.slice(-4)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(1, "As Ac", board), shown(2, "Ks Kc", board), mucked(3)],
        run: 1,
      }),
      Events.PotAwarded({
        amount: chipCount(90),
        eligible: [seat(1), seat(2), seat(3)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(90), seat: seat(1) }],
      }),
      Events.PotAwarded({
        amount: chipCount(200),
        eligible: [seat(2), seat(3)],
        pot: 2,
        run: 1,
        winners: [{ amount: chipCount(200), seat: seat(2) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(river.state).slice(0, 4)).toStrictEqual([
      1000, 90, 1070, 870,
    ]);
  });
});

const interactive: TableConfig = { ...baseConfig, showdown: "Interactive" };

type Role = "X" | "Y" | "Z";

interface Seating {
  readonly bettor: Option.Option<Role>;
  readonly seats: Readonly<Record<Role, number>>;
}

type Order = "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX";

const SEATINGS: Readonly<Record<Order, Seating>> = {
  XYZ: { bettor: Option.none(), seats: { X: 1, Y: 2, Z: 0 } },
  XZY: { bettor: Option.none(), seats: { X: 1, Y: 0, Z: 2 } },
  YXZ: { bettor: Option.some("Y"), seats: { X: 2, Y: 1, Z: 0 } },
  YZX: { bettor: Option.some("Y"), seats: { X: 0, Y: 1, Z: 2 } },
  ZXY: { bettor: Option.some("Z"), seats: { X: 2, Y: 0, Z: 1 } },
  ZYX: { bettor: Option.some("Z"), seats: { X: 0, Y: 2, Z: 1 } },
};

const HOLES: Readonly<Record<Role, string>> = {
  X: "As Ac",
  Y: "Ks Kc",
  Z: "Qs Qc",
};

const SIDE_POT_BOARD = "2h 7d 9c Jh 3s";

const ROLES: readonly Role[] = ["X", "Y", "Z"];

const roleAt = (seating: Seating, index: number): Role =>
  ROLES.find((role) => seating.seats[role] === index) ?? "X";

const sidePotDeck = (seating: Seating) => {
  const dealOrder = [1, 2, 0].map((index) => HOLES[roleAt(seating, index)]);
  const first = dealOrder.map((hole) => hole.split(" ")[0]).join(" ");
  const second = dealOrder.map((hole) => hole.split(" ")[1]).join(" ");

  return deckStartingWith(`${first} ${second} ${SIDE_POT_BOARD}`);
};

const sidePotAction = (
  state: TableState,
  seating: Seating,
  legal: LegalActions
): Action => {
  const { street } = handOf(state);
  const role = roleAt(seating, legal.seat);
  const opens = legal.canCheck && Option.isSome(legal.raise);

  if (street === "Preflop") {
    return role !== "X" &&
      Option.exists(legal.raise, (range) => range.minTo <= 30)
      ? raisesTo(30)
      : calls;
  }

  if (street === "Flop" || street === "River") {
    const bets =
      street === "Flop" ||
      Option.exists(seating.bettor, (bettor) => bettor === role);

    if (opens) {
      return bets ? raisesTo(50) : checks;
    }

    return legal.canCheck ? checks : calls;
  }

  return legal.canCheck ? checks : calls;
};

const toSidePotShowdown = (seating: Seating) => {
  let { state } = startHand(
    occupiedTable(interactive, {
      [seating.seats.X]: 30,
      [seating.seats.Y]: 1000,
      [seating.seats.Z]: 1000,
    }),
    sidePotDeck(seating)
  );

  for (let guard = 0; guard < 40; guard += 1) {
    const legal = legalActions(state);

    if (Option.isNone(legal)) {
      break;
    }

    ({ state } = run(
      state,
      actAs(legal.value.seat, sidePotAction(state, seating, legal.value))
    ));
  }

  return state;
};

interface SidePotRow {
  readonly order: Order;
  readonly moves: string;
  readonly main: Role;
  readonly side: Role;
  readonly seen: string;
}

const SIDE_POT_TABLE: readonly SidePotRow[] = [
  { main: "X", moves: "X:T Y:T Z:T", order: "XYZ", seen: "XYZ", side: "Y" },
  { main: "X", moves: "X:T Y:T Z:M", order: "XYZ", seen: "XY", side: "Y" },
  { main: "X", moves: "X:T Y:M Z:T", order: "XYZ", seen: "XZ", side: "Z" },
  { main: "X", moves: "X:T Y:M Z:M", order: "XYZ", seen: "X", side: "Z" },
  { main: "Y", moves: "X:M Y:T Z:T", order: "XYZ", seen: "YZ", side: "Y" },
  { main: "Y", moves: "X:M Y:T Z:M", order: "XYZ", seen: "Y", side: "Y" },
  { main: "Z", moves: "X:M Y:M", order: "XYZ", seen: "", side: "Z" },
  { main: "X", moves: "X:T Z:T Y:T!", order: "XZY", seen: "XZY", side: "Y" },
  { main: "X", moves: "X:T Z:M Y:T", order: "XZY", seen: "XY", side: "Y" },
  { main: "X", moves: "X:T Z:M Y:M", order: "XZY", seen: "X", side: "Y" },
  { main: "Y", moves: "X:M Z:T Y:T!", order: "XZY", seen: "ZY", side: "Y" },
  { main: "Y", moves: "X:M Z:M", order: "XZY", seen: "", side: "Y" },
  { main: "X", moves: "Y:T X:T! Z:T", order: "YXZ", seen: "YXZ", side: "Y" },
  { main: "X", moves: "Y:T X:T! Z:M", order: "YXZ", seen: "YX", side: "Y" },
  { main: "X", moves: "Y:M X:T Z:T", order: "YXZ", seen: "XZ", side: "Z" },
  { main: "X", moves: "Y:M X:T Z:M", order: "YXZ", seen: "X", side: "Z" },
  { main: "Z", moves: "Y:M X:M", order: "YXZ", seen: "", side: "Z" },
  { main: "X", moves: "Y:T Z:T X:T!", order: "YZX", seen: "YZX", side: "Y" },
  { main: "X", moves: "Y:T Z:M X:T!", order: "YZX", seen: "YX", side: "Y" },
  { main: "X", moves: "Y:M Z:T X:T!", order: "YZX", seen: "ZX", side: "Z" },
  { main: "X", moves: "Y:M Z:M", order: "YZX", seen: "", side: "Z" },
  { main: "X", moves: "Z:T X:T! Y:T!", order: "ZXY", seen: "ZXY", side: "Y" },
  { main: "X", moves: "Z:M X:T Y:T", order: "ZXY", seen: "XY", side: "Y" },
  { main: "X", moves: "Z:M X:T Y:M", order: "ZXY", seen: "X", side: "Y" },
  { main: "Y", moves: "Z:M X:M", order: "ZXY", seen: "", side: "Y" },
  { main: "X", moves: "Z:T Y:T! X:T!", order: "ZYX", seen: "ZYX", side: "Y" },
  { main: "X", moves: "Z:M Y:T X:T!", order: "ZYX", seen: "YX", side: "Y" },
  { main: "X", moves: "Z:M Y:M", order: "ZYX", seen: "", side: "Y" },
];

const askedChoices = (state: TableState) => {
  const pending = pendingDecisions(state);

  return PendingDecisions.$is("Show")(pending) ? pending.choices : undefined;
};

describe("rule 5: X is all in short with the best hand and plays only the main pot, Y (second best) and Z (worst) also contest a side pot", () => {
  it.each(SIDE_POT_TABLE)(
    "order $order, choices $moves: the main pot goes to $main, the side pot to $side, and only $seen are seen",
    ({ main, moves, order, seen, side }) => {
      const seating = SEATINGS[order];
      let state = toSidePotShowdown(seating);
      const events: Event[] = [];
      const sideAmount = Option.isSome(seating.bettor) ? 200 : 100;

      for (const move of moves.split(" ")) {
        const role = ROLES.find((candidate) => move.startsWith(candidate));
        const at = seat(seating.seats[role ?? "X"]);
        const forced = move.endsWith("!");

        expect(askedChoices(state)).toStrictEqual({
          canMuck: !forced,
          canTable: true,
          seat: at,
        });

        if (forced) {
          expect(rejection(state, Commands.MuckHand({ seat: at }))?._tag).toBe(
            "WinningHandMustTable"
          );
        }

        const step = run(
          state,
          move.includes(":T")
            ? Commands.TableHand({ seat: at })
            : Commands.MuckHand({ seat: at })
        );

        events.push(...step.events);
        ({ state } = step);
      }

      expect(TableStates.$is("BetweenHands")(state)).toBe(true);
      expect(
        events.flatMap((event) =>
          Events.$is("PotAwarded")(event)
            ? [[event.pot, event.amount, event.winners]]
            : []
        )
      ).toStrictEqual([
        [1, 90, [{ amount: 90, seat: seat(seating.seats[main]) }]],
        [
          2,
          sideAmount,
          [{ amount: sideAmount, seat: seat(seating.seats[side]) }],
        ],
      ]);
      expect(
        events
          .flatMap((event) =>
            Events.$is("HandTabled")(event) ? [roleAt(seating, event.seat)] : []
          )
          .join("")
      ).toBe(seen);
      expect(
        ROLES.filter((role) =>
          Option.exists(
            TableStates.$is("BetweenHands")(state)
              ? state.lastHand
              : Option.none(),
            (lastHand) =>
              lastHand.players.some(
                (dealt) =>
                  dealt.seat === seating.seats[role] &&
                  dealt.publicCards.length > 0
              )
          )
        ).join("")
      ).toBe(seen.split("").toSorted().join(""));
    }
  );
});

const showdownTurnOf = (state: TableState) => {
  const pending = pendingDecisions(state);

  return PendingDecisions.$is("Show")(pending) ? pending : undefined;
};

const headsUpCheckedDown = (config: TableConfig, deck: string) =>
  play(
    startHand(occupiedTable(config, { 0: 100, 1: 100 }), deckStartingWith(deck))
      .state,
    [
      [0, calls],
      [1, checks],
      [1, checks],
      [0, checks],
      [1, checks],
      [0, checks],
      [1, checks],
      [0, checks],
    ]
  );

describe("interactive showdown", () => {
  it("lets the first seat concede by mucking, gives the pot to the last claimant without showing its cards, and lets it show them after the hand", () => {
    const river = headsUpCheckedDown(interactive, "As 2c Ks 3d 7h 8h 9d Js 4c");

    expect(river.events.at(-1)).toStrictEqual(
      Events.ShowdownStarted({ order: [seat(1), seat(0)] })
    );
    expect(showdownTurnOf(river.state)).toStrictEqual(
      PendingDecisions.Show({
        beatenInEveryPot: false,
        choices: { canMuck: true, canTable: true, seat: seat(1) },
      })
    );
    expect(
      rejection(river.state, Commands.TableHand({ seat: seat(0) }))
    ).toStrictEqual(new NoShowdownChoiceOwed({ seat: seat(0) }));

    const conceded = run(river.state, Commands.MuckHand({ seat: seat(1) }));

    expect(conceded.events).toStrictEqual([
      Events.HandMucked({ seat: seat(1) }),
      Events.PotAwarded({
        amount: chipCount(20),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(20), seat: seat(0) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(conceded.state).slice(0, 2)).toStrictEqual([110, 90]);
    expect(
      run(
        conceded.state,
        Commands.ShowCards({ cards: shownCards("2c 3d"), seat: seat(0) })
      ).events
    ).toStrictEqual([
      Events.CardsShown({ cards: cards("2c 3d"), seat: seat(0) }),
    ]);
  });

  it("makes a seat that ties the tabled hand table its own (rule 25: cards speak), and splits the pot", () => {
    const board = "As Ks Qs Js Ts";
    const river = headsUpCheckedDown(interactive, `2c 3c 4d 5d ${board}`);
    const tabled = run(river.state, Commands.TableHand({ seat: seat(1) }));

    expect(showdownTurnOf(tabled.state)?.choices).toStrictEqual({
      canMuck: false,
      canTable: true,
      seat: seat(0),
    });
    expect(
      rejection(tabled.state, Commands.MuckHand({ seat: seat(0) }))
    ).toStrictEqual(new WinningHandMustTable({ pot: 1, seat: seat(0) }));
    expect(
      run(tabled.state, Commands.TableHand({ seat: seat(0) })).events
    ).toStrictEqual([
      Events.HandTabled({
        cards: cards("3c 5d"),
        rank: evaluate(cards(`3c 5d ${board}`)),
        seat: seat(0),
      }),
      Events.PotAwarded({
        amount: chipCount(20),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [
          { amount: chipCount(10), seat: seat(1) },
          { amount: chipCount(10), seat: seat(0) },
        ],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
  });

  it("counts a seat beaten in every pot only when a tabled hand beats it in each pot it claims, so a seat that owns the side pot after a muck is not beaten everywhere", () => {
    const tabled = run(
      toSidePotShowdown(SEATINGS.XYZ),
      Commands.TableHand({ seat: seat(1) })
    ).state;

    expect(showdownTurnOf(tabled)?.beatenInEveryPot).toBe(false);
    expect(
      showdownTurnOf(run(tabled, Commands.TableHand({ seat: seat(2) })).state)
        ?.beatenInEveryPot
    ).toBe(true);
    expect(
      showdownTurnOf(run(tabled, Commands.MuckHand({ seat: seat(2) })).state)
    ).toStrictEqual(
      PendingDecisions.Show({
        beatenInEveryPot: false,
        choices: { canMuck: true, canTable: true, seat: seat(0) },
      })
    );
  });

  it("asks a seat that alone is eligible for a side pot, after the other deep seat folded the river without facing a bet, only about the main pot, and it is not beaten in every pot", () => {
    const board = SIDE_POT_BOARD;

    const river = play(
      startHand(
        occupiedTable(interactive, { 0: 1000, 1: 30, 2: 1000 }),
        deckStartingWith(`As Qs Ks Ac Qc Kc ${board}`)
      ).state,
      [
        [0, raisesTo(30)],
        [1, calls],
        [2, calls],
        [2, raisesTo(50)],
        [0, calls],
        [2, checks],
        [0, checks],
        [2, folds],
      ]
    );

    expect(river.events.at(-1)).toStrictEqual(
      Events.ShowdownStarted({ order: [seat(1), seat(0)] })
    );

    const tabled = run(river.state, Commands.TableHand({ seat: seat(1) }));

    expect(showdownTurnOf(tabled.state)).toStrictEqual(
      PendingDecisions.Show({
        beatenInEveryPot: false,
        choices: { canMuck: true, canTable: true, seat: seat(0) },
      })
    );
    expect(
      run(tabled.state, Commands.MuckHand({ seat: seat(0) })).events
    ).toStrictEqual([
      Events.HandMucked({ seat: seat(0) }),
      Events.PotAwarded({
        amount: chipCount(90),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(90), seat: seat(1) }],
      }),
      Events.PotAwarded({
        amount: chipCount(100),
        eligible: [seat(0)],
        pot: 2,
        run: 1,
        winners: [{ amount: chipCount(100), seat: seat(0) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
  });

  it("lets the only seat eligible for a side pot, built with a seat that folded on the river, muck the main pot and keep the side pot without showing", () => {
    const river = play(
      startHand(
        occupiedTable(interactive, { 0: 30, 1: 1000, 2: 1000 }),
        deckStartingWith(`Ks Qs As Kc Qc Ac ${SIDE_POT_BOARD}`)
      ).state,
      [
        [0, calls],
        [1, raisesTo(30)],
        [2, calls],
        [0, calls],
        [1, raisesTo(50)],
        [2, calls],
        [1, checks],
        [2, checks],
        [1, raisesTo(100)],
        [2, folds],
      ]
    );

    expect(showdownTurnOf(river.state)?.choices).toStrictEqual({
      canMuck: true,
      canTable: true,
      seat: seat(1),
    });

    const afterMuck = run(river.state, Commands.MuckHand({ seat: seat(1) }));

    expect(afterMuck.events).toStrictEqual([
      Events.HandMucked({ seat: seat(1) }),
      Events.PotAwarded({
        amount: chipCount(90),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(90), seat: seat(0) }],
      }),
      Events.PotAwarded({
        amount: chipCount(100),
        eligible: [seat(1)],
        pot: 2,
        run: 1,
        winners: [{ amount: chipCount(100), seat: seat(1) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(afterMuck.state).slice(0, 3)).toStrictEqual([
      90, 1020, 920,
    ]);
  });
});
