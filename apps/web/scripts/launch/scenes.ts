import { codeFor, randomAvatar } from "@nostakes/avatar";

import { CAST, RING } from "../../src/features/landing/cast.js";
import type { CastName } from "../../src/features/landing/cast.js";
import { BOARD, HANDS, POT } from "../../src/features/landing/night.js";
import { bountyHappenings } from "../../src/features/table/from-room.js";
import { Happenings } from "../../src/features/table/snapshot.js";
import type {
  Happening,
  HeroLegal,
  SeatSnapshot,
  TableSnapshot,
} from "../../src/features/table/snapshot.js";

export type Cue = readonly [beat: number, snapshot: TableSnapshot];

export interface Told {
  readonly cues: readonly Cue[];
  readonly hero: number;
}

const HERO = RING.indexOf("Sam");

const BIG_BLIND = 20;

const STACKS = [1180, 1640, 860, 1010, 1340, 1420, 720, 940, 1260];

const LEARNED: TableSnapshot["learned"] = ["Peek", "Fold", "Raise", "Keys"];

const seatOf = (index: number, change: Partial<SeatSnapshot> = {}) => {
  const name: CastName = RING[index] ?? "Sam";

  const seat: SeatSnapshot = {
    avatar: codeFor(CAST[name]),
    away: false,
    bet: 0,
    cardsHeld: 2,
    name,
    note: "",
    peeking: false,
    seat: index,
    shown: [],
    stack: STACKS[index] ?? 1000,
    status: "In",
    ...change,
  };

  return seat;
};

const ring = (change: (seat: SeatSnapshot) => SeatSnapshot = (seat) => seat) =>
  RING.map((_, index) => change(seatOf(index)));

const tableOf = (change: Partial<TableSnapshot>): TableSnapshot => ({
  afterHand: { bothOnly: false, closes: null, rabbit: false, showable: [] },
  bigBlind: BIG_BLIND,
  boards: [[]],
  buttonSeat: 0,
  clock: null,
  entry: null,
  events: [],
  handId: 12,
  heroCards: [],
  heroSeat: HERO,
  hostTools: false,
  learned: LEARNED,
  legal: null,
  posts: [],
  pots: [],
  rabbit: [],
  reactions: [],
  rules: null,
  runVote: null,
  seats: ring(),
  toAct: null,
  waiting: "",
  ...change,
});

const clockOn = (seat: number | null): TableSnapshot["clock"] =>
  seat === null
    ? null
    : { key: `clock-${seat}`, remainingMs: 22_000, seat, totalMs: 30_000 };

interface Teller {
  readonly at: (
    beat: number,
    change: (now: TableSnapshot) => TableSnapshot,
    happenings?: readonly Happening[]
  ) => void;
  readonly now: () => TableSnapshot;
  readonly cues: Cue[];
}

const tellerOf = (first: TableSnapshot): Teller => {
  const cues: Cue[] = [[0, first]];
  let current = first;
  let id = 0;

  return {
    at: (beat, change, happenings = []) => {
      const next = change(current);

      current = {
        ...next,
        events: [
          ...next.events,
          ...happenings.map((happening) => {
            id += 1;

            return { happening, id };
          }),
        ],
      };
      cues.push([beat, current]);
    },
    cues,
    now: () => current,
  };
};

const withSeat = (
  snapshot: TableSnapshot,
  index: number,
  change: Partial<SeatSnapshot>
): TableSnapshot => ({
  ...snapshot,
  seats: snapshot.seats.map((seat) =>
    seat.seat === index ? { ...seat, ...change } : seat
  ),
});

const at = (name: CastName) => RING.indexOf(name);

export const DEFAULT_FELT = {
  action: "Set up the game",
  extras: "",
  headline: "1/2 · 40–200",
};

const empty = (index: number) =>
  seatOf(index, {
    avatar: "",
    cardsHeld: 0,
    name: "",
    stack: 0,
    status: "Empty",
  });

