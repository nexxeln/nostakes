import { Effect } from "effect";

import { LANDING_TAG } from "../../features/landing/elements.js";

const SCENE = "[data-scene]";

const HERO = '[data-scene="hero"]';

const BEAT_SHOWN_AT = 0.3;

const HERO_LEFT_AT = 0.7;

const STILL = "(prefers-reduced-motion: reduce)";

export const scrollDriven = () =>
  globalThis.CSS.supports("animation-timeline", "view()");

const whenIdle = (work: () => void) => {
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(work, { timeout: 600 });
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(work);
    });
  }
};

const mark = (entry: IntersectionObserverEntry, shown: boolean) => {
  if (entry.target instanceof HTMLElement && shown) {
    entry.target.dataset.shown = "";
  }
};

const loadPieces = () =>
  Effect.runFork(
    Effect.promise(() => import("./pieces.js")).pipe(
      Effect.flatMap(({ definePieces }) => Effect.sync(definePieces))
    )
  );

class NostakesLanding extends HTMLElement {
  #observers: readonly IntersectionObserver[] = [];

  connectedCallback() {
    whenIdle(() => {
      loadPieces();
    });

    if (scrollDriven() || globalThis.matchMedia(STILL).matches) {
      return;
    }

    this.dataset.reveal = "";
    this.#observers = [this.#watchBeats(), this.#watchHero()];
  }

  disconnectedCallback() {
    for (const observer of this.#observers) {
      observer.disconnect();
    }

    this.#observers = [];
  }

  #watchBeats() {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= BEAT_SHOWN_AT) {
            mark(entry, true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: [BEAT_SHOWN_AT] }
    );

    for (const scene of this.querySelectorAll(`${SCENE}:not(${HERO})`)) {
      observer.observe(scene);
    }

    return observer;
  }

  #watchHero() {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.boundingClientRect.top < 0) {
            mark(entry, entry.intersectionRatio < HERO_LEFT_AT);
          }
        }
      },
      { threshold: [HERO_LEFT_AT] }
    );

    for (const hero of this.querySelectorAll(HERO)) {
      observer.observe(hero);
    }

    return observer;
  }
}

export const defineLanding = () => {
  if (customElements.get(LANDING_TAG) === undefined) {
    customElements.define(LANDING_TAG, NostakesLanding);
  }
};
