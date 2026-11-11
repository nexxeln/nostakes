import { gradeOf } from "./grade.js";
import type { Line } from "./grade.js";
import { bet, call, check, fold, show, showdown, street } from "./lesson.js";
import type { Beat, Choice, Hand, Lesson, Move, TabledHand } from "./lesson.js";

export const INTRO = "Intro";

export const RECAP = "Recap";

type Sketch = Partial<Beat> & Pick<Beat, "choices" | "hand" | "id">;

const play = (sketch: Sketch): Beat => ({
  cue: "",
  faces: {},
  kind: "Play",
  line: "",
  lit: [],
  moves: [],
  peeked: true,
  tabled: [],
  talk: [],
  ...sketch,
});

const tap = (label: string, to: string, moves: readonly Move[]): Choice => ({
  gesture: "Tap",
  label,
  moves,
  to,
});

const drag = (label: string, to: string, moves: readonly Move[]): Choice => ({
  gesture: "Drag",
  label,
  moves,
  to,
});

const flick = (to: string): Choice => ({
  gesture: "Flick",
  label: "Fold",
  moves: [fold("you")],
  to,
});

const onward = (label: string, to: string): Choice => ({
  gesture: "Next",
  label,
  moves: [],
  to,
});

type Ending = Omit<Sketch, "choices"> & { readonly next: string };

const outcome = ({ next, ...sketch }: Ending) =>
  play({
    choices: [onward(next === RECAP ? "Finish" : "Next hand", next)],
    kind: "Outcome",
    ...sketch,
  });

const WHOLE: Hand = {
  board: ["Kd", "8c", "3s", "5h", "2d"],
  first: "Whole.Peek",
  hole: {
    bo: ["Jh", "6c"],
    jonas: ["Qc", "4d"],
    mara: ["9s", "8s"],
    you: ["As", "Kh"],
  },
  id: "Whole",
  played: [],
  title: "A whole hand",
};

const WHOLE_BEATS: readonly Beat[] = [
  play({
    choices: [
      {
        gesture: "Peek",
        label: "Look at your cards",
        moves: [],
        to: "Whole.Call",
      },
    ],
    cue: "Hold your cards to peek",
    hand: "Whole",
    id: "Whole.Peek",
    line: "Two cards each. Only you see yours.",
    peeked: false,
    talk: [{ who: "mara", words: "Welcome. I'll go slow." }],
  }),
  play({
    choices: [tap("Call 20", "Whole.Bet", [call("you")])],
    cue: "Tap the chip to call 20",
    hand: "Whole",
    id: "Whole.Call",
    line: "Ace-king, a strong start. The blinds put 30 in the pot. Match the big blind to stay in.",
    moves: [fold("jonas")],
  }),
  play({
    choices: [drag("Bet 40", "Whole.Check", [bet("you", 40)])],
    cue: "Drag the chip up to bet 40",
    hand: "Whole",
    id: "Whole.Bet",
    line: "Three cards for everyone: the flop. You have a pair of kings. That is good, so bet it.",
    lit: ["Kh", "Kd"],
    moves: [fold("bo"), check("mara"), street("Flop"), check("mara")],
  }),
  play({
    choices: [tap("Check", "Whole.River", [check("you")])],
    cue: "Tap the chip to check",
    hand: "Whole",
    id: "Whole.Check",
    line: "One more card: the turn. Nobody has bet, so a tap is a check. It costs nothing.",
    moves: [call("mara"), street("Turn"), check("mara")],
  }),
  play({
    choices: [tap("Call 40", "Whole.Showdown", [call("you")])],
    cue: "Tap the chip to call 40",
    hand: "Whole",
    id: "Whole.River",
    line: "The last card: the river. Mara bet 40. A tap now calls it.",
    moves: [street("River"), bet("mara", 40)],
  }),
  outcome({
    faces: { mara: "Gutted", you: "Happy" },
    hand: "Whole",
    id: "Whole.Showdown",
    line: "Showdown. Best five cards win, from your two and the five on the table. Your kings beat her eights.",
    lit: ["Kh", "Kd", "As", "8c", "5h"],
    moves: [showdown("you")],
    next: "Fold.Start",
    tabled: [
      {
        five: ["Kh", "Kd", "As", "8c", "5h"],
        name: "a pair of kings",
        seat: "you",
      },
      {
        five: ["8s", "8c", "Kd", "9s", "5h"],
        name: "a pair of eights",
        seat: "mara",
      },
    ],
    talk: [{ who: "mara", words: "Kings. Fair enough." }],
  }),
];