const ARRIVALS: readonly CastName[] = [
  "Priya",
  "Kit",
  "Lou",
  "Ana",
  "Ben",
  "Jonas",
  "Maya",
  "Dev",
];

const LOOKS = 3;

const LOOK_BEATS = 0.11;

export const fillTold = (felt: TableSnapshot["rules"]): Told => {
  const seated = new Set<number>([HERO]);

  const waitingRoom = (looks: ReadonlyMap<number, string>) =>
    tableOf({
      boards: [[]],
      buttonSeat: null,
      handId: 0,
      rules: felt,
      seats: RING.map((_, index) => {
        const look = looks.get(index);

        if (look !== undefined) {
          return seatOf(index, {
            avatar: look,
            cardsHeld: 0,
            stack: 200,
          });
        }

        return seated.has(index)
          ? seatOf(index, { cardsHeld: 0, stack: 200 })
          : empty(index);
      }),
    });

  const teller = tellerOf(waitingRoom(new Map()));

  for (const [order, name] of ARRIVALS.entries()) {
    const index = at(name);
    const from = 0.5 + order * 0.45;

    for (let look = 0; look < LOOKS; look += 1) {
      teller.at(from + look * LOOK_BEATS, () =>
        waitingRoom(
          new Map([[index, codeFor(randomAvatar(order * 131 + look * 17 + 5))]])
        )
      );
    }

    teller.at(from + LOOKS * LOOK_BEATS, () => {
      seated.add(index);

      return waitingRoom(new Map());
    });
  }

  return { cues: teller.cues, hero: HERO };
};

export const feltWith = (extras: readonly string[]) => ({
  ...DEFAULT_FELT,
  extras: extras.join(" · "),
});

const rulesRoom = (extras: readonly string[]) =>
  tableOf({
    buttonSeat: null,
    handId: 0,
    rules: feltWith(extras),
    seats: ring((seat) => ({ ...seat, cardsHeld: 0, stack: 200 })),
  });

export const rulesTold = (felts: readonly (readonly [number, string[]])[]) => {
  const room = rulesRoom;
  const teller = tellerOf(room([]));

  for (const [beat, extras] of felts) {
    teller.at(beat, () => room(extras));
  }

  return { cues: teller.cues, hero: HERO };
};

const FACING: HeroLegal = {
  call: 60,
  check: false,
  fold: true,
  muck: false,
  raise: { isBet: false, max: STACKS[HERO] ?? 1340, min: 100 },
  show: false,
};

export const GESTURE_RAISE_FALLBACK = 180;

export interface GestureStory {
  readonly opening: TableSnapshot;
  readonly afterRaise: (to: number) => readonly Cue[];
  readonly nextHand: readonly Cue[];
  readonly afterFold: (from: TableSnapshot) => TableSnapshot;
}

