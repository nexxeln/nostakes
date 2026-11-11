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
