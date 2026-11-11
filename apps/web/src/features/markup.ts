import { render } from "@nostakes/avatar";
import type { Avatar, RenderOptions } from "@nostakes/avatar";
import type { HtmlBuilder } from "foldkit/html";

import { CARD_HEIGHT, cardFaceMarks } from "./card-art.js";
import type { CardFace } from "./card-art.js";

const ICONS = {
  Chevron: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l6 6-6 6"/></svg>`,
  Close: `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`,
  Counts: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 16V11M8.5 16V6M13 16V9M17.5 16V4"/></svg>`,
  Link: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"/></svg>`,
  Moon: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/></svg>`,
  SoundOff: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 8l4 4M17 8l-4 4"/></svg>`,
  SoundOn: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 7.5c1 .8 1 4.2 0 5M15.5 5.5c2 2 2 7 0 9"/></svg>`,
  Suits: `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="6" cy="6" r="3" class="pip-spade"/><circle cx="14" cy="6" r="3" class="pip-heart"/><circle cx="6" cy="14" r="3" class="pip-diamond"/><circle cx="14" cy="14" r="3" class="pip-club"/></svg>`,
  Sun: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

export const iconMarkup = <Message>(h: HtmlBuilder<Message>, name: IconName) =>
  h.InnerHTML(ICONS[name]);

export const faceMarkup = <Message>(
  h: HtmlBuilder<Message>,
  avatar: Avatar,
  options: RenderOptions
) => h.InnerHTML(render(avatar, options));

export const cardMarkup = <Message>(h: HtmlBuilder<Message>, card: CardFace) =>
  h.InnerHTML(
    `<svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true">${cardFaceMarks(card)}</svg>`
  );