export const gestureStory = (): GestureStory => {
  const jonas = at("Jonas");
  const maya = at("Maya");
  const dev = at("Dev");

  const opening = tableOf({
    buttonSeat: at("Ben"),
    clock: clockOn(HERO),
    events: [
      { happening: Happenings.Start.make({ hand: 12 }), id: 1 },
      ...RING.map((_, seat) => ({
        happening: Happenings.Deal.make({ cards: 2, seat }),
        id: seat + 2,
      })),
    ],
    heroCards: ["Ah", "Ad"],
    legal: FACING,
    posts: [
      { posted: "SmallBlind", seat: jonas, settled: false },
      { posted: "BigBlind", seat: maya, settled: false },
    ],
    seats: ring((seat) => {
      const bet =
        new Map([
          [jonas, 10],
          [maya, 20],
          [dev, 60],
        ]).get(seat.seat) ?? 0;

      return { ...seat, bet, stack: seat.stack - bet };
    }),
    toAct: HERO,
  });

  const afterRaise = (to: number): readonly Cue[] => {
    const teller = tellerOf(opening);
    const priya = at("Priya");
    const kit = at("Kit");
    const lou = at("Lou");

    teller.at(
      0,
      (now) => ({
        ...withSeat(now, HERO, {
          bet: to,
          stack: (STACKS[HERO] ?? 0) - to,
        }),
        clock: clockOn(priya),
        legal: null,
        toAct: priya,
      }),
      [
        Happenings.Bet.make({
          added: to,
          allIn: false,
          raise: true,
          seat: HERO,
          to,
        }),
      ]
    );
    teller.at(
      0.45,
      (now) => ({
        ...withSeat(now, priya, { cardsHeld: 0, status: "Folded" }),
        clock: clockOn(kit),
        toAct: kit,
      }),
      [Happenings.Fold.make({ seat: priya })]
    );
    teller.at(
      0.8,
      (now) => ({
        ...withSeat(now, kit, { cardsHeld: 0, status: "Folded" }),
        clock: clockOn(lou),
        toAct: lou,
      }),
      [Happenings.Fold.make({ seat: kit })]
    );
    teller.at(
      1.2,
      (now) => ({
        ...withSeat(now, lou, {
          bet: to,
          stack: (STACKS[lou] ?? 0) - to,
        }),
        clock: clockOn(at("Ana")),
        toAct: at("Ana"),
      }),
      [Happenings.Call.make({ added: to, allIn: false, seat: lou })]
    );

    return teller.cues.slice(1);
  };

  const nextButton = at("Jonas");

  const nextHand = tableOf({
    buttonSeat: nextButton,
    clock: clockOn(HERO),
    events: [
      { happening: Happenings.Start.make({ hand: 13 }), id: 101 },
      ...RING.map((_, seat) => ({
        happening: Happenings.Deal.make({ cards: 2, seat }),
        id: seat + 102,
      })),
    ],
    handId: 13,
    heroCards: ["9c", "4d"],
    legal: {
      ...FACING,
      call: 20,
      raise: { isBet: false, max: STACKS[HERO] ?? 1340, min: 40 },
    },
    posts: [
      { posted: "SmallBlind", seat: maya, settled: false },
      { posted: "BigBlind", seat: dev, settled: false },
    ],
    seats: ring((seat) => {
      const bet =
        new Map([
          [maya, 10],
          [dev, 20],
        ]).get(seat.seat) ?? 0;

      return { ...seat, bet, stack: seat.stack - bet };
    }),
    toAct: HERO,
  });

  const afterFold = (from: TableSnapshot): TableSnapshot => ({
    ...withSeat(from, HERO, { cardsHeld: 0, status: "Folded" }),
    clock: clockOn(at("Priya")),
    events: [
      ...from.events,
      {
        happening: Happenings.Fold.make({ seat: HERO }),
        id: (from.events.at(-1)?.id ?? 200) + 1,
      },
    ],
    legal: null,
    toAct: at("Priya"),
  });

  return {
    afterFold,
    afterRaise,
    nextHand: [[0.01, nextHand]],
    opening,
  };
};

const TURN = BOARD.slice(0, 4);

const BAD_BEAT_TABLE = new Set(
  (["Ben", "Jonas", "Maya", "Sam", "Priya", "Ana"] as const).map((name) =>
    RING.indexOf(name)
  )
);

