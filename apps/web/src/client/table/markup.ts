import { render } from "@nostakes/avatar";
import type { Avatar, RenderOptions } from "@nostakes/avatar";

import {
  CARD_HEIGHT,
  cardFaceMarks,
  cardFaceOf,
} from "../../features/card-art.js";

export const paintAvatar = (
  pic: HTMLElement,
  avatar: Avatar,
  options: RenderOptions
) => {
  pic.innerHTML = render(avatar, options);
};

export const paintCardFace = (face: HTMLElement, card: string) => {
  const drawn = cardFaceOf(card);

  if (drawn !== undefined) {
    face.className = `face suit-${drawn.suit}`;
    face.innerHTML = `<svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true">${cardFaceMarks(drawn)}</svg>`;
  }
};
