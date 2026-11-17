import type { MomentPicture } from "../../features/moments/picture.js";
import { pictureSvg } from "../../features/moments/picture.js";
import type { PictureLook } from "../../features/pictures/paper.js";

export const paintThumb = (
  host: HTMLElement,
  picture: MomentPicture,
  look: PictureLook
) => {
  host.innerHTML = pictureSvg(picture, look);
};

export const paintSvg = (host: HTMLElement, svg: () => string) => {
  host.innerHTML = svg();
};

const SHARE_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l4 4h-3v7H9v-7H6z" fill="currentColor"/><path d="M4 11v5.5h12V11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const PLAY_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="3.5" fill="currentColor"/><path d="M8 7v6l5-3z" fill="var(--color-raised, #fffdf8)"/></svg>';

const ICONS = { Play: PLAY_ICON, Share: SHARE_ICON } as const;

export const paintLabel = (
  button: HTMLElement,
  icon: keyof typeof ICONS | null,
  text: string
) => {
  const label = document.createElement("span");

  label.textContent = text;

  if (icon === null) {
    button.replaceChildren(label);

    return;
  }

  button.innerHTML = ICONS[icon];
  button.append(label);
};