export const badBeatTold = (): Told => {
  const jonas = at("Jonas");
  const priya = at("Priya");

  const allIn = tableOf({
    boards: [[...TURN]],
    buttonSeat: at("Ben"),
    handId: 31,
    heroCards: ["Qc", "Jd"],
    pots: [POT],
    seats: ring((seat) => {
      if (seat.seat === jonas || seat.seat === priya) {
        return { ...seat, stack: 0, status: "AllIn" };
      }

      return { ...seat, cardsHeld: 0, status: "Folded" };
    }).filter(({ seat }) => BAD_BEAT_TABLE.has(seat)),
  });

  const teller = tellerOf(allIn);

  teller.at(
    0.15,
    (now) =>
      withSeat(withSeat(now, jonas, { shown: [...HANDS.Jonas] }), priya, {
        shown: [...HANDS.Priya],
      }),
    [
      Happenings.Show.make({ cards: [...HANDS.Jonas], label: "", seat: jonas }),
      Happenings.Show.make({ cards: [...HANDS.Priya], label: "", seat: priya }),
    ]
  );
  teller.at(1.6, (now) => ({ ...now, boards: [[...BOARD]] }));
  teller.at(
    2.6,
    (now) => ({
      ...withSeat(now, priya, { stack: POT }),
      pots: [],
    }),
    [
      Happenings.Show.make({
        cards: [...HANDS.Priya],
        label: "Three of a kind",
        seat: priya,
      }),
      Happenings.Show.make({
        cards: [...HANDS.Jonas],
        label: "Pair",
        seat: jonas,
      }),
      Happenings.Win.make({ amount: POT, seat: priya }),
    ]
  );

  const thrown = [
    { reaction: "Laugh", seat: at("Ben") },
    { reaction: "Cry", seat: jonas },
    { reaction: "Wow", seat: at("Ana") },
    { reaction: "Clap", seat: at("Maya") },
  ] as const;

  for (const [index, { reaction, seat }] of thrown.entries()) {
    teller.at(3.3 + index * 0.4, (now) => ({
      ...now,
      reactions: [...now.reactions, { id: index + 1, reaction, seat }],
    }));
  }

  return { cues: teller.cues, hero: HERO };
};

const deals = (hand: number): readonly Happening[] => [
  Happenings.Start.make({ hand }),
  ...RING.map((_, seat) => Happenings.Deal.make({ cards: 2, seat })),
];

const bountyScene = (): Told => {
  const kit = at("Kit");
  const bounty = 20;

  const before = tableOf({
    buttonSeat: at("Lou"),
    handId: 40,
    heroCards: ["Js", "Td"],
    pots: [60],
    seats: ring((seat) =>
      seat.seat === kit
        ? seat
        : { ...seat, cardsHeld: 0, status: "Folded" as const }
    ),
  });

  const teller = tellerOf(before);

  teller.at(
    0.25,
    (now) => ({
      ...now,
      pots: [],
      seats: now.seats.map((seat) =>
        seat.seat === kit
          ? {
              ...seat,
              shown: ["7h", "2c"],
              stack: seat.stack + 60 + bounty * 8,
            }
          : { ...seat, stack: seat.stack - bounty }
      ),
    }),
    [
      Happenings.Win.make({ amount: 60, seat: kit }),
      Happenings.Show.make({ cards: ["7h", "2c"], label: "Shows", seat: kit }),
      ...bountyHappenings(
        kit,
        RING.flatMap((_, seat) =>
          seat === kit ? [] : [{ amount: bounty, seat }]
        )
      ),
    ]
  );

  return { cues: teller.cues, hero: HERO };
};

const bombPotScene = (): Told => {
  const ante = 50;
  const start = tableOf({ buttonSeat: at("Dev"), handId: 50, heroCards: [] });
  const teller = tellerOf(start);

  teller.at(
    0.1,
    (now) => ({
      ...now,
      heroCards: ["8s", "8d"],
      pots: [ante * RING.length],
      seats: now.seats.map((seat) => ({ ...seat, stack: seat.stack - ante })),
    }),
    [
      ...deals(50),
      ...RING.flatMap((_, seat) => [
        Happenings.Post.make({ amount: ante, kind: "Ante", seat }),
        Happenings.Say.make({ seat, text: `Bomb pot ${ante}` }),
      ]),
    ]
  );
  teller.at(0.75, (now) => ({ ...now, boards: [["Kh", "8c", "4s"]] }), [
    Happenings.Collect.make({ street: "Flop" }),
  ]);

  return { cues: teller.cues, hero: HERO };
};

