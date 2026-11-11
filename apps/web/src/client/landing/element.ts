import { Effect } from "effect";

import { LANDING_TAG } from "../../features/landing/elements.js";

const whenIdle = (work: () => void) => {
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(work, { timeout: 600 });
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(work);
    });
  }
};

const loadPieces = () =>
  Effect.runFork(
    Effect.promise(() => import("./pieces.js")).pipe(
      Effect.flatMap(({ definePieces }) => Effect.sync(definePieces))
    )
  );

class NostakesLanding extends HTMLElement {
  connectedCallback() {
    whenIdle(() => {
      loadPieces();
      this.dataset.pieces = "";
    });
  }
}

export const defineLanding = () => {
  if (customElements.get(LANDING_TAG) === undefined) {
    customElements.define(LANDING_TAG, NostakesLanding);
  }
};
