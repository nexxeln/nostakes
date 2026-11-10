import type {
  Accessory,
  Avatar,
  Cheeks,
  Expression,
  Eyes,
  Marking,
  Mouth,
  Species,
} from "./avatar.js";
import {
  BACKDROP_COLOURS,
  BLUSH,
  COATS,
  FRECKLE,
  GOLD,
  INK,
  MOUTH_INSIDE,
  NOSE_PINK,
  PAPER,
  TEAR,
  TINTS,
  TONGUE,
} from "./palette.js";
import type { Coat, Tint } from "./palette.js";

export interface RenderOptions {
  readonly expression: Expression;
  readonly size: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type Nose = "Pink" | "Dark" | "Nostrils";

interface Build {
  readonly back: (pen: Pen) => string;
  readonly head: string;
  readonly front: (pen: Pen) => string;
  readonly left: Point;
  readonly cheekY: number;
  readonly nose: Nose;
  readonly hat: string;
}

interface Pen {
  readonly coat: Coat;
  readonly tint: Tint;
  readonly width: (base: number) => string;
}

const BOLD_BELOW_PX = 64;

const num = (value: number) => String(Number(value.toFixed(2)));

const mirror = (body: string) =>
  `<g transform="matrix(-1 0 0 1 100 0)">${body}</g>`;

const pair = (body: string) => body + mirror(body);

const outlined = (pen: Pen, width: number) =>
  `stroke="${INK}" stroke-width="${pen.width(width)}" stroke-linejoin="round"`;

const line = (pen: Pen, colour: string, width: number) =>
  `fill="none" stroke="${colour}" stroke-width="${pen.width(width)}" stroke-linecap="round" stroke-linejoin="round"`;

const ROUND_HEAD =
  "M50 33C70.5 33 81.5 45 81.5 60C81.5 75.5 68.5 85.5 50 85.5C31.5 85.5 18.5 75.5 18.5 60C18.5 45 29.5 33 50 33Z";

const TUFTED_HEAD =
  "M50 33C70 33 80.5 44 81.5 57L86.5 65.5L79.5 67.5C74.5 79 63.5 85.5 50 85.5C36.5 85.5 25.5 79 20.5 67.5L13.5 65.5L18.5 57C19.5 44 30 33 50 33Z";

const FACE_EYE: Point = { x: 38.5, y: 58 };

const nothing = () => "";

const BUILDS: Readonly<Record<Species, Build>> = {
  Bear: {
    back: (pen) =>
      pair(
        `<circle cx="27.5" cy="37" r="10.5" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><circle cx="28.6" cy="38.2" r="5.6" fill="${pen.coat.inner}"/>`
      ),
    cheekY: 67.5,
    front: nothing,
    hat: "",
    head: ROUND_HEAD,
    left: FACE_EYE,
    nose: "Dark",
  },
  Bunny: {
    back: (pen) =>
      pair(
        `<g transform="rotate(-10 39.5 24.5)"><ellipse cx="39.5" cy="24.5" rx="7.6" ry="17.5" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><ellipse cx="39.8" cy="26.5" rx="3.6" ry="12" fill="${pen.coat.inner}"/></g>`
      ),
    cheekY: 67.5,
    front: nothing,
    hat: "",
    head: ROUND_HEAD,
    left: FACE_EYE,
    nose: "Pink",
  },
  Cat: {
    back: (pen) =>
      pair(
        `<path d="M21.5 50C20 38 21 26 25 19.5C26.5 17.5 28.5 17.5 30.5 19C36 23.5 41 28.5 45 34Z" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><path d="M26.2 42.5C25.8 35.5 26.6 30 28.4 25.6C32.2 28.4 35.6 31.6 38.6 35.2Z" fill="${pen.coat.inner}"/>`
      ),
    cheekY: 67.5,
    front: nothing,
    hat: "",
    head: ROUND_HEAD,
    left: FACE_EYE,
    nose: "Pink",
  },
  Dog: {
    back: nothing,
    cheekY: 67.5,
    front: (pen) =>
      pair(
        `<path d="M27.5 37.5C17 35 10 45.5 11.2 58.5C12 67.5 18.6 71 22.8 65.4C27 59.6 29.6 49 31.6 41.2Z" fill="${pen.coat.shade}" ${outlined(pen, 2.4)}/>`
      ),
    hat: "",
    head: ROUND_HEAD,
    left: FACE_EYE,
    nose: "Dark",
  },
  Fox: {
    back: (pen) =>
      pair(
        `<path d="M19.5 54C18 40 18.5 27 22 18C23 15.5 25.5 15 27.5 16.5C35 22 41.5 28 46 34Z" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><path d="M24.6 45C24.2 37 24.8 30 26.6 24.2C31.4 28 35.4 31.8 38.8 35.8Z" fill="${pen.coat.light}"/>`
      ),
    cheekY: 67.5,
    front: nothing,
    hat: "",
    head: TUFTED_HEAD,
    left: FACE_EYE,
    nose: "Dark",
  },
  Frog: {
    back: nothing,
    cheekY: 64,
    front: (pen) =>
      pair(
        `<circle cx="34" cy="39" r="11.5" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/>`
      ),
    hat: ' transform="translate(50 31) scale(0.6) translate(-50 -33)"',
    head: ROUND_HEAD,
    left: { x: 34, y: 39 },
    nose: "Nostrils",
  },
  Mouse: {
    back: (pen) =>
      pair(
        `<circle cx="23.5" cy="36.5" r="14.5" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><circle cx="25" cy="38" r="9.2" fill="${pen.coat.inner}"/>`
      ),
    cheekY: 67.5,
    front: nothing,
    hat: "",
    head: ROUND_HEAD,
    left: FACE_EYE,
    nose: "Pink",
  },
};

const rightOf = (left: Point): Point => ({ x: 100 - left.x, y: left.y });

const body = (pen: Pen) =>
  `<path d="M19 101C19 88 32.5 81 50 81C67.5 81 81 88 81 101Z" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/><ellipse cx="50" cy="98" rx="13" ry="9" fill="${pen.coat.light}"/><ellipse cx="50" cy="86.5" rx="21" ry="4.6" fill="${pen.coat.shade}" fill-opacity="0.55"/>`;

const FOREHEADS: Readonly<Record<Marking, (pen: Pen) => string>> = {
  Mask: nothing,
  Muzzle: (pen) =>
    `<ellipse cx="50" cy="68.5" rx="12.5" ry="8.6" fill="${pen.coat.light}"/>`,
  Patch: nothing,
  Plain: nothing,
  Stripes: (pen) =>
    `<path d="M50 34.5V41.5M43.2 35.6L44.2 41M56.8 35.6L55.8 41" ${line(pen, pen.coat.shade, 2.8)}/>${pair(`<path d="M19.8 56.5H25.3M20.2 61.6H24.6" ${line(pen, pen.coat.shade, 2.4)}/>`)}`,
};

const AROUND_EYES: Readonly<
  Record<Marking, (pen: Pen, left: Point) => string>
> = {
  Mask: (pen, left) => {
    const right = rightOf(left);

    return `<ellipse cx="${num(left.x)}" cy="${num(left.y + 0.5)}" rx="7.6" ry="9" transform="rotate(24 ${num(left.x)} ${num(left.y)})" fill="${pen.coat.mask}"/><ellipse cx="${num(right.x)}" cy="${num(right.y + 0.5)}" rx="7.6" ry="9" transform="rotate(-24 ${num(right.x)} ${num(right.y)})" fill="${pen.coat.mask}"/>`;
  },
  Muzzle: nothing,
  Patch: (pen, left) =>
    `<ellipse cx="${num(rightOf(left).x + 1)}" cy="${num(left.y - 1.5)}" rx="8.6" ry="9.6" fill="${pen.coat.shade}"/>`,
  Plain: nothing,
  Stripes: nothing,
};

const CHEEK_ART: Readonly<Record<Cheeks, (x: number, y: number) => string>> = {
  Bare: nothing,
  Freckles: (x, y) =>
    pair(
      `<ellipse cx="${num(x)}" cy="${num(y)}" rx="5" ry="3.1" fill="${BLUSH}" fill-opacity="0.28"/><circle cx="${num(x - 2.6)}" cy="${num(y - 0.8)}" r="0.95" fill="${FRECKLE}"/><circle cx="${num(x)}" cy="${num(y + 1)}" r="0.95" fill="${FRECKLE}"/><circle cx="${num(x + 2.6)}" cy="${num(y - 0.8)}" r="0.95" fill="${FRECKLE}"/>`
    ),
  Rosy: (x, y) =>
    pair(
      `<ellipse cx="${num(x)}" cy="${num(y)}" rx="5.2" ry="3.3" fill="${BLUSH}" fill-opacity="0.5"/>`
    ),
};

interface Gaze {
  readonly pen: Pen;
  readonly style: Eyes;
  readonly onDark: boolean;
}

const ringFor = (gaze: Gaze) =>
  gaze.onDark ? ` stroke="${PAPER}" stroke-width="${gaze.pen.width(1.3)}"` : "";

const strokeFor = (gaze: Gaze) => (gaze.onDark ? PAPER : INK);

const lashes = (gaze: Gaze, at: Point) => {
  const side = at.x < 50 ? -1 : 1;

  return `<path d="M${num(at.x + side * 2.7)} ${num(at.y - 2.9)}l${num(side * 2.3)} -1.7M${num(at.x + side * 3.5)} ${num(at.y - 0.8)}l${num(side * 2.6)} -0.5" ${line(gaze.pen, strokeFor(gaze), 1.5)}/>`;
};

const openEye = (gaze: Gaze, at: Point, look: Point) => {
  if (gaze.style === "Button") {
    const px = at.x + look.x * 1.6 + 0.4;
    const py = at.y + look.y * 1.6 + 0.4;

    return `<circle cx="${num(at.x)}" cy="${num(at.y)}" r="6" fill="${PAPER}" ${outlined(gaze.pen, 1.8)}/><circle cx="${num(px)}" cy="${num(py)}" r="3.3" fill="${INK}"/><circle cx="${num(px + 1)}" cy="${num(py - 1.1)}" r="1.1" fill="${PAPER}"/>`;
  }

  const x = at.x + look.x * 0.7;
  const y = at.y + look.y * 0.7;

  if (gaze.style === "Shiny") {
    return `<ellipse cx="${num(x)}" cy="${num(y)}" rx="4.7" ry="5.7" fill="${INK}"${ringFor(gaze)}/><circle cx="${num(x + 1.6)}" cy="${num(y - 2.1)}" r="2" fill="${PAPER}"/><circle cx="${num(x - 1.6)}" cy="${num(y + 2.4)}" r="0.95" fill="${PAPER}"/>`;
  }

  const dot = `<ellipse cx="${num(x)}" cy="${num(y)}" rx="3.5" ry="4.3" fill="${INK}"${ringFor(gaze)}/><circle cx="${num(x + 1.2)}" cy="${num(y - 1.6)}" r="1.3" fill="${PAPER}"/>`;

  return gaze.style === "Lashes" ? dot + lashes(gaze, { x, y }) : dot;
};

const downEye = (gaze: Gaze, at: Point) => {
  const { x } = at;
  const y = at.y + 0.8;

  if (gaze.style === "Button") {
    return `<path d="M${num(x - 6)} ${num(y)}Q${num(x)} ${num(y + 2.6)} ${num(x + 6)} ${num(y)}A6 6 0 0 1 ${num(x - 6)} ${num(y)}Z" fill="${PAPER}" ${outlined(gaze.pen, 1.8)}/><circle cx="${num(x)}" cy="${num(y + 3.4)}" r="2.4" fill="${INK}"/><path d="M${num(x - 6.8)} ${num(y - 0.4)}Q${num(x)} ${num(y + 2.6)} ${num(x + 6.8)} ${num(y - 0.4)}" ${line(gaze.pen, INK, 2)}/>`;
  }

  const wide = gaze.style === "Shiny" ? 4.8 : 3.7;
  const tall = gaze.style === "Shiny" ? 5 : 3.9;
  const dip = gaze.style === "Shiny" ? 2.2 : 1.8;
  const bowl = `<path d="M${num(x - wide)} ${num(y)}Q${num(x)} ${num(y + dip)} ${num(x + wide)} ${num(y)}A${num(wide)} ${num(tall)} 0 0 1 ${num(x - wide)} ${num(y)}Z" fill="${INK}"${ringFor(gaze)}/><path d="M${num(x - wide - 1.2)} ${num(y - 0.5)}Q${num(x)} ${num(y + dip)} ${num(x + wide + 1.2)} ${num(y - 0.5)}" ${line(gaze.pen, strokeFor(gaze), 1.9)}/>`;

  const shine =
    gaze.style === "Shiny"
      ? `<circle cx="${num(x + 1.7)}" cy="${num(y + 2.6)}" r="0.9" fill="${PAPER}"/>`
      : "";

  const side = at.x < 50 ? -1 : 1;

  const fringe =
    gaze.style === "Lashes"
      ? `<path d="M${num(x + side * (wide + 0.6))} ${num(y - 0.2)}l${num(side * 2)} 1.2M${num(x + side * (wide - 1.2))} ${num(y + 0.9)}l${num(side * 1.4)} 1.9" ${line(gaze.pen, strokeFor(gaze), 1.5)}/>`
      : "";

  return bowl + shine + fringe;
};

const happyEye = (gaze: Gaze, at: Point) =>
  `<path d="M${num(at.x - 4.8)} ${num(at.y + 2)}Q${num(at.x)} ${num(at.y - 4.6)} ${num(at.x + 4.8)} ${num(at.y + 2)}" ${line(gaze.pen, strokeFor(gaze), 2.5)}/>`;

const closedEye = (gaze: Gaze, at: Point) =>
  `<path d="M${num(at.x - 4.8)} ${num(at.y)}Q${num(at.x)} ${num(at.y + 4.4)} ${num(at.x + 4.8)} ${num(at.y)}" ${line(gaze.pen, strokeFor(gaze), 2.3)}/>`;

const wetEye = (gaze: Gaze, at: Point) =>
  `<ellipse cx="${num(at.x)}" cy="${num(at.y)}" rx="5" ry="6" fill="${INK}"${ringFor(gaze)}/><circle cx="${num(at.x + 1.7)}" cy="${num(at.y - 2.2)}" r="2.1" fill="${PAPER}"/><circle cx="${num(at.x - 1.5)}" cy="${num(at.y + 2.6)}" r="1.3" fill="${PAPER}"/><circle cx="${num(at.x + 2.2)}" cy="${num(at.y + 2.6)}" r="0.7" fill="${PAPER}"/>`;

const tear = (pen: Pen, at: Point) => {
  const x = at.x + 4.6;
  const y = at.y + 3.4;

  return `<path d="M${num(x)} ${num(y)}C${num(x - 2.3)} ${num(y + 3.3)} ${num(x - 2.5)} ${num(y + 5.8)} ${num(x)} ${num(y + 5.8)}C${num(x + 2.5)} ${num(y + 5.8)} ${num(x + 2.3)} ${num(y + 3.3)} ${num(x)} ${num(y)}Z" fill="${TEAR}" ${outlined(pen, 1.2)}/>`;
};

const brows = (gaze: Gaze, left: Point, raised: boolean) => {
  const right = rightOf(left);
  const colour = strokeFor(gaze);

  if (raised) {
    return `<path d="M${num(left.x - 4.4)} ${num(left.y - 9.2)}Q${num(left.x)} ${num(left.y - 9.9)} ${num(left.x + 4.4)} ${num(left.y - 8.8)}M${num(right.x - 4.4)} ${num(right.y - 11)}Q${num(right.x)} ${num(right.y - 14.4)} ${num(right.x + 4.6)} ${num(right.y - 11.6)}" ${line(gaze.pen, colour, 2.1)}/>`;
  }

  return `<path d="M${num(left.x - 4.6)} ${num(left.y - 8.2)}Q${num(left.x - 0.6)} ${num(left.y - 8.8)} ${num(left.x + 4)} ${num(left.y - 11.8)}M${num(right.x + 4.6)} ${num(right.y - 8.2)}Q${num(right.x + 0.6)} ${num(right.y - 8.8)} ${num(right.x - 4)} ${num(right.y - 11.8)}" ${line(gaze.pen, colour, 2.1)}/>`;
};

const LOOK_AHEAD: Point = { x: 0, y: 0 };

const LOOK_UP_AND_AWAY: Point = { x: 1.4, y: -1.6 };

const bothEyes = (left: Point, draw: (at: Point) => string) =>
  draw(left) + draw(rightOf(left));

const EYES_BY_EXPRESSION: Readonly<
  Record<Expression, (gaze: Gaze, left: Point) => string>
> = {
  Folded: (gaze, left) => bothEyes(left, (at) => closedEye(gaze, at)),
  Gutted: (gaze, left) =>
    bothEyes(left, (at) => wetEye(gaze, at)) +
    brows(gaze, left, false) +
    tear(gaze.pen, rightOf(left)),
  Happy: (gaze, left) => bothEyes(left, (at) => happyEye(gaze, at)),
  LookingDown: (gaze, left) => bothEyes(left, (at) => downEye(gaze, at)),
  Resting: (gaze, left) =>
    bothEyes(left, (at) => openEye(gaze, at, LOOK_AHEAD)),
  Thinking: (gaze, left) =>
    bothEyes(left, (at) => openEye(gaze, at, LOOK_UP_AND_AWAY)) +
    brows(gaze, left, true),
};

const NOSES: Readonly<Record<Nose, (pen: Pen) => string>> = {
  Dark: () =>
    `<ellipse cx="50" cy="64.6" rx="3.9" ry="2.8" fill="${INK}"/><ellipse cx="48.9" cy="63.7" rx="1.3" ry="0.75" fill="${PAPER}" fill-opacity="0.75"/>`,
  Nostrils: () =>
    `<circle cx="47.6" cy="64" r="0.95" fill="${INK}"/><circle cx="52.4" cy="64" r="0.95" fill="${INK}"/>`,
  Pink: (pen) =>
    `<path d="M47.1 63.3Q50 62 52.9 63.3Q52.5 66.4 50 66.7Q47.5 66.4 47.1 63.3Z" fill="${NOSE_PINK}" ${outlined(pen, 1.3)}/>`,
};

const KITTY = "M43.8 68.4Q46.9 72.6 50 69.4Q53.1 72.6 56.2 68.4";

const RESTING_MOUTHS: Readonly<Record<Mouth, (pen: Pen) => string>> = {
  Blep: (pen) =>
    `<path d="M48.2 69.6Q48.2 74.8 50 74.8Q51.8 74.8 51.8 69.6Z" fill="${TONGUE}" ${outlined(pen, 1.2)}/><path d="${KITTY}" ${line(pen, INK, 2)}/>`,
  Grin: (pen) =>
    `<path d="M44.5 68Q50 68.8 55.5 68Q54.6 75.6 50 75.6Q45.4 75.6 44.5 68Z" fill="${MOUTH_INSIDE}" ${outlined(pen, 1.8)}/><path d="M46.9 73.6Q50 71.6 53.1 73.6Q52 75.2 50 75.2Q48 75.2 46.9 73.6Z" fill="${TONGUE}"/>`,
  Kitty: (pen) => `<path d="${KITTY}" ${line(pen, INK, 2)}/>`,
  Smile: (pen) => `<path d="M45 68.6Q50 73.6 55 68.6" ${line(pen, INK, 2)}/>`,
  Toothy: (pen) =>
    `<path d="M47.4 68.8H52.6V72.2Q52.6 73.4 51.4 73.4H48.6Q47.4 73.4 47.4 72.2Z" fill="${PAPER}" ${outlined(pen, 1.3)}/><path d="M50 69V73.2" ${line(pen, INK, 1)}/><path d="M44.4 67.6Q47.2 70.2 50 68.4Q52.8 70.2 55.6 67.6" ${line(pen, INK, 2)}/>`,
};

const MOUTHS_BY_EXPRESSION: Readonly<
  Record<Expression, (mouth: Mouth, pen: Pen) => string>
> = {
  Folded: (_, pen) => `<path d="M47 70Q50 72.2 53 70" ${line(pen, INK, 2)}/>`,
  Gutted: (_, pen) =>
    `<path d="M43 74Q44.8 70.4 47 72Q50 69.6 53 72Q55.2 70.4 57 74" ${line(pen, INK, 2)}/>`,
  Happy: (_, pen) =>
    `<path d="M42.5 67.4Q50 68.6 57.5 67.4Q56.4 78.4 50 78.4Q43.6 78.4 42.5 67.4Z" fill="${MOUTH_INSIDE}" ${outlined(pen, 1.9)}/><path d="M45.6 75.4Q50 72.4 54.4 75.4Q52.6 77.8 50 77.8Q47.4 77.8 45.6 75.4Z" fill="${TONGUE}"/>`,
  LookingDown: (mouth, pen) => RESTING_MOUTHS[mouth](pen),
  Resting: (mouth, pen) => RESTING_MOUTHS[mouth](pen),
  Thinking: (_, pen) =>
    `<path d="M46 71.2Q48.5 69.8 50.5 71.2Q52.5 72.6 55 71.2" ${line(pen, INK, 2)}/>`,
};

const petals = (pen: Pen, centre: Point) =>
  `${[0, 1, 2, 3, 4]
    .map((index) => {
      const angle = (index * 2 * Math.PI) / 5 - Math.PI / 2;

      return `<circle cx="${num(centre.x + Math.cos(angle) * 3.9)}" cy="${num(centre.y + Math.sin(angle) * 3.9)}" r="3.4" fill="${pen.tint.base}" ${outlined(pen, 1.4)}/>`;
    })
    .join(
      ""
    )}<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="2.5" fill="${GOLD}" ${outlined(pen, 1.2)}/>`;

const glasses = (pen: Pen, left: Point) => {
  const right = rightOf(left);
  const frame = line(pen, pen.tint.deep, 2.2);

  return `<circle cx="${num(left.x)}" cy="${num(left.y)}" r="7.4" fill="${PAPER}" fill-opacity="0.22" ${frame}/><circle cx="${num(right.x)}" cy="${num(right.y)}" r="7.4" fill="${PAPER}" fill-opacity="0.22" ${frame}/><path d="M${num(left.x + 7.4)} ${num(left.y - 0.8)}Q50 ${num(left.y - 3.8)} ${num(right.x - 7.4)} ${num(right.y - 0.8)}M${num(left.x - 7.4)} ${num(left.y - 1.4)}L${num(left.x - 13.4)} ${num(left.y - 3.4)}M${num(right.x + 7.4)} ${num(right.y - 1.4)}L${num(right.x + 13.4)} ${num(right.y - 3.4)}" ${frame}/>`;
};

const HATS: Readonly<Record<Accessory, (pen: Pen) => string>> = {
  Beanie: (pen) =>
    `<path d="M35.5 36C35.5 22.5 64.5 22.5 64.5 36Z" fill="${pen.tint.base}" ${outlined(pen, 2)}/><path d="M43 27V35M50 25V35M57 27V35" ${line(pen, pen.tint.deep, 1.5)}/><path d="M33.5 34.5Q50 31 66.5 34.5V39.5Q50 36 33.5 39.5Z" fill="${pen.tint.deep}" ${outlined(pen, 2)}/><circle cx="50" cy="21.5" r="4.2" fill="${PAPER}" ${outlined(pen, 1.8)}/>`,
  Bow: (pen) =>
    `<g transform="rotate(-18 66 36)"><path d="M66 36C60.5 30 55.5 31.5 56.5 37C57.5 42 62 41.5 66 36Z" fill="${pen.tint.base}" ${outlined(pen, 1.8)}/><path d="M66 36C71.5 30 76.5 31.5 75.5 37C74.5 42 70 41.5 66 36Z" fill="${pen.tint.base}" ${outlined(pen, 1.8)}/><circle cx="66" cy="36" r="2.8" fill="${pen.tint.deep}" ${outlined(pen, 1.6)}/></g>`,
  Crown: (pen) =>
    `<path d="M39.5 35L38.5 23.5L44.6 28.6L50 20.5L55.4 28.6L61.5 23.5L60.5 35Z" fill="${GOLD}" ${outlined(pen, 1.8)}/><circle cx="50" cy="30.6" r="1.9" fill="${pen.tint.base}"/>`,
  Flower: (pen) => petals(pen, { x: 31.5, y: 38.5 }),
  Glasses: nothing,
  Headphones: (pen) =>
    `<path d="M21.5 58C19.5 22 80.5 22 78.5 58" ${line(pen, INK, 6.6)}/><path d="M21.5 58C19.5 22 80.5 22 78.5 58" ${line(pen, pen.tint.base, 3.6)}/><rect x="14.5" y="51" width="10.5" height="17" rx="4.6" fill="${pen.tint.base}" ${outlined(pen, 2)}/><rect x="75" y="51" width="10.5" height="17" rx="4.6" fill="${pen.tint.base}" ${outlined(pen, 2)}/>`,
  None: nothing,
  PartyHat: (pen) =>
    `<path d="M41.5 35.5L50 12.5L58.5 35.5Z" fill="${pen.tint.base}" ${outlined(pen, 2)}/><circle cx="47.6" cy="29.5" r="1.4" fill="${PAPER}"/><circle cx="52.4" cy="24" r="1.3" fill="${PAPER}"/><circle cx="49.6" cy="19.2" r="1.1" fill="${PAPER}"/><circle cx="50" cy="12.5" r="2.9" fill="${GOLD}" ${outlined(pen, 1.6)}/>`,
  Visor: (pen) =>
    `<path d="M23.5 47.5C29.5 33 70.5 33 76.5 47.5C66 41.8 34 41.8 23.5 47.5Z" fill="${pen.tint.base}" fill-opacity="0.9" ${outlined(pen, 2)}/><path d="M31 41.6C40 37.6 60 37.6 69 41.6" ${line(pen, PAPER, 1.3)} stroke-opacity="0.45"/>`,
};

const CARD_RED = "#d94a4a";

const heldCards = (pen: Pen) =>
  `<g transform="rotate(-10 45 85)"><rect x="39" y="76.5" width="11.5" height="15.5" rx="2" fill="${PAPER}" ${outlined(pen, 1.6)}/><path d="M44.75 80.6C43.7 79.3 41.8 80.3 42.7 81.9L44.75 84.2L46.8 81.9C47.7 80.3 45.8 79.3 44.75 80.6Z" fill="${CARD_RED}"/></g><g transform="rotate(9 55 85)"><rect x="49.5" y="76" width="11.5" height="15.5" rx="2" fill="${PAPER}" ${outlined(pen, 1.6)}/><path d="M55.25 79.6L57.5 82.5L55.25 85.4L53 82.5Z" fill="${CARD_RED}"/></g>${pair(`<ellipse cx="42" cy="89.5" rx="5" ry="4.3" fill="${pen.coat.base}" ${outlined(pen, 1.8)}/>`)}`;

const FEATURE_SHIFT: Readonly<Record<Expression, string>> = {
  Folded: "",
  Gutted: "",
  Happy: ' transform="translate(0 -0.8)"',
  LookingDown: ' transform="translate(0 2)"',
  Resting: "",
  Thinking: ' transform="translate(0.8 -0.4)"',
};

export const render = (
  avatar: Avatar,
  { expression, size }: RenderOptions
): string => {
  const pen: Pen = {
    coat: COATS[avatar.fur],
    tint: TINTS[avatar.accent],
    width: (base) => num(size < BOLD_BELOW_PX ? base * 1.25 : base),
  };

  const build = BUILDS[avatar.species];

  const gaze: Gaze = {
    onDark: avatar.marking === "Mask" && pen.coat.maskIsDark,
    pen,
    style: avatar.eyes,
  };

  const { left } = build;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${num(size)}" height="${num(size)}">`,
    `<rect width="100" height="100" fill="${BACKDROP_COLOURS[avatar.backdrop]}"/>`,
    body(pen),
    build.back(pen),
    `<path d="${build.head}" fill="${pen.coat.base}" ${outlined(pen, 2.4)}/>`,
    `<g${FEATURE_SHIFT[expression]}>`,
    FOREHEADS[avatar.marking](pen),
    `</g>`,
    build.front(pen),
    `<g${FEATURE_SHIFT[expression]}>`,
    AROUND_EYES[avatar.marking](pen, left),
    CHEEK_ART[avatar.cheeks](left.x - 4.5, build.cheekY),
    EYES_BY_EXPRESSION[expression](gaze, left),
    NOSES[build.nose](pen),
    MOUTHS_BY_EXPRESSION[expression](avatar.mouth, pen),
    avatar.accessory === "Glasses" ? glasses(pen, left) : "",
    `</g>`,
    `<g${build.hat}>${HATS[avatar.accessory](pen)}</g>`,
    expression === "LookingDown" ? heldCards(pen) : "",
    `</svg>`,
  ].join("");
};