const runTwiceScene = (): Told => {
  const ana = at("Ana");
  const ben = at("Ben");
  const pot = 1600;

  const allIn = tableOf({
    boards: [["Ah", "Kd", "7s"]],
    buttonSeat: at("Lou"),
    handId: 60,
    heroCards: ["5c", "5d"],
    pots: [pot],
    seats: ring((seat) => {
      if (seat.seat === ana) {
        return { ...seat, shown: ["As", "Qs"], stack: 0, status: "AllIn" };
      }

      if (seat.seat === ben) {
        return { ...seat, shown: ["Kc", "Ks"], stack: 0, status: "AllIn" };
      }

      return { ...seat, cardsHeld: 0, status: "Folded" };
    }),
  });

  const teller = tellerOf({
    ...allIn,
    boards: [
      ["Ah", "Kd", "7s", "2c", "9h"],
      ["Ah", "Kd", "7s", "Qh", "Ad"],
    ],
  });

  teller.at(
    0.35,
    (now) => ({
      ...withSeat(withSeat(now, ana, { stack: pot / 2 }), ben, {
        stack: pot / 2,
      }),
      pots: [],
    }),
    [
      Happenings.Win.make({ amount: pot / 2, seat: ben }),
      Happenings.Win.make({ amount: pot / 2, seat: ana }),
    ]
  );

  return { cues: teller.cues, hero: HERO };
};

const straddleScene = (): Told => {
  const button = at("Dev");
  const small = at("Sam");
  const big = at("Priya");
  const straddler = at("Kit");
  const start = tableOf({ buttonSeat: button, handId: 70 });
  const teller = tellerOf(start);

  teller.at(
    0.1,
    (now) => ({
      ...now,
      heroCards: ["Qd", "Jd"],
      posts: [
        { posted: "SmallBlind", seat: small, settled: false },
        { posted: "BigBlind", seat: big, settled: false },
        { posted: "Straddle", seat: straddler, settled: false },
      ],
      seats: now.seats.map((seat) => {
        const bet =
          new Map([
            [small, 10],
            [big, 20],
            [straddler, 40],
          ]).get(seat.seat) ?? 0;

        return { ...seat, bet, stack: seat.stack - bet };
      }),
    }),
    [
      ...deals(70),
      Happenings.Post.make({ amount: 10, kind: "SmallBlind", seat: small }),
      Happenings.Post.make({ amount: 20, kind: "BigBlind", seat: big }),
      Happenings.Post.make({ amount: 40, kind: "Straddle", seat: straddler }),
    ]
  );

  return { cues: teller.cues, hero: HERO };
};

const AFTER_BOARD = ["3c", "9h", "7d", "Qs", "2h"];

const showOneScene = (): Told => {
  const after = (shown: readonly string[]) =>
    tableOf({
      afterHand: {
        bothOnly: false,
        closes: { key: "next-deal", remainingMs: 6000 },
        rabbit: false,
        showable: ["Ad", "Kh"].filter((card) => !shown.includes(card)),
      },
      boards: [AFTER_BOARD],
      buttonSeat: at("Maya"),
      handId: 80,
      heroCards: ["Ad", "Kh"],
      seats: ring((seat) =>
        seat.seat === HERO
          ? { ...seat, shown: [...shown] }
          : { ...seat, cardsHeld: 0, status: "Folded" as const }
      ),
    });

  const teller = tellerOf(after([]));

  teller.at(0.7, () => after(["Kh"]));

  return { cues: teller.cues, hero: HERO };
};

const buttonScene = (): Told => {
  const before = tableOf({ buttonSeat: at("Dev"), handId: 90 });
  const teller = tellerOf(before);
  const next = at("Sam");

  teller.at(
    0.35,
    (now) => ({
      ...now,
      buttonSeat: next,
      handId: 91,
      heroCards: ["Tc", "Th"],
    }),
    deals(91)
  );

  return { cues: teller.cues, hero: HERO };
};

