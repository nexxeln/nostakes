export class NewestHand<Hand> {
  readonly #keyOf: (hand: Hand) => string;
  readonly #later: (work: () => void) => void;
  readonly #consider: (hand: Hand) => void;
  #hand: Hand | null = null;
  #waiting = "";
  #considered = "";

  constructor(
    keyOf: (hand: Hand) => string,
    later: (work: () => void) => void,
    consider: (hand: Hand) => void
  ) {
    this.#keyOf = keyOf;
    this.#later = later;
    this.#consider = consider;
  }

  get hand(): Hand | null {
    return this.#hand;
  }

  set(next: Hand | null) {
    this.#hand = next;

    if (next === null) {
      return;
    }

    const key = this.#keyOf(next);

    if (key === this.#considered || key === this.#waiting) {
      return;
    }

    this.#waiting = key;
    this.#later(() => {
      this.#due(key);
    });
  }

  #due(key: string) {
    if (this.#waiting === key) {
      this.#waiting = "";
    }

    const hand = this.#hand;

    if (
      hand === null ||
      key === this.#considered ||
      this.#keyOf(hand) !== key
    ) {
      return;
    }

    this.#considered = key;
    this.#consider(hand);
  }
}
