export interface ShowState {
  readonly bothOnly: boolean;
  readonly held: readonly string[];
  readonly shown: readonly string[];
}

export interface ShowOffer {
  readonly both: string;
  readonly bothCards: readonly string[];
  readonly hint: string;
  readonly sub: string;
  readonly tap: (card: string) => readonly string[];
}

const NOTHING: readonly string[] = [];

export const hiddenOf = ({ held, shown }: ShowState) =>
  held.filter((card) => !shown.includes(card));

const HOLDEM_CARDS = 2;

export const everyWord = (cards: number) =>
  cards === HOLDEM_CARDS ? "both" : "all";

const lastCardHint = ({ held }: ShowState, hidden: number) => {
  if (hidden === held.length) {
    return "Tap your card to show it";
  }

  return held.length > HOLDEM_CARDS
    ? "Tap your last card to show it"
    : "Tap your other card to show it";
};

export const showOffer = (state: ShowState): ShowOffer | null => {
  const hidden = hiddenOf(state);

  if (hidden.length === 0) {
    return null;
  }

  if (hidden.length === 1) {
    return {
      both: "",
      bothCards: NOTHING,
      hint: lastCardHint(state, hidden.length),
      sub: "",
      tap: (card) => (hidden.includes(card) ? hidden : NOTHING),
    };
  }

  const every = everyWord(hidden.length);

  if (state.bothOnly) {
    return {
      both: `Show ${every}`,
      bothCards: hidden,
      hint:
        every === "both" ? "Tap to show both cards" : "Tap to show your cards",
      sub: `This room shows ${everyWord(state.held.length)} or none`,
      tap: (card) => (hidden.includes(card) ? hidden : NOTHING),
    };
  }

  return {
    both: `Show ${every}`,
    bothCards: hidden,
    hint: "Tap a card to show it",
    sub: "",
    tap: (card) => (hidden.includes(card) ? [card] : NOTHING),
  };
};

export const afterShowing = (
  state: ShowState,
  cards: readonly string[]
): ShowState => ({
  ...state,
  shown: [
    ...state.shown,
    ...cards.filter((card) => !state.shown.includes(card)),
  ],
});

export interface ShowdownChoice {
  readonly muck: boolean;
  readonly show: boolean;
}

export interface ShowdownWords {
  readonly hint: string;
  readonly sub: string;
}

export const showdownWords = (choice: ShowdownChoice): ShowdownWords | null => {
  if (!choice.show) {
    return null;
  }

  return choice.muck
    ? { hint: "Tap your cards to show them", sub: "or flick them up to muck" }
    : {
        hint: "Tap your cards to show them",
        sub: "A winning hand must be shown.",
      };
};
