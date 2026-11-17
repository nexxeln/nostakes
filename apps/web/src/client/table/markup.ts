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

const VOICE_ARCS = `<svg viewBox="0 0 24 40" aria-hidden="true"><g class="arcs-after" fill="none" stroke-linecap="round" stroke-width="3.2"><path class="arc-shadow" d="M5.6 13.6a8 8 0 0 1 0 15.2M11.6 7.6a16 16 0 0 1 0 27.2"/><path class="arc-ink" d="M4.4 12.4a8 8 0 0 1 0 15.2M10.4 6.4a16 16 0 0 1 0 27.2"/></g><g class="arcs-before" fill="none" stroke-linecap="round" stroke-width="3.2" transform="translate(24 0) scale(-1 1)"><path class="arc-shadow" d="M3.2 13.6a8 8 0 0 1 0 15.2M9.2 7.6a16 16 0 0 1 0 27.2"/><path class="arc-ink" d="M4.4 12.4a8 8 0 0 1 0 15.2M10.4 6.4a16 16 0 0 1 0 27.2"/></g></svg>`;

export const paintVoiceArcs = (holder: HTMLElement) => {
  holder.innerHTML = VOICE_ARCS;
};

export const paintCardFace = (face: HTMLElement, card: string) => {
  const drawn = cardFaceOf(card);

  if (drawn !== undefined) {
    face.className = `face suit-${drawn.suit}`;
    face.innerHTML = `<svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true">${cardFaceMarks(drawn)}</svg>`;
  }
};