const MOST_FOLD = "Most hands are a fold: wait for pairs and big cards.";

const FOLD: Hand = {
  board: ["As", "Kd", "9c", "6h", "3s"],
  first: "Fold.Start",
  hole: {
    bo: ["Ts", "4s"],
    jonas: ["Ah", "Qh"],
    mara: ["Jd", "5c"],
    you: ["7c", "2d"],
  },
  id: "Fold",
  played: [bet("jonas", 60)],
  title: "Most hands are a fold",
};

const FOLD_BEATS: readonly Beat[] = [
  play({
    choices: [flick("Fold.Folded"), tap("Call 60", "Fold.Flop", [call("you")])],
    cue: "Flick your cards up to fold",
    hand: "Fold",
    id: "Fold.Start",
    line: "Seven-deuce. The worst start there is, and Jonas just raised.",
    talk: [{ who: "jonas", words: "Raise." }],
  }),
  outcome({
    faces: { bo: "Gutted", jonas: "Happy" },
    hand: "Fold",
    id: "Fold.Folded",
    line: "Most hands are a fold: wait for pairs and big cards. Bo called along with ten-four and lost 140.",
    moves: [
      call("bo"),
      fold("mara"),
      street("Flop"),
      check("bo"),
      bet("jonas", 80),
      call("bo"),
      street("Turn"),
      check("bo"),
      bet("jonas", 200),
      fold("bo"),
    ],
    next: "Ranks.Flop",
    talk: [
      { who: "mara", words: "Good. That is most of poker." },
      { who: "jonas", words: "Never had to show." },
    ],
  }),
  play({
    choices: [
      flick("Fold.Paid60"),
      tap("Call 100", "Fold.Turn", [call("you")]),
    ],
    cue: "Flick your cards up to fold",
    hand: "Fold",
    id: "Fold.Flop",
    line: "You missed. Seven high, and he is betting again.",
    moves: [
      call("bo"),
      fold("mara"),
      street("Flop"),
      check("bo"),
      bet("jonas", 100),
    ],
  }),
  outcome({
    faces: { jonas: "Happy" },
    hand: "Fold",
    id: "Fold.Paid60",
    line: `That cost 60. Seven-deuce misses nearly every flop. ${MOST_FOLD}`,
    moves: [fold("bo")],
    next: "Ranks.Flop",
  }),
  play({
    choices: [flick("Fold.Paid160")],
    cue: "Flick your cards up to fold",
    hand: "Fold",
    id: "Fold.Turn",
    line: "Still seven high. Calling along is how chips disappear.",
    moves: [fold("bo"), street("Turn"), bet("jonas", 200)],
  }),
  outcome({
    faces: { jonas: "Happy" },
    hand: "Fold",
    id: "Fold.Paid160",
    line: `That cost 160, and nothing was going to change. ${MOST_FOLD}`,
    next: "Ranks.Flop",
  }),
];

const FLUSH: TabledHand = {
  five: ["Kh", "Th", "7h", "5h", "2h"],
  name: "king-high flush",
  seat: "you",
};

const STRAIGHT: TabledHand = {
  five: ["9s", "8s", "7h", "6c", "5h"],
  name: "nine-high straight",
  seat: "bo",
};

