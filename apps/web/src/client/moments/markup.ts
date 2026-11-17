import type { MomentPicture } from "../../features/moments/picture.js";
import { pictureSvg } from "../../features/moments/picture.js";
import type { PictureLook } from "../../features/pictures/paper.js";

export const paintPicture = (
  card: HTMLElement,
  picture: MomentPicture,
  look: PictureLook
) => {
  const wrap = document.createElement("div");

  wrap.className = "wrap";
  wrap.innerHTML = pictureSvg(picture, look);
  card.replaceChildren(wrap);
};

const PLAY_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="3" fill="currentColor"/><path d="M6.5 5.2v5.6L11 8z" fill="var(--color-raised, #fffdf8)"/></svg>';

export const paintClipIt = (button: HTMLElement, taken: boolean) => {
  if (taken) {
    button.textContent = "In Tonight";

    return;
  }

  const label = document.createElement("span");

  label.textContent = "Clip it";
  button.innerHTML = PLAY_ICON;
  button.append(label);
};
