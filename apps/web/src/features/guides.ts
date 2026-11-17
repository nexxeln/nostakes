export interface Guide {
  readonly path: string;
  readonly name: string;
  readonly headline: string;
  readonly description: string;
}

export const GUIDES: readonly Guide[] = [
  {
    description:
      "Every poker hand from royal flush to high card, with pictures, kickers, and the mix-ups that start arguments.",
    headline: "Poker hand rankings, best to worst",
    name: "Hand rankings",
    path: "/hand-rankings",
  },
  {
    description:
      "Win a pot with seven-deuce and everyone pays you a bounty. How the 7-2 game works, and how nostakes plays it.",
    headline: "The seven-deuce game: the 7-2 bounty rule",
    name: "The seven-deuce game",
    path: "/rules/seven-deuce",
  },
  {
    description:
      "Everyone antes, the flop comes out, and the betting starts there. How a bomb pot works, and how nostakes runs one.",
    headline: "What is a bomb pot in poker?",
    name: "Bomb pots",
    path: "/rules/bomb-pot",
  },
  {
    description:
      "When players are all in, deal the rest of the board twice and split the pot. Same odds, less swing.",
    headline: "Running it twice in poker: what it does to the odds",
    name: "Running it twice",
    path: "/rules/run-it-twice",
  },
  {
    description:
      "An optional blind of twice the big blind, posted by the player left of the big blind. What it changes, and how nostakes runs it.",
    headline: "What is a straddle in poker?",
    name: "The straddle",
    path: "/rules/straddle",
  },
  {
    description:
      "Blinds, buy-ins, house rules, and settling up: what you need to host a home poker game.",
    headline: "How to host a poker night: blinds, buy-ins and house rules",
    name: "Hosting a poker night",
    path: "/host-a-poker-night",
  },
];

export const guidePage = (guide: Guide) => `${guide.path.slice(1)}.html`;
