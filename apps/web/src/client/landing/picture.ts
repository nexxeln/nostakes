import { Effect } from "effect";

import {
  LANDING_PICTURE_TAG,
  landingPictureElement,
} from "../../features/landing/elements.js";
import type { LandingPicture } from "../../features/landing/elements.js";
import type { Theme } from "../../features/model.js";
import { adoptEarlyProperties } from "../early-properties.js";
import type { stagePicture } from "./pictures.js";

type Stager = typeof stagePicture;

const APPROACHING = "250% 0px 250% 0px";

const STYLE = `
:host { display: block; position: relative; }
.card { position: absolute; inset: 0; }
.native { position: absolute; left: 0; top: 0; width: 1080px; height: 1350px; transform-origin: 0 0; }
.native > svg { position: absolute; left: 0; top: 0; overflow: visible; }
`;

class NostakesLandingPicture extends HTMLElement {
  #picture: LandingPicture | null = null;
  #theme: Theme | null = null;
  #painted = "";
  #near = false;
  readonly #card: HTMLDivElement;
  readonly #native: HTMLDivElement;
  #stop: (() => void) | null = null;
  readonly #sized = new ResizeObserver(() => {
    this.#fit();
  });
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
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");

    style.textContent = STYLE;
    this.#card = document.createElement("div");
    this.#card.className = "card";
    this.#native = document.createElement("div");
    this.#native.className = "native";
    this.#card.append(this.#native);
    root.append(style, this.#card);
    adoptEarlyProperties(this, landingPictureElement.properties);
  }

  get picture() {
    return this.#picture;
  }

  set picture(value: LandingPicture | null) {
    this.#picture = value;
    this.#paint();
  }

  get theme() {
    return this.#theme;
  }

  set theme(value: Theme | null) {
    this.#theme = value;
    this.#paint();
  }

  connectedCallback() {
    this.#sized.observe(this);
    this.#watch.observe(this);
  }

  disconnectedCallback() {
    this.#sized.disconnect();
    this.#watch.disconnect();
    this.#stop?.();
    this.#stop = null;
    this.#painted = "";
    this.#near = false;
  }

  #fit() {
    this.#native.style.transform = `scale(${this.clientWidth / 1080})`;
  }

  #paint() {
    const picture = this.#picture;
    const theme = this.#theme;
    const wanted = `${picture}:${theme}`;

    if (
      !this.#near ||
      picture === null ||
      theme === null ||
      wanted === this.#painted
    ) {
      return;
    }

    this.#painted = wanted;
    this.#fit();
    Effect.runFork(
      Effect.promise(() => import("./pictures.js")).pipe(
        Effect.flatMap(({ stagePicture: stager }) =>
          Effect.sync(() => {
            this.#stage(stager, wanted, picture, theme);
          })
        )
      )
    );
  }

  #stage(
    stagePicture: Stager,
    wanted: string,
    picture: LandingPicture,
    theme: Theme
  ) {
    if (this.#painted === wanted) {
      this.#stop?.();
      this.#stop = stagePicture({
        card: this.#card,
        host: this,
        native: this.#native,
        picture,
        theme,
      });
    }
  }
}

export const defineLandingPicture = () => {
  if (customElements.get(LANDING_PICTURE_TAG) === undefined) {
    customElements.define(LANDING_PICTURE_TAG, NostakesLandingPicture);
  }
};
