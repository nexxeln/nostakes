export interface Guide {
  readonly path: string;
  readonly name: string;
}

export const GUIDES: readonly Guide[] = [
  { name: "Hand rankings", path: "/hand-rankings" },
  { name: "The seven-deuce game", path: "/rules/seven-deuce" },
  { name: "Bomb pots", path: "/rules/bomb-pot" },
  { name: "Running it twice", path: "/rules/run-it-twice" },
  { name: "The straddle", path: "/rules/straddle" },
  { name: "Hosting a poker night", path: "/host-a-poker-night" },
];

export const guidePage = (guide: Guide) => `${guide.path.slice(1)}.html`;