const waitBigScene = (): Told => {
  const waiting = tableOf({
    buttonSeat: at("Maya"),
    clock: clockOn(at("Priya")),
    entry: {
      action: "Post 20 to come in",
      line: "Waiting for the big blind",
      note: "",
      post: true,
    },
    handId: 100,
    heroCards: [],
    seats: ring((seat) =>
      seat.seat === HERO || seat.seat === at("Lou")
        ? {
            ...seat,
            cardsHeld: 0,
            note: "Waits for BB",
            status: "Out" as const,
          }
        : seat
    ),
    toAct: at("Priya"),
  });

  return { cues: [[0, waiting]], hero: HERO };
};

const peekingScene = (): Told => {
  const maya = at("Maya");

  const room = tableOf({
    boards: [["Ah", "Kd", "7s"]],
    buttonSeat: at("Ben"),
    clock: clockOn(maya),
    handId: 110,
    heroCards: ["Js", "Jc"],
    pots: [240],
    seats: ring((seat) =>
      seat.seat === at("Dev") || seat.seat === at("Lou")
        ? { ...seat, cardsHeld: 0, status: "Folded" as const }
        : seat
    ),
    toAct: maya,
  });

  const teller = tellerOf(room);

  teller.at(0.45, (now) => withSeat(now, maya, { peeking: true }));

  return { cues: teller.cues, hero: HERO };
};

const reactionScene = (): Told => {
  const room = tableOf({
    boards: [["Ah", "Kd", "7s", "2c"]],
    buttonSeat: at("Ben"),
    handId: 120,
    heroCards: ["Js", "Jc"],
    pots: [480],
  });

  const teller = tellerOf(room);

  const thrown = [
    { reaction: "Fire", seat: at("Priya") },
    { reaction: "Laugh", seat: HERO },
    { reaction: "Clap", seat: at("Dev") },
  ] as const;

  for (const [index, { reaction, seat }] of thrown.entries()) {
    teller.at(0.15 + index * 0.4, (now) => ({
      ...now,
      reactions: [...now.reactions, { id: index + 1, reaction, seat }],
    }));
  }

  return { cues: teller.cues, hero: HERO };
};

const sweepScene = (): Told => {
  const bets = new Map([
    [at("Jonas"), 60],
    [at("Maya"), 60],
    [at("Priya"), 60],
    [HERO, 60],
  ]);

  const betting = tableOf({
    buttonSeat: at("Ben"),
    handId: 130,
    heroCards: ["Ks", "Qs"],
    pots: [],
    seats: ring((seat) => {
      const bet = bets.get(seat.seat);

      return bet === undefined
        ? { ...seat, cardsHeld: 0, status: "Folded" as const }
        : { ...seat, bet, stack: seat.stack - bet };
    }),
  });

  const teller = tellerOf(betting);

  teller.at(
    0.45,
    (now) => ({
      ...now,
      boards: [["Ts", "8h", "2s"]],
      pots: [240],
      seats: now.seats.map((seat) => ({ ...seat, bet: 0 })),
    }),
    [Happenings.Collect.make({ street: "Flop" })]
  );

  return { cues: teller.cues, hero: HERO };
};

const keepSeatScene = (): Told => {
  const lou = at("Lou");

  const room = tableOf({
    boards: [["9d", "9c", "4h"]],
    buttonSeat: at("Ben"),
    handId: 140,
    heroCards: ["Ac", "Tc"],
    pots: [180],
    seats: ring((seat) => (seat.seat === lou ? { ...seat, away: true } : seat)),
  });

  const teller = tellerOf(room);

  teller.at(0.9, (now) => withSeat(now, lou, { away: false }));

  return { cues: teller.cues, hero: HERO };
};

export const LITTLE_TOLD = {
  BombPot: bombPotScene,
  Bounty: bountyScene,
  Button: buttonScene,
  KeepSeat: keepSeatScene,
  Peeking: peekingScene,
  Reaction: reactionScene,
  RunTwice: runTwiceScene,
  ShowOne: showOneScene,
  Straddle: straddleScene,
  Sweep: sweepScene,
  WaitBig: waitBigScene,
} as const;
