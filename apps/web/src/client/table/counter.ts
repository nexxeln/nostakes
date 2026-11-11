import { clamp } from "./layout.js";

const DURATION = 450;

export const formatChips = (amount: number) =>
  Math.trunc(amount).toLocaleString("en-US");

const easeOut = (progress: number) => 1 - (1 - progress) ** 3;

export class Counter {
  #from = 0;
  #to = 0;
  #start = 0;
  #settled = false;
  readonly #node: HTMLElement;

  constructor(node: HTMLElement) {
    this.#node = node;
  }

  get target() {
    return this.#to;
  }

  set(value: number, now: number, animate = true) {
    if (value === this.#to) {
      return;
    }

    this.#from = animate ? this.#at(now) : value;
    this.#to = value;
    this.#start = now;
    this.#settled = false;

    if (!animate) {
      this.#node.textContent = formatChips(value);
    }
  }

  #at(now: number) {
    const progress = clamp((now - this.#start) / DURATION, 0, 1);

    return this.#from + (this.#to - this.#from) * easeOut(progress);
  }

  tick(now: number) {
    if (this.#settled) {
      return;
    }

    const done = now - this.#start > DURATION;
    const text = formatChips(done ? this.#to : this.#at(now));

    if (this.#node.textContent !== text) {
      this.#node.textContent = text;
    }

    this.#settled = done;
  }
}
