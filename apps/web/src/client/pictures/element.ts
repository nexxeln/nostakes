import type { Deck, Theme } from "../../features/model.js";
import {
  KEEP_TAG,
  keepElement,
  keepSvg,
  keepTitle,
} from "../../features/pictures/keep.js";
import type { KeepPicture, KeepTone } from "../../features/pictures/keep.js";
import { KEPT_FRAMES } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { Keeper } from "./keeper.js";

const STYLE = `
:host { display: flex; gap: var(--space-2, 8px); align-items: stretch; }
button { font: inherit; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2, 8px); border: 0; border-radius: var(--radius-3, 10px); min-height: var(--size-touch, 44px); padding: var(--space-2, 8px) var(--space-4, 16px); cursor: pointer; background: var(--color-raised, #fffdf8); color: var(--color-raised-ink, #1f1c31); box-shadow: var(--shadow-sheet-1); font-weight: var(--weight-body, 600); transition: translate var(--duration-1, 120ms) var(--ease, ease), box-shadow var(--duration-1, 120ms) var(--ease, ease); }
button:active { translate: var(--press-1, 1px 1.8px); box-shadow: var(--shadow-sheet-0); }
.keep { flex: 1; background: var(--color-accent, #ef5326); color: var(--color-on-accent, #fffaf3); font-size: 1.0625rem; box-shadow: var(--shadow-sheet-2); }
.keep:active { translate: var(--press-2, 1.5px 2.6px); }
:host([data-tone="Quiet"]) .keep { background: var(--color-raised, #fffdf8); color: var(--color-raised-ink, #1f1c31); font-size: inherit; box-shadow: var(--shadow-sheet-1); }
.story { color: var(--color-ink-muted, #716a79); }
button:focus-visible { outline: 2px solid var(--color-accent, #ef5326); outline-offset: 2px; }
`;

class NostakesKeep extends HTMLElement {
  readonly #keep: HTMLButtonElement;
  #picture: KeepPicture | null = null;
  #theme: Theme = "Light";
  #deck: Deck = "TwoColour";
  #label = "Share as a picture";
  #tone: KeepTone = "Primary";
  #keeper: Keeper | null = null;
  #drawnFor = "";

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");

    style.textContent = STYLE;
    this.#keep = this.#button("keep", "Chat");
    this.#keep.textContent = this.#label;

    const story = this.#button("story", "Story");

    story.textContent = "Story";
    story.title = "A tall picture for a story";
    root.append(style, this.#keep, story);
    adoptEarlyProperties(this, keepElement.properties);
  }

  disconnectedCallback() {
    this.#keeper?.drop();
    this.#keeper = null;
    this.#drawnFor = "";
  }

  connectedCallback() {
    this.#redraw();
  }

  get picture(): KeepPicture | null {
    return this.#picture;
  }

  set picture(next: KeepPicture | null) {
    this.#picture = next;
    this.#redraw();
  }

  get theme(): Theme {
    return this.#theme;
  }

  set theme(next: Theme) {
    this.#theme = next;
    this.#redraw();
  }

  get deck(): Deck {
    return this.#deck;
  }

  set deck(next: Deck) {
    this.#deck = next;
    this.#redraw();
  }

  get tone(): KeepTone {
    return this.#tone;
  }

  set tone(next: KeepTone) {
    this.#tone = next;
    this.dataset.tone = next;
  }

  get label(): string {
    return this.#label;
  }

  set label(next: string) {
    this.#label = next;
    this.#keep.textContent = next;
  }

  #button(name: string, frame: KeptFrame) {
    const button = document.createElement("button");

    button.className = name;
    button.type = "button";
    button.addEventListener("click", () => {
      this.dataset.keeping = frame;
      this.#keeper?.keep(frame);
    });

    return button;
  }

  #redraw() {
    const picture = this.#picture;

    if (picture === null || !this.isConnected) {
      return;
    }

    const theme = this.#theme;
    const deck = this.#deck;
    const key = JSON.stringify([picture, theme, deck]);

    if (key === this.#drawnFor) {
      return;
    }

    this.#drawnFor = key;
    this.#keeper?.drop();
    delete this.dataset.drawn;
    this.#keeper = new Keeper(
      {
        svg: (frame, fonts) => keepSvg(picture, { deck, fonts, frame, theme }),
        title: keepTitle(picture),
      },
      (frames) => {
        this.dataset.drawn = frames.join(" ");
      }
    );
    this.#keeper.prepare(KEPT_FRAMES);
  }
}

export const defineKeep = () => {
  if (customElements.get(KEEP_TAG) === undefined) {
    customElements.define(KEEP_TAG, NostakesKeep);
  }
};
