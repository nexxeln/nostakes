import { Effect } from "effect";

import {
  LANDING_PICTURE_TAG,
  landingPictureElement,
} from "../../features/landing/elements.js";
import type { LandingPicture } from "../../features/landing/elements.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { paintPicture } from "./markup.js";

const APPROACHING = "150% 0px 150% 0px";

const whenIdle = (work: () => void) => {
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(work, { timeout: 800 });
  } else {
    requestAnimationFrame(work);
  }
};

class NostakesLandingPicture extends HTMLElement {
  #picture: LandingPicture | null = null;
  #painted: LandingPicture | null = null;
  #near = false;
  readonly #watch = new IntersectionObserver(
    (entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        this.#watch.disconnect();
        this.#near = true;
        this.#paint();
      }
    },
    { rootMargin: APPROACHING }
  );

  constructor() {
    super();
    adoptEarlyProperties(this, landingPictureElement.properties);
  }

  get picture() {
    return this.#picture;
  }

  set picture(value: LandingPicture | null) {
    this.#picture = value;
    this.#paint();
  }

  connectedCallback() {
    this.#watch.observe(this);
  }

  disconnectedCallback() {
    this.#watch.disconnect();
    this.#near = false;
    this.#painted = null;
  }

  #paint() {
    const wanted = this.#picture;

    if (!this.#near || wanted === null || wanted === this.#painted) {
      return;
    }

    this.#painted = wanted;
    Effect.runFork(
      Effect.promise(() => import("virtual:nostakes-landing-pictures")).pipe(
        Effect.flatMap(({ PICTURES }) =>
          Effect.sync(() => {
            whenIdle(() => {
              if (this.#painted === wanted && this.isConnected) {
                paintPicture(this, wanted, PICTURES);
                this.dataset.drawn = "";
              }
            });
          })
        )
      )
    );
  }
}

export const defineLandingPicture = () => {
  if (customElements.get(LANDING_PICTURE_TAG) === undefined) {
    customElements.define(LANDING_PICTURE_TAG, NostakesLandingPicture);
  }
};
