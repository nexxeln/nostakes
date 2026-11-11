import { codeFor, parseAvatar } from "@nostakes/avatar";
import type { Avatar, Theme } from "@nostakes/avatar";
import { Option } from "effect";

import { Keeper } from "../../../src/client/pictures/keeper.js";
import { pictureSvg } from "../../../src/features/moments/picture.js";
import type { MomentPicture } from "../../../src/features/moments/picture.js";
import {
  partPose,
  samplesOf,
  transformOf,
} from "../../../src/features/moments/timeline.js";
import type { Staging } from "../../../src/features/moments/timeline.js";
import { FRIENDS } from "./cast.js";
import type { SeatId } from "./cast.js";
import type { Ending } from "./hands.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const STAGING: Staging = { landed: new Set(["felt"]), spread: 1.6 };

const REVEAL_MS = 2600;

const MARGIN = 8;

export const codeOf = (avatar: Avatar) => codeFor(avatar);

export const avatarOf = (code: string): Avatar | undefined =>
  Option.getOrUndefined(parseAvatar(code));

const nameAt = (who: SeatId) => (who === "you" ? "You" : FRIENDS[who].name);

const pictureOf = (ending: Ending, mine: Avatar): MomentPicture => {
  const avatarAt = (who: SeatId) =>
    who === "you" ? mine : FRIENDS[who].avatar;

  return {
    also: ending.also,
    boards: ending.board.length > 0 ? [ending.board] : [],
    faces: ending.faces.map((face) => ({
      avatar: codeFor(avatarAt(face.who)),
      cards: face.cards,
      expression: face.expression,
      name: nameAt(face.who),
      won: face.won,
    })),
    kind: ending.kind,
    lifted: ending.lifted,
    line: ending.line,
    painful: ending.painful,
    pot: ending.pot,
    tier: ending.tier,
    title: ending.title,
  };
};

const layerOf = (part: SVGGraphicsElement) => {
  const box = part.getBBox();
  const layer = document.createElementNS(SVG_NS, "svg");
  const width = box.width + MARGIN * 2;
  const height = box.height + MARGIN * 2;

  layer.setAttribute(
    "viewBox",
    `${box.x - MARGIN} ${box.y - MARGIN} ${width} ${height}`
  );
  layer.setAttribute("width", String(width));
  layer.setAttribute("height", String(height));
  layer.style.left = `${box.x - MARGIN}px`;
  layer.style.top = `${box.y - MARGIN}px`;
  layer.dataset.part = part.dataset.part ?? "";
  layer.dataset.index = part.dataset.index ?? "0";

  return { layer, part };
};

export const drawMoment = (
  native: HTMLElement,
  ending: Ending,
  look: {
    readonly mine: Avatar;
    readonly still: boolean;
    readonly theme: Theme;
  }
) => {
  const picture = pictureOf(ending, look.mine);

  native.innerHTML = pictureSvg(picture, {
    deck: "TwoColour",
    fonts: "",
    frame: "Table",
    theme: look.theme,
  });

  const cut = [...native.querySelectorAll<SVGGraphicsElement>(".part")].map(
    layerOf
  );

  for (const { layer, part } of cut) {
    part.removeAttribute("class");
    layer.append(part);
  }

  native.replaceChildren(...cut.map(({ layer }) => layer));

  const layers = cut.map(({ layer }) => layer);
  const length = REVEAL_MS * STAGING.spread;

  const posed = (layer: SVGSVGElement, ms: number) =>
    partPose(
      layer.dataset.part ?? "",
      Number(layer.dataset.index ?? "0"),
      ms,
      ending.family,
      ending.tier,
      STAGING
    );

  const motions = look.still
    ? []
    : layers.map((layer) => {
        const motion = layer.animate(
          samplesOf(length).map((ms) => {
            const pose = posed(layer, ms);

            return {
              offset: ms / length,
              opacity: pose.opacity,
              transform: transformOf(pose),
            };
          }),
          { duration: length, fill: "both" }
        );

        motion.pause();
        motion.addEventListener("finish", () => {
          motion.cancel();
        });

        return motion;
      });

  const play = () => {
    for (const motion of motions) {
      motion.play();
    }
  };

  const keeper = new Keeper(
    {
      svg: (frame, fonts) =>
        pictureSvg(picture, {
          deck: "TwoColour",
          fonts,
          frame,
          theme: look.theme,
        }),
      title: ending.title,
    },
    (frames) => {
      native.dataset.drawn = frames.join(" ");
    }
  );

  return { keeper, play };
};

export type DrawnMoment = ReturnType<typeof drawMoment>;
