import type { Avatar, Expression, Headwear } from "./avatar.js";
import {
  blush,
  BROWS_BY_EXPRESSION,
  EYES_BY_EXPRESSION,
  brows,
  JAWS,
  MOUTHS_BY_EXPRESSION,
  mouthCorner,
  tearUnder,
  tellingSmile,
} from "./face.js";
import type { Face, Lips } from "./face.js";
import { TATTOO_ART } from "./marks.js";
import { CARD_RED, GOLD, PAPER, SKINS, TEAR, WATERS } from "./palette.js";
import type { Water } from "./palette.js";
import { BOLD_BELOW_PX, moved, num, outlined } from "./pen.js";
import type { Pen, Point } from "./pen.js";
import { BUILDS } from "./species.js";
import type { Build } from "./species.js";
import {
  bandaid,
  COVERAGE,
  EYEWEAR_ART,
  HAT_TOP,
  HEADWEAR_ART,
  heldInMouth,
  hoop,
  MOUTH_PROPS,
  NECKWEAR_ART,
  OPAQUE_WEAR,
  spadeAt,
  tuckedAce,
  worn,
} from "./wardrobe.js";
import type { Frame } from "./wardrobe.js";

export interface RenderOptions {
  readonly expression: Expression;
  readonly size: number;
}

const EYE_GROWTH = 1.18;

const MOUTH_GROWTH = 1.15;

const FEATURE_SHIFT: Readonly<Record<Expression, Point>> = {
  Folded: { x: 2.4, y: 0.6 },
  Gutted: { x: 0, y: 0.6 },
  Happy: { x: 0, y: -0.8 },
  LookingDown: { x: 0, y: 1.8 },
  Resting: { x: 0, y: 0 },
  Thinking: { x: 0.8, y: -0.4 },
};

const water = (tint: Water, pen: Pen) =>
  `<rect width="100" height="100" fill="${tint.base}"/><circle cx="22" cy="18" r="36" fill="${tint.glow}" fill-opacity="0.45"/>${pen.small ? "" : `<circle cx="86" cy="30" r="2.6" fill="${PAPER}" fill-opacity="0.18" stroke="${PAPER}" stroke-opacity="0.45" stroke-width="0.9"/><circle cx="90" cy="20" r="1.7" fill="${PAPER}" fill-opacity="0.18" stroke="${PAPER}" stroke-opacity="0.45" stroke-width="0.8"/>`}`;

const cardBack = (pen: Pen, x: number, turn: number) =>
  `<g transform="rotate(${num(turn)} ${num(x + 7)} 92)"><rect x="${num(x)}" y="77" width="14" height="19.5" rx="2.2" fill="${CARD_RED}" ${outlined(pen, 1.9)}/><rect x="${num(x + 2)}" y="79" width="10" height="15.5" rx="1.2" fill="none" stroke="${PAPER}" stroke-width="${pen.width(1)}"/>${spadeAt({ x: x + 7, y: 86.6 }, 6, PAPER)}</g>`;

const heldCards = (pen: Pen) =>
  `${cardBack(pen, 35.5, -12)}${cardBack(pen, 50.5, 10)}<ellipse cx="40.6" cy="95.6" rx="6" ry="4.6" fill="${pen.skin.base}" ${outlined(pen, 2.1)}/><ellipse cx="59.4" cy="95.6" rx="6" ry="4.6" fill="${pen.skin.base}" ${outlined(pen, 2.1)}/>`;

const bubbles = (pen: Pen, from: Point) =>
  [
    { r: 1.9, x: from.x + 6, y: from.y - 6 },
    { r: 2.8, x: from.x + 12, y: from.y - 15 },
    { r: 3.8, x: from.x + 15, y: from.y - 27 },
  ]
    .map(
      (bubble) =>
        `<circle cx="${num(Math.min(bubble.x, 92))}" cy="${num(bubble.y)}" r="${num(bubble.r)}" fill="${PAPER}" fill-opacity="0.55" ${outlined(pen, 1.5)}/><circle cx="${num(Math.min(bubble.x, 92) - bubble.r * 0.35)}" cy="${num(bubble.y - bubble.r * 0.35)}" r="${num(bubble.r * 0.3)}" fill="${PAPER}"/>`
    )
    .join("");

