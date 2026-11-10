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

export const showOffer = (state: ShowState): ShowOffer | null => {
  const hidden = hiddenOf(state);

  if (hidden.length === 0) {
    return null;
  }

  if (hidden.length === 1) {
    return {
      both: "",
      bothCards: NOTHING,
      hint:
        hidden.length < state.held.length
          ? "Tap your other card to show it"
          : "Tap your card to show it",
      sub: "",
      tap: (card) => (hidden.includes(card) ? hidden : NOTHING),
    };
  }

  if (state.bothOnly) {
    return {
      both: "Show both",
      bothCards: hidden,
      hint: "Tap to show both cards",
      sub: "This room shows both or none",
      tap: (card) => (hidden.includes(card) ? hidden : NOTHING),
    };
  }

  return {
    both: "Show both",
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
        sub: "Your hand wins a pot, so it has to be shown.",
      };
};
