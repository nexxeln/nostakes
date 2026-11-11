import { render } from "@nostakes/avatar";
import type { Avatar, RenderOptions } from "@nostakes/avatar";

export const paintFace = (
  host: HTMLElement,
  avatar: Avatar,
  options: RenderOptions
) => {
  host.innerHTML = render(avatar, options);
};
