import type { Reaction } from "@nostakes/room";

import type { Pt } from "./layout.js";

export interface Landing {
  readonly reaction: Reaction;
  readonly glyph: string;
  readonly face: HTMLElement | null;
  readonly fx: HTMLElement;
  readonly at: Pt;
  readonly size: number;
  readonly reduced: boolean;
}

export interface Hit {
  readonly settleMs: number;
  readonly land: (landing: Landing) => void;
}

const BUMP_MS = 280;

export const bump: Hit = {
  land: ({ face, reduced }) => {
    if (face === null || reduced) {
      return;
    }

    face.animate(
      [
        { transform: "translate(0, 0) scale(1, 1)" },
        { offset: 0.25, transform: "translate(0, 4%) scale(1.1, 0.88)" },
        { offset: 0.6, transform: "translate(0, -2%) scale(0.96, 1.05)" },
        { transform: "translate(0, 0) scale(1, 1)" },
      ],
      { duration: BUMP_MS, easing: "ease-out" }
    );
  },
  settleMs: 120,
};
