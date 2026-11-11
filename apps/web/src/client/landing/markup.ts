import type { LandingPicture } from "../../features/landing/elements.js";

export type BuiltPictures = Readonly<Record<LandingPicture, string>>;

export const paintPicture = (
  into: HTMLElement,
  picture: LandingPicture,
  built: BuiltPictures
) => {
  into.innerHTML = built[picture];
};