const RANKS: Hand = {
  board: ["7h", "6c", "2h", "5h", "Qs"],
  first: "Ranks.Flop",
  hole: {
    bo: ["9s", "8s"],
    jonas: ["Jd", "3c"],
    mara: ["Ac", "4d"],
    you: ["Kh", "Th"],
  },
  id: "Ranks",
  played: [
    fold("jonas"),
    call("you"),
    call("bo"),
    check("mara"),
    street("Flop"),
    bet("bo", 20),
    fold("mara"),
  ],
  title: "What beats what",
};

const FLUSH_BEATS_STRAIGHT =
  "Bo had a straight: five in a row. A flush beats a straight.";

const RANKS_TALK = [
  { who: "bo", words: "Is a straight not good?" },
  { who: "mara", words: "Not good enough." },
] as const;

const RANKS_BEATS: readonly Beat[] = [
  play({
    choices: [tap("Call 20", "Ranks.Turn", [call("you")])],
    cue: "Tap the chip to call 20",
    hand: "Ranks",
    id: "Ranks.Flop",
    line: "You called with two hearts, and two more came. One more makes a flush. Bo bet only 20: a cheap look.",
    lit: ["Kh", "Th", "7h", "2h"],
  }),
  play({
    choices: [drag("Raise to 180", "Ranks.River", [bet("you", 180)])],
    cue: "Drag the chip up to raise to 180",
    hand: "Ranks",
    id: "Ranks.Turn",
    line: "There it is. Five cards of one suit: a flush. Now make him pay to see it.",
    lit: FLUSH.five,
    moves: [street("Turn"), bet("bo", 60)],
    talk: [{ who: "bo", words: "I've got something." }],
  }),
  play({
    choices: [
      drag("Bet 200", "Ranks.Paid", [bet("you", 200)]),
      tap("Check", "Ranks.Quiet", [check("you")]),
    ],
    cue: "Drag up to bet 200, or tap to check",
    hand: "Ranks",
    id: "Ranks.River",
    line: "Bo called and now checks. You still have the flush.",
    lit: FLUSH.five,
    moves: [call("bo"), street("River"), check("bo")],
  }),
  outcome({
    faces: { bo: "Gutted", you: "Happy" },
    hand: "Ranks",
    id: "Ranks.Paid",
    line: `${FLUSH_BEATS_STRAIGHT} Betting a good hand is how it gets paid.`,
    lit: FLUSH.five,
    moves: [call("bo"), showdown("you")],
    next: "River.Decide",
    tabled: [FLUSH, STRAIGHT],
    talk: RANKS_TALK,
  }),
  outcome({
    faces: { bo: "Gutted", you: "Happy" },
    hand: "Ranks",
    id: "Ranks.Quiet",
    line: `${FLUSH_BEATS_STRAIGHT} A bet would have won more: Bo was calling.`,
    lit: FLUSH.five,
    moves: [showdown("you")],
    next: "River.Decide",
    tabled: [FLUSH, STRAIGHT],
    talk: RANKS_TALK,
  }),
];

const HIS_FLUSH: TabledHand = {
  five: ["Qh", "Jh", "Th", "8h", "5h"],
  name: "queen-high flush",
  seat: "jonas",
};

const RIVER_RULE = "He had the flush. A big bet on the river usually means it.";

const RIVER: Hand = {
  board: ["Jh", "8h", "3c", "5h", "Kd"],
  first: "River.Decide",
  hole: {
    bo: ["9d", "2c"],
    jonas: ["Qh", "Th"],
    mara: ["6s", "4c"],
    you: ["As", "Jc"],
  },
  id: "River",
  played: [
    bet("jonas", 60),
    call("you"),
    fold("bo"),
    fold("mara"),
    street("Flop"),
    check("jonas"),
    bet("you", 80),
    call("jonas"),
    street("Turn"),
    check("jonas"),
    check("you"),
    street("River"),
    bet("jonas", 860),
  ],
  title: "The big bet at the end",
};

