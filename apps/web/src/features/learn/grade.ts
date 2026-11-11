export interface Line {
  readonly before: "Called" | "Folded" | "Raised";
  readonly flop: "Bet" | "Checked" | "None";
  readonly river: "Bet" | "Checked" | "None";
  readonly turn: "Bet" | "Called" | "Checked" | "Folded" | "None" | "Raised";
}

type Rule = readonly [(line: Line) => boolean, string];

const WELL: readonly Rule[] = [
  [
    (line) =>
      line.before === "Raised" && line.flop === "Bet" && line.turn === "Bet",
    "You bet when you had it, every time.",
  ],
  [
    (line) => line.before === "Raised",
    "You raised a strong start instead of just calling.",
  ],
  [(line) => line.flop === "Bet", "You bet your pair of queens on the flop."],
  [
    (line) => line.turn === "Raised",
    "Mara bet into you and you raised with the best hand.",
  ],
  [
    (line) => line.turn === "Called",
    "You did not let one small bet push you off a good pair.",
  ],
];

const REGULAR: readonly Rule[] = [
  [
    (line) => line.before === "Folded",
    "A regular plays ace-queen. Two big cards are worth a raise.",
  ],
  [
    (line) => line.turn === "Folded",
    "A regular does not fold top pair to one small bet. You had the best hand.",
  ],
  [
    (line) => line.flop === "Checked",
    "A regular bets a pair of queens on the flop. Checking gave Mara a free card.",
  ],
  [
    (line) => line.before === "Called",
    "A regular raises ace-queen before the flop instead of calling.",
  ],
  [
    (line) => line.turn === "Checked",
    "A regular keeps betting on the turn. Good hands win more when they bet.",
  ],
];

const firstOf = (rules: readonly Rule[], line: Line, otherwise: string) =>
  rules.find(([applies]) => applies(line))?.[1] ?? otherwise;

export const gradeOf = (line: Line): readonly [string, string] => [
  firstOf(WELL, line, "You stayed out of trouble."),
  firstOf(REGULAR, line, "A regular would have played it the same way."),
];