const sparkle = (pen: Pen, centre: Point, radius: number) =>
  `<path d="M${num(centre.x)} ${num(centre.y - radius)}Q${num(centre.x + radius * 0.18)} ${num(centre.y - radius * 0.18)} ${num(centre.x + radius)} ${num(centre.y)}Q${num(centre.x + radius * 0.18)} ${num(centre.y + radius * 0.18)} ${num(centre.x)} ${num(centre.y + radius)}Q${num(centre.x - radius * 0.18)} ${num(centre.y + radius * 0.18)} ${num(centre.x - radius)} ${num(centre.y)}Q${num(centre.x - radius * 0.18)} ${num(centre.y - radius * 0.18)} ${num(centre.x)} ${num(centre.y - radius)}Z" fill="${GOLD}" ${outlined(pen, 1.4)}/>`;

const sweat = (pen: Pen, build: Build) => {
  const x = 100 - build.eye.x + 10 * build.eyeScale;
  const y = build.eye.y - 17 * build.eyeScale;

  return `<path d="M${num(x)} ${num(y)}C${num(x - 2.4)} ${num(y + 3.4)} ${num(x - 2.6)} ${num(y + 6)} ${num(x)} ${num(y + 6)}C${num(x + 2.6)} ${num(y + 6)} ${num(x + 2.4)} ${num(y + 3.4)} ${num(x)} ${num(y)}Z" fill="${TEAR}" ${outlined(pen, 1.3)}/>`;
};

const COVERS_TOP: ReadonlySet<Headwear> = new Set([
  "Cowboy",
  "Fedora",
  "Crown",
  "Bandana",
  "Cap",
  "Captain",
]);

const crownShift = (build: Build) => {
  const match = /^translate\(0 (?<lift>-?[\d.]+)\)/u.exec(build.crown);

  return Number(match?.groups?.lift ?? "0");
};

const topperFor = (
  pen: Pen,
  build: Build,
  avatar: Avatar,
  expression: Expression
) => {
  const top = HAT_TOP[avatar.headwear];

  if (top === undefined || !COVERS_TOP.has(avatar.headwear)) {
    return { behind: build.topper(pen, expression), front: "" };
  }

  if (build.toppedThroughHat) {
    return {
      behind: "",
      front: avatar.species === "Whale" ? "" : build.topper(pen, expression),
    };
  }

  const hatTop = top + crownShift(build);
  const base = avatar.species === "Hammerhead" ? 39 : 31;

  return {
    behind: "",
    front: `<g transform="translate(50 ${num(hatTop + 3)}) scale(0.62) translate(-52 ${num(-base)})">${build.topper(pen, expression)}</g>`,
  };
};

const props = (pen: Pen, build: Build, expression: Expression, lips: Lips) => {
  if (expression === "LookingDown") {
    return heldCards(pen);
  }

  if (expression === "Thinking") {
    return bubbles(pen, mouthCorner(lips, expression).at);
  }

  if (expression === "Happy") {
    return (
      sparkle(pen, { x: 15, y: 26 }, 5.4) + sparkle(pen, { x: 86, y: 18 }, 3.8)
    );
  }

  if (expression === "Gutted") {
    return sweat(pen, build);
  }

  return "";
};

interface Sitting {
  readonly avatar: Avatar;
  readonly expression: Expression;
  readonly pen: Pen;
  readonly build: Build;
  readonly eyeScale: number;
  readonly lips: Lips;
}

const telling = ({ build, expression }: Sitting) =>
  build.tell && expression === "LookingDown";

