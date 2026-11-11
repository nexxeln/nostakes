import type { DrawnPicture } from "./picture-wire.js";

export const paintDrawn = (into: HTMLElement, drawn: DrawnPicture) => {
  into.innerHTML = drawn;
};