const RIVER_BEATS: readonly Beat[] = [
  play({
    choices: [
      flick("River.Folded"),
      tap("Call 860", "River.Called", [call("you")]),
    ],
    cue: "Flick to fold, or tap to call 860",
    hand: "River",
    id: "River.Decide",
    line: "A pair of jacks for you, and three hearts on the table. Jonas pushes in everything he has: all in.",
    lit: ["Jc", "Jh"],
    talk: [{ who: "jonas", words: "All in." }],
  }),
  outcome({
    faces: { jonas: "Happy" },
    hand: "River",
    id: "River.Folded",
    line: `${RIVER_RULE} One pair is rarely enough to call one.`,
    lit: HIS_FLUSH.five,
    moves: [show("jonas")],
    next: "Yours.Start",
    tabled: [HIS_FLUSH],
    talk: [{ who: "mara", words: "Sometimes he is bluffing. Not often." }],
  }),
  outcome({
    faces: { jonas: "Happy", you: "Gutted" },
    hand: "River",
    id: "River.Called",
    line: `${RIVER_RULE} Everyone pays to learn that once. You just did it for free.`,
    lit: HIS_FLUSH.five,
    moves: [showdown("jonas")],
    next: "Yours.Start",
    tabled: [
      HIS_FLUSH,
      {
        five: ["Jc", "Jh", "As", "Kd", "8h"],
        name: "a pair of jacks",
        seat: "you",
      },
    ],
  }),
];

const QUEENS: TabledHand = {
  five: ["Qd", "Qc", "Ad", "9h", "7d"],
  name: "a pair of queens",
  seat: "you",
};

const SEVENS: TabledHand = {
  five: ["7s", "7d", "Qc", "9h", "8s"],
  name: "a pair of sevens",
  seat: "mara",
};

const YOURS: Hand = {
  board: ["Qc", "7d", "2s", "9h", "4c"],
  first: "Yours.Start",
  hole: {
    bo: ["Kc", "3d"],
    jonas: ["Jc", "5h"],
    mara: ["8s", "7s"],
    you: ["Ad", "Qd"],
  },
  id: "Yours",
  played: [fold("jonas")],
  title: "Yours",
};

interface Sizes {
  readonly flop: number;
  readonly hers: number;
  readonly letter: Line["before"];
  readonly raise: number;
  readonly river: number;
  readonly turn: number;
}

const CALLED: Sizes = {
  flop: 30,
  hers: 30,
  letter: "Called",
  raise: 90,
  river: 150,
  turn: 70,
};

const RAISED: Sizes = {
  flop: 80,
  hers: 80,
  letter: "Raised",
  raise: 240,
  river: 300,
  turn: 180,
};

const graded = (id: string, line: Line, moves: readonly Move[], won: boolean) =>
  outcome({
    faces: won ? { mara: "Gutted", you: "Happy" } : { mara: "Happy" },
    hand: "Yours",
    id,
    line: gradeOf(line).join(" "),
    lit:
      won && moves.some((move) => move.kind === "Showdown") ? QUEENS.five : [],
    moves,
    next: RECAP,
    tabled: moves.some((move) => move.kind === "Showdown")
      ? [QUEENS, SEVENS]
      : [],
  });

const lastStreet = (root: string, line: Line, sizes: Sizes, pays: boolean) => [
  play({
    choices: [
      drag(`Bet ${sizes.river}`, `${root}.Bet`, [bet("you", sizes.river)]),
      tap("Check", `${root}.Check`, [check("you")]),
    ],
    hand: "Yours",
    id: root,
    moves: [street("River"), check("mara")],
  }),
  graded(
    `${root}.Bet`,
    { ...line, river: "Bet" },
    pays ? [call("mara"), showdown("you")] : [fold("mara")],
    true
  ),
  graded(
    `${root}.Check`,
    { ...line, river: "Checked" },
    [showdown("you")],
    true
  ),
];