const eyesLayer = ({ avatar, build, expression, eyeScale, pen }: Sitting) => {
  const face: Face = {
    eye: build.eye,
    pen,
    scale: eyeScale,
    style: avatar.eyes,
  };

  const frame: Frame = {
    eye: build.eye,
    pen,
    scale: eyeScale,
    side: build.side,
  };

  const wear = OPAQUE_WEAR[expression];
  const opaque = COVERAGE[avatar.eyewear] === "Opaque";

  const eyesHidden =
    opaque && expression !== "LookingDown" && expression !== "Folded";

  const browsHidden = opaque && expression === "Folded";

  const tear = {
    x: 100 - build.eye.x,
    y: build.eye.y + (opaque ? 2.6 * eyeScale : 0),
  };

  return [
    browsHidden
      ? ""
      : brows(face, BROWS_BY_EXPRESSION[expression], eyesHidden ? 10.6 : 0),
    eyesHidden ? "" : EYES_BY_EXPRESSION[expression](face),
    opaque
      ? worn(frame, wear, EYEWEAR_ART[avatar.eyewear](frame, wear.glint))
      : EYEWEAR_ART[avatar.eyewear](frame, "Line"),
    expression === "Gutted" ? tearUnder(pen, tear, eyeScale) : "",
  ].join("");
};

const mouthLayer = (sitting: Sitting) => {
  const { avatar, build, expression, eyeScale, lips, pen } = sitting;

  return [
    telling(sitting)
      ? tellingSmile(lips)
      : MOUTHS_BY_EXPRESSION[expression](lips),
    JAWS[build.jaw](lips, expression),
    avatar.extra === "Bandaid" ? bandaid(pen, build.eye, eyeScale) : "",
  ].join("");
};

const hatLayer = ({ avatar, build, pen }: Sitting) => {
  const headwear = HEADWEAR_ART[avatar.headwear];

  const placement =
    avatar.headwear === "Headphones" && build.headphones !== ""
      ? build.headphones
      : build.crown;

  if (headwear === undefined) {
    return "";
  }

  return placement === ""
    ? headwear(pen)
    : `<g transform="${placement}">${headwear(pen)}</g>`;
};

const skinLayer = (sitting: Sitting) => {
  const { avatar, build, eyeScale, pen } = sitting;

  return [
    avatar.extra === "Ace" ? tuckedAce(pen, build.side) : "",
    TATTOO_ART[avatar.tattoo]({
      cheek: build.cheek,
      eye: build.eye,
      neck: build.neck,
      pen,
      scale: eyeScale,
    }),
    sitting.expression === "Happy" || telling(sitting)
      ? blush(build.cheek, 0.55)
      : "",
  ].join("");
};

const heldLayer = ({ avatar, build, expression, lips, pen }: Sitting) => {
  const corner = mouthCorner(lips, expression);

  return [
    avatar.extra === "Hoop" ? hoop(pen, build.side) : "",
    MOUTH_PROPS.has(avatar.extra)
      ? moved(
          FEATURE_SHIFT[expression],
          heldInMouth(pen, avatar.extra, corner.at, corner.turn)
        )
      : "",
  ].join("");
};

export const render = (
  avatar: Avatar,
  { expression, size }: RenderOptions
): string => {
  const small = size < BOLD_BELOW_PX;

  const pen: Pen = {
    skin: SKINS[avatar.body],
    small,
    width: (base) => num(small ? base * 1.3 : base),
  };

  const build = BUILDS[avatar.species];
  const shift = FEATURE_SHIFT[expression];

  const lips: Lips = {
    at: build.mouth,
    jaw: build.jaw,
    pen,
    scale: build.mouthScale * MOUTH_GROWTH,
    style: avatar.mouth,
  };

  const sitting: Sitting = {
    avatar,
    build,
    expression,
    eyeScale: build.eyeScale * EYE_GROWTH,
    lips,
    pen,
  };

  const topper = topperFor(pen, build, avatar, expression);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${num(size)}" height="${num(size)}">`,
    water(WATERS[avatar.backdrop], pen),
    topper.behind,
    build.back(pen, expression),
    build.body(pen),
    skinLayer(sitting),
    moved(shift, mouthLayer(sitting)),
    NECKWEAR_ART[avatar.neck](pen, build.neck),
    hatLayer(sitting),
    moved(shift, eyesLayer(sitting)),
    topper.front,
    heldLayer(sitting),
    props(pen, build, expression, lips),
    `</svg>`,
  ].join("");
};
