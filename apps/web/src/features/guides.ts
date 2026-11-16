export interface Guide {
  readonly path: string;
  readonly name: string;
  readonly headline: string;
  readonly description: string;
}

export const GUIDES: readonly Guide[] = [
  {
    description:
      "Every poker hand from royal flush to high card, with pictures, how kickers break ties, and the mix-ups that start arguments at the table.",
    headline: "Poker hand rankings, best to worst",
    name: "Hand rankings",
    path: "/hand-rankings",
  },
  {
    description:
      "How the 7-2 game works: win a pot with seven-deuce and everyone pays you a bounty. The variations groups use, and how nostakes plays it.",
    headline: "The seven-deuce game: the 7-2 bounty rule",
    name: "The seven-deuce game",
    path: "/rules/seven-deuce",
  },
  {
    description:
      "A bomb pot is a hand where everyone antes, the flop comes at once, and betting starts on the flop. Variations, and how nostakes runs one.",
    headline: "What is a bomb pot in poker?",
    name: "Bomb pots",
    path: "/rules/bomb-pot",
  },
  {
    description:
      "Running it twice deals the rest of the board twice when players are all in, and each run wins half the pot. Same expected value, less swing.",
    headline: "Running it twice in poker: what it does to the odds",
    name: "Running it twice",
    path: "/rules/run-it-twice",
  },
  {
    description:
      "A straddle is an optional blind of twice the big blind, posted before the deal by the player left of the big blind. What it changes and how nostakes runs it.",
    headline: "What is a straddle in poker?",
    name: "The straddle",
    path: "/rules/straddle",
  },
  {
    description:
      "Host a home poker game: how to pick blinds and buy-ins, how long a night runs, the house rules to agree on first, and how to settle up at the end.",
    headline: "How to host a poker night: blinds, buy-ins and house rules",
    name: "Hosting a poker night",
    path: "/host-a-poker-night",
  },
];

export const guidePage = (guide: Guide) => `${guide.path.slice(1)}.html`;