const afterFlopBet = (root: string, line: Line, sizes: Sizes) => [
  play({
    choices: [
      drag(`Bet ${sizes.turn}`, `${root}.Bet`, [bet("you", sizes.turn)]),
      tap("Check", `${root}.Check`, [check("you")]),
    ],
    hand: "Yours",
    id: root,
    moves: [call("mara"), street("Turn"), check("mara")],
  }),
  graded(`${root}.Bet`, { ...line, turn: "Bet" }, [fold("mara")], true),
  ...lastStreet(`${root}.Check`, { ...line, turn: "Checked" }, sizes, true),
];

const afterFlopCheck = (root: string, line: Line, sizes: Sizes) => [
  play({
    choices: [
      tap(`Call ${sizes.hers}`, `${root}.Call`, [call("you")]),
      drag(`Raise to ${sizes.raise}`, `${root}.Raise`, [
        bet("you", sizes.raise),
      ]),
      flick(`${root}.Fold`),
    ],
    hand: "Yours",
    id: root,
    moves: [street("Turn"), bet("mara", sizes.hers)],
  }),
  graded(`${root}.Fold`, { ...line, turn: "Folded" }, [], false),
  graded(`${root}.Raise`, { ...line, turn: "Raised" }, [fold("mara")], true),
  ...lastStreet(`${root}.Call`, { ...line, turn: "Called" }, sizes, false),
];

const afterTheFlop = (root: string, sizes: Sizes, moves: readonly Move[]) => {
  const line: Line = {
    before: sizes.letter,
    flop: "None",
    river: "None",
    turn: "None",
  };

  return [
    play({
      choices: [
        drag(`Bet ${sizes.flop}`, `${root}.Bet`, [bet("you", sizes.flop)]),
        tap("Check", `${root}.Check`, [check("you")]),
      ],
      hand: "Yours",
      id: root,
      moves,
    }),
    ...afterFlopBet(`${root}.Bet`, { ...line, flop: "Bet" }, sizes),
    ...afterFlopCheck(`${root}.Check`, { ...line, flop: "Checked" }, sizes),
  ];
};

const YOURS_BEATS: readonly Beat[] = [
  play({
    choices: [
      drag("Raise to 60", "Yours.Raise", [bet("you", 60)]),
      tap("Call 20", "Yours.Call", [call("you")]),
      flick("Yours.Fold"),
    ],
    hand: "Yours",
    id: "Yours.Start",
    line: "This one is yours. No hints.",
  }),
  graded(
    "Yours.Fold",
    { before: "Folded", flop: "None", river: "None", turn: "None" },
    [fold("bo")],
    false
  ),
  ...afterTheFlop("Yours.Call", CALLED, [
    fold("bo"),
    check("mara"),
    street("Flop"),
    check("mara"),
  ]),
  ...afterTheFlop("Yours.Raise", RAISED, [
    fold("bo"),
    call("mara"),
    street("Flop"),
    check("mara"),
  ]),
];

const BOOKENDS: readonly Beat[] = [
  play({
    choices: [tap("Deal me in", "Whole.Peek", [])],
    cue: "Tap the chip to start",
    hand: INTRO,
    id: INTRO,
    kind: "Intro",
    peeked: false,
  }),
  play({
    choices: [],
    hand: RECAP,
    id: RECAP,
    kind: "Recap",
    line: "You can sit at a real table now.",
  }),
];

export const LESSON: Lesson = {
  beats: new Map(
    [
      ...BOOKENDS,
      ...WHOLE_BEATS,
      ...FOLD_BEATS,
      ...RANKS_BEATS,
      ...RIVER_BEATS,
      ...YOURS_BEATS,
    ].map((each) => [each.id, each])
  ),
  end: RECAP,
  hands: [WHOLE, FOLD, RANKS, RIVER, YOURS],
  start: INTRO,
};
