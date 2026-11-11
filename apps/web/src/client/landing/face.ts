import { avatarFor, codeFor, randomAvatar } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";

import {
  LANDING_FACE_TAG,
  landingFaceElement,
} from "../../features/landing/elements.js";
import type { Theme } from "../../features/model.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { paintAvatar } from "../table/markup.js";

const FRAME_BUDGET_MS = 4;

const NEAR = "200% 0px 200% 0px";

const SMALLEST_FACE_PX = 24;

const SHUFFLE_STRIDE = 7919;

const SHUFFLE_FIRST = 31;

interface Paintable extends Element {
  paint: () => void;
}

const later = (work: (left: () => number) => void) => {
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback((deadline) => {
      work(() => deadline.timeRemaining());
    });
  } else {
    requestAnimationFrame(() => {
      const started = performance.now();

      work(() => FRAME_BUDGET_MS - (performance.now() - started));
    });
  }
};

const paintQueue = () => {
  const waiting = new Set<Paintable>();
  const watched = new Map<Element, Paintable>();
  const state = { scheduled: false };

  const work = (left: () => number) => {
    state.scheduled = false;

    for (const face of waiting) {
      if (left() < FRAME_BUDGET_MS) {
        break;
      }

      waiting.delete(face);
      face.paint();
    }

    if (waiting.size > 0) {
      state.scheduled = true;
      later(work);
    }
  };

  const draw = (face: Paintable) => {
    waiting.add(face);

    if (!state.scheduled) {
      state.scheduled = true;
      later(work);
    }
  };

  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const face = watched.get(entry.target);

        if (entry.isIntersecting && face !== undefined) {
          near.unobserve(face);
          watched.delete(face);
          draw(face);
        }
      }
    },
    { rootMargin: NEAR }
  );

  return {
    draw,
    forget: (face: Paintable) => {
      near.unobserve(face);
      watched.delete(face);
      waiting.delete(face);
    },
    watch: (face: Paintable) => {
      watched.set(face, face);
      near.observe(face);
    },
  };
};

const faces = paintQueue();

class NostakesLandingFace extends HTMLElement {
  #avatar: string | null = null;
  #expression: Expression | null = null;
  #theme: Theme | null = null;
  #shuffles = false;
  #turns = 0;
  #drawn = "";
  #near = false;
  readonly #shuffle = () => {
    if (this.#shuffles) {
      this.#turns += 1;
      this.#avatar = codeFor(
        randomAvatar(SHUFFLE_FIRST + this.#turns * SHUFFLE_STRIDE)
      );
      this.dataset.turns = String(this.#turns);
      this.paint();
    }
  };

  constructor() {
    super();
    adoptEarlyProperties(this, landingFaceElement.properties);
  }

  get avatar() {
    return this.#avatar;
  }

  set avatar(value: string | null) {
    if (this.#turns === 0) {
      this.#avatar = value;
      this.#changed();
    }
  }

  get shuffles() {
    return this.#shuffles;
  }

  set shuffles(value: boolean) {
    this.#shuffles = value;
  }

  get expression() {
    return this.#expression;
  }

  set expression(value: Expression | null) {
    this.#expression = value;
    this.#changed();
  }

  get theme() {
    return this.#theme;
  }

  set theme(value: Theme | null) {
    this.#theme = value;
    this.#changed();
  }

  connectedCallback() {
    faces.watch(this);
    this.closest("button")?.addEventListener("click", this.#shuffle);
  }

  disconnectedCallback() {
    faces.forget(this);
    this.closest("button")?.removeEventListener("click", this.#shuffle);
    this.#near = false;
  }

  paint() {
    this.#near = true;
    const wanted = this.#key();

    if (
      wanted === this.#drawn ||
      this.#avatar === null ||
      this.#expression === null ||
      this.#theme === null
    ) {
      return;
    }

    paintAvatar(this, avatarFor(this.#avatar), {
      expression: this.#expression,
      size: Math.max(SMALLEST_FACE_PX, Math.round(this.clientWidth)),
      theme: this.#theme,
    });
    this.#drawn = wanted;
    this.dataset.drawn = "";
  }

  #key() {
    return `${this.#avatar}:${this.#expression}:${this.#theme}`;
  }

  #changed() {
    if (this.#near && this.#key() !== this.#drawn) {
      faces.draw(this);
    }
  }
}

export const defineLandingFace = () => {
  if (customElements.get(LANDING_FACE_TAG) === undefined) {
    customElements.define(LANDING_FACE_TAG, NostakesLandingFace);
  }
};
