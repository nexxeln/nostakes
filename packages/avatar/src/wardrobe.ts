import type {
  Expression,
  Extra,
  Eyewear,
  Headwear,
  Neckwear,
} from "./avatar.js";
import {
  CARD_RED,
  GOLD,
  GOLD_DEEP,
  GOLD_LIGHT,
  INK,
  PAPER,
} from "./palette.js";
import {
  at,
  featureInk,
  line,
  mirror,
  num,
  outlined,
  pair,
  stroked,
} from "./pen.js";
import type { Pen, Point } from "./pen.js";

const SPADE =
  "M0 -5C-1.6 -2.6 -5 -1.2 -5 1.4C-5 3.4 -2.8 4.2 -1.2 2.8L-2.2 5.4H2.2L1.2 2.8C2.8 4.2 5 3.4 5 1.4C5 -1.2 1.6 -2.6 0 -5Z";

export const spadeAt = (centre: Point, size: number, fill: string) =>
  `<path d="${SPADE}" transform="translate(${at(centre)}) scale(${num(size / 10)})" fill="${fill}"/>`;

const HAT_TAN = "#c47b36";

const HAT_TAN_DEEP = "#93561f";

const FELT_GREY = "#3b3f52";

const FELT_GREY_DEEP = "#282b3a";

const VISOR_GREEN = "#3cc47c";

const BANDANA_RED = "#e0364f";

const HEADSET = "#2b2f42";

const NEON = "#38e8d6";

const CAP_BLACK = "#24273a";

const CAPTAIN_NAVY = "#25305e";

const cowboy = (pen: Pen) =>
  `<path d="M6 25C6 18.5 16 20 26 24C36 28 64 28 74 24C84 20 94 18.5 94 25C94 32 76 37.5 50 37.5C24 37.5 6 32 6 25Z" fill="${HAT_TAN}" ${outlined(pen, 2.5)}/><path d="M31.5 26C30.5 15 36 6 43 6.5C46 7 47 10 50 10C53 10 54 7 57 6.5C64 6 69.5 15 68.5 26C62 28.5 38 28.5 31.5 26Z" fill="${HAT_TAN}" ${outlined(pen, 2.5)}/><path d="M43 9.5Q50 14.5 57 9.5" ${line(pen, HAT_TAN_DEEP, 1.8)}/><path d="M31.8 21.4C38 24 62 24 68.2 21.4L68.5 26C62 28.5 38 28.5 31.5 26Z" fill="${INK}"/><circle cx="50" cy="24.4" r="2.6" fill="${GOLD}" ${outlined(pen, 1.2)}/><path d="M14 27C26 33 74 33 86 27" ${line(pen, HAT_TAN_DEEP, 1.6)} stroke-opacity="0.7"/>`;

const fedora = (pen: Pen) =>
  `<path d="M11 29C11 23.5 30 24.5 50 24.5C70 24.5 89 23.5 89 29C89 33.5 72 36.5 50 36.5C28 36.5 11 33.5 11 29Z" fill="${FELT_GREY}" ${outlined(pen, 2.5)}/><path d="M29.5 28C28.5 16 36.5 9 50 10C63.5 9 71.5 16 70.5 28C62 30.5 38 30.5 29.5 28Z" fill="${FELT_GREY}" ${outlined(pen, 2.5)}/><path d="M41 12.5Q50 18 59 12.5" ${line(pen, FELT_GREY_DEEP, 1.8)}/><path d="M29.7 22.5C38 25 62 25 70.3 22.5L70.5 28C62 30.5 38 30.5 29.5 28Z" fill="${CARD_RED}"/><g transform="rotate(14 64 19)"><rect x="60" y="12.5" width="8" height="11" rx="1.3" fill="${PAPER}" ${outlined(pen, 1.3)}/>${spadeAt({ x: 64, y: 17.6 }, 4.6, INK)}</g><path d="M17 31C30 34.5 70 34.5 83 31" ${line(pen, FELT_GREY_DEEP, 1.6)}/>`;

const visor = (pen: Pen) =>
  `<path d="M17 33C25 24 75 24 83 33" ${line(pen, INK, 5)}/><path d="M17 33C25 24 75 24 83 33" ${line(pen, "#1f7a4b", 2.6)}/><path d="M15 34C19 21 81 21 85 34C73 41.5 27 41.5 15 34Z" fill="${VISOR_GREEN}" fill-opacity="0.8" ${outlined(pen, 2.4)}/><path d="M24 32C34 27 66 27 76 32" ${line(pen, PAPER, 1.6)} stroke-opacity="0.55"/>`;

const crown = (pen: Pen) =>
  `<g transform="rotate(-7 50 20)"><path d="M33 27L30.5 10L40.5 17.5L50 5.5L59.5 17.5L69.5 10L67 27Z" fill="${GOLD}" ${outlined(pen, 2.3)}/><path d="M32.6 22.5H67.4" ${line(pen, GOLD_DEEP, 1.8)}/><circle cx="30.5" cy="10" r="2.3" fill="${GOLD}" ${outlined(pen, 1.4)}/><circle cx="50" cy="5.5" r="2.4" fill="${GOLD}" ${outlined(pen, 1.4)}/><circle cx="69.5" cy="10" r="2.3" fill="${GOLD}" ${outlined(pen, 1.4)}/>${spadeAt({ x: 50, y: 17.4 }, 6.4, CARD_RED)}<path d="M36 13.5L37 18" ${line(pen, GOLD_LIGHT, 1.4)}/></g>`;

const bandana = (pen: Pen) =>
  `<path d="M79 31C87 26 94 30 96 37C90 36 86 36 81 35Z" fill="${BANDANA_RED}" ${outlined(pen, 2)}/><path d="M79 34C85 37 89 43 87 50C83 46 81 42 77.5 37.5Z" fill="${BANDANA_RED}" ${outlined(pen, 2)}/><path d="M17 38C16 22 31 13 50 13C69 13 84 22 83 38C70 32 30 32 17 38Z" fill="${BANDANA_RED}" ${outlined(pen, 2.4)}/><path d="M30 22h0M42 18h0M56 18h0M68 22h0M36 28h0M50 25h0M63 28h0M24 31h0M76 31h0" ${line(pen, PAPER, 2)}/><circle cx="80.5" cy="34.5" r="3.2" fill="${BANDANA_RED}" ${outlined(pen, 1.8)}/>`;

const headphones = (pen: Pen) =>
  `<path d="M17 52C14 20 86 20 83 52" ${line(pen, INK, 7.4)}/><path d="M17 52C14 20 86 20 83 52" ${line(pen, HEADSET, 4)}/>${pair(`<rect x="8" y="44" width="13" height="20" rx="5.6" fill="${HEADSET}" ${outlined(pen, 2.3)}/><path d="M11.5 48.5V59.5" ${line(pen, NEON, 2.2)}/>`)}<path d="M15 63C17 72 25 77 34 76" ${line(pen, INK, 3.6)}/><path d="M15 63C17 72 25 77 34 76" ${line(pen, HEADSET, 1.6)}/><circle cx="35" cy="76" r="2.6" fill="${HEADSET}" ${outlined(pen, 1.5)}/>`;

const cap = (pen: Pen) =>
  `<g transform="rotate(-6 50 26)"><path d="M23 33C22 18 34 11 50 11C66 11 78 18 77 33C66 30 34 30 23 33Z" fill="${CAP_BLACK}" ${outlined(pen, 2.4)}/><path d="M50 11.5V30" ${line(pen, "#3a3e57", 1.4)}/>${spadeAt({ x: 50, y: 22 }, 8, GOLD)}<path d="M21 33.5C32 29 68 29 79 33.5C82 35 81 38.5 77 38C66 35.5 34 35.5 23 38C19 38.5 18 35 21 33.5Z" fill="${GOLD}" ${outlined(pen, 2.2)}/><circle cx="50" cy="11.4" r="1.8" fill="${CAP_BLACK}" ${outlined(pen, 1.2)}/></g>`;

const captain = (pen: Pen) =>
  `<path d="M18 21C18 12.5 34 8.5 50 8.5C66 8.5 82 12.5 82 21C82 25.5 69 27.5 50 27.5C31 27.5 18 25.5 18 21Z" fill="${PAPER}" ${outlined(pen, 2.4)}/><path d="M26 24.5H74V31.5C64 33 36 33 26 31.5Z" fill="${CAPTAIN_NAVY}" ${outlined(pen, 2.2)}/><path d="M26 31C34 39 66 39 74 31C66 34.5 34 34.5 26 31Z" fill="${INK}" ${outlined(pen, 2)}/><path d="M33 29H67" ${line(pen, GOLD, 1.3)}/><circle cx="50" cy="25.5" r="5" fill="${GOLD}" ${outlined(pen, 1.6)}/>${spadeAt({ x: 50, y: 25.6 }, 5.4, CAPTAIN_NAVY)}`;

export const HEADWEAR_ART: Readonly<
  Record<Headwear, ((pen: Pen) => string) | undefined>
> = {
  Bandana: bandana,
  Cap: cap,
  Captain: captain,
  Cowboy: cowboy,
  Crown: crown,
  Fedora: fedora,
  Headphones: headphones,
  None: undefined,
  Visor: visor,
};

export const HAT_TOP: Readonly<Record<Headwear, number | undefined>> = {
  Bandana: 15,
  Cap: 13,
  Captain: 10,
  Cowboy: 9,
  Crown: 8,
  Fedora: 11,
  Headphones: undefined,
  None: undefined,
  Visor: undefined,
};

export interface Frame {
  readonly pen: Pen;
  readonly eye: Point;
  readonly scale: number;
  readonly side: Point;
}

export type Glint = "Line" | "Star" | "None";

export interface Wear {
  readonly shift: Point;
  readonly tilt: number;
  readonly glint: Glint;
}

export const OPAQUE_WEAR: Readonly<Record<Expression, Wear>> = {
  Folded: { glint: "None", shift: { x: 0, y: -12.5 }, tilt: -4 },
  Gutted: { glint: "None", shift: { x: 0, y: 1.6 }, tilt: 7 },
  Happy: { glint: "Star", shift: { x: 0, y: -0.8 }, tilt: 0 },
  LookingDown: { glint: "None", shift: { x: 0, y: 7.4 }, tilt: 0 },
  Resting: { glint: "Line", shift: { x: 0, y: 0 }, tilt: 0 },
  Thinking: { glint: "Line", shift: { x: 0, y: -0.6 }, tilt: -4 },
};

const right = (point: Point): Point => ({ x: 100 - point.x, y: point.y });

const temples = (frame: Frame, reach: number, colour: string) => {
  const { eye, scale, side, pen } = frame;
  const startX = eye.x - reach * scale;

  return startX - side.x > 1.5
    ? pair(
        `<path d="M${num(startX)} ${num(eye.y - 3.6 * scale)}L${num(side.x + 0.6)} ${num(eye.y - 5 * scale)}" ${line(pen, colour, 2.2)}/>`
      )
    : "";
};

const glintOn = (frame: Frame, centre: Point, glint: Glint) => {
  const s = frame.scale;
  const { pen } = frame;

  if (glint === "Line") {
    return `<path d="M${num(centre.x - 4.6 * s)} ${num(centre.y + 2.6 * s)}L${num(centre.x - 0.8 * s)} ${num(centre.y - 3 * s)}" ${line(pen, PAPER, 2)} stroke-opacity="0.85"/><circle cx="${num(centre.x + 1.6 * s)}" cy="${num(centre.y - 3 * s)}" r="${num(0.9 * s)}" fill="${PAPER}" fill-opacity="0.85"/>`;
  }

  if (glint === "Star") {
    const x = centre.x - 2 * s;
    const y = centre.y - 1.4 * s;
    const r = 3.6 * s;

    return `<path d="M${num(x)} ${num(y - r)}Q${num(x + 0.6 * s)} ${num(y - 0.6 * s)} ${num(x + r)} ${num(y)}Q${num(x + 0.6 * s)} ${num(y + 0.6 * s)} ${num(x)} ${num(y + r)}Q${num(x - 0.6 * s)} ${num(y + 0.6 * s)} ${num(x - r)} ${num(y)}Q${num(x - 0.6 * s)} ${num(y - 0.6 * s)} ${num(x)} ${num(y - r)}Z" fill="${PAPER}"/>`;
  }

  return "";
};

const glints = (frame: Frame, glint: Glint) =>
  glintOn(frame, frame.eye, glint) + glintOn(frame, right(frame.eye), glint);

const bridge = (
  frame: Frame,
  reach: number,
  lift: number,
  colour: string,
  width: number
) => {
  const { eye, scale, pen } = frame;
  const from = eye.x + reach * scale;

  return `<path d="M${num(from)} ${num(eye.y - lift * scale)}Q50 ${num(eye.y - (lift + 2.6) * scale)} ${num(100 - from)} ${num(eye.y - lift * scale)}" ${line(pen, colour, width)}/>`;
};

const wayfarers = (frame: Frame, glint: Glint) => {
  const { eye, scale, pen } = frame;
  const x = (dx: number) => num(eye.x + dx * scale);
  const y = (dy: number) => num(eye.y + dy * scale);
  const lens = `<path d="M${x(-8.8)} ${y(-5.8)}H${x(8.6)}Q${x(9.4)} ${y(-5.8)} ${x(9)} ${y(-3.8)}L${x(7.4)} ${y(3.6)}Q${x(6.6)} ${y(6.6)} ${x(3.4)} ${y(6.6)}H${x(-4.6)}Q${x(-7.9)} ${y(6.6)} ${x(-8.5)} ${y(3.4)}L${x(-9.4)} ${y(-4)}Q${x(-9.5)} ${y(-5.8)} ${x(-8.8)} ${y(-5.8)}Z" fill="#15131f" ${outlined(pen, 2.3)}/><path d="M${x(-9.2)} ${y(-5.2)}H${x(8.9)}" ${line(pen, INK, 3.4)}/>`;

  return `${temples(frame, 9.2, INK)}${bridge(frame, 8.6, 4.2, INK, 2.8)}${lens}${mirror(lens)}${glints(frame, glint)}`;
};

const aviators = (frame: Frame, glint: Glint) => {
  const { eye, scale, pen } = frame;
  const x = (dx: number) => num(eye.x + dx * scale);
  const y = (dy: number) => num(eye.y + dy * scale);
  const rim = `M${x(-8.4)} ${y(-5)}Q${x(0)} ${y(-6.8)} ${x(8.2)} ${y(-4.8)}Q${x(9.2)} ${y(3)} ${x(3.4)} ${y(7)}Q${x(-3)} ${y(9.2)} ${x(-7.6)} ${y(3.8)}Q${x(-9.6)} ${y(-0.6)} ${x(-8.4)} ${y(-5)}Z`;
  const lens = `<path d="${rim}" fill="#1f4f66"/><ellipse cx="${x(-0.4)}" cy="${y(3.6)}" rx="${num(6 * scale)}" ry="${num(2.6 * scale)}" fill="#6fd0e0" fill-opacity="0.5"/><path d="${rim}" ${line(pen, INK, 3.6)}/><path d="${rim}" ${line(pen, GOLD, 1.6)}/>`;

  return `${temples(frame, 8.6, GOLD_DEEP)}${bridge(frame, 8.2, 4.6, INK, 3.2)}${bridge(frame, 8.2, 4.6, GOLD, 1.4)}${bridge(frame, 6.6, 1.4, GOLD, 1.3)}${lens}${mirror(lens)}${glints(frame, glint)}`;
};

const wraps = (frame: Frame, glint: Glint) => {
  const { eye, scale, pen } = frame;
  const l = (dx: number) => num(eye.x + dx * scale);
  const r = (dx: number) => num(100 - eye.x + dx * scale);
  const y = (dy: number) => num(eye.y + dy * scale);
  const rim = `M${l(-10)} ${y(-4.6)}Q50 ${y(-9.4)} ${r(10)} ${y(-4.6)}Q${r(11.2)} ${y(1.6)} ${r(6.4)} ${y(5.8)}Q${r(0)} ${y(7.6)} 56 ${y(3.6)}Q50 ${y(0.6)} 44 ${y(3.6)}Q${l(0)} ${y(7.6)} ${l(-6.4)} ${y(5.8)}Q${l(-11.2)} ${y(1.6)} ${l(-10)} ${y(-4.6)}Z`;

  return `${temples(frame, 10, INK)}<path d="${rim}" fill="#5338d6" ${outlined(pen, 2.4)}/><path d="M${l(-7.6)} ${y(-2.6)}Q50 ${y(-6.4)} ${r(7.6)} ${y(-2.6)}" ${line(pen, "#ff6fb5", 2.4)} stroke-opacity="0.9"/><path d="M${l(-6.6)} ${y(0.4)}Q50 ${y(-3.4)} ${r(6.6)} ${y(0.4)}" ${line(pen, "#7fe3ff", 1.8)} stroke-opacity="0.8"/>${glints(frame, glint)}`;
};

const roundShades = (frame: Frame, glint: Glint) => {
  const { eye, scale, pen } = frame;
  const lens = `<circle cx="${num(eye.x)}" cy="${num(eye.y)}" r="${num(6.6 * scale)}" fill="#15131f"/><circle cx="${num(eye.x)}" cy="${num(eye.y)}" r="${num(6.6 * scale)}" ${line(pen, INK, 3.4)}/><circle cx="${num(eye.x)}" cy="${num(eye.y)}" r="${num(6.6 * scale)}" ${line(pen, GOLD, 1.4)}/>`;

  return `${temples(frame, 6.6, GOLD_DEEP)}${bridge(frame, 6.4, 1.4, INK, 3)}${bridge(frame, 6.4, 1.4, GOLD, 1.3)}${lens}${mirror(lens)}${glints(frame, glint)}`;
};

const STAR_POINTS = 5;

const starLens = (centre: Point, outer: number, inner: number) =>
  `M${Array.from({ length: STAR_POINTS * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (index * Math.PI) / STAR_POINTS - Math.PI / 2;

    return `${num(centre.x + Math.cos(angle) * radius)} ${num(centre.y + Math.sin(angle) * radius)}`;
  }).join("L")}Z`;

const stars = (frame: Frame, glint: Glint) => {
  const { eye, scale, pen } = frame;

  const lens = (centre: Point) => {
    const rim = starLens(centre, 9.4 * scale, 4.6 * scale);

    return `<path d="${rim}" fill="#ff4f9a"/><path d="${rim}" ${line(pen, INK, 3.6)}/><path d="${rim}" ${line(pen, GOLD, 1.5)}/>`;
  };

  return `${bridge(frame, 6, 1.6, INK, 3)}${bridge(frame, 6, 1.6, GOLD, 1.3)}${lens(eye)}${lens(right(eye))}${glints(frame, glint)}`;
};

const monocle = (frame: Frame) => {
  const { eye, scale, pen } = frame;
  const centre = right(eye);
  const radius = 7.8 * scale;
  const chain = `M${num(centre.x + radius * 0.5)} ${num(centre.y + radius * 0.86)}C${num(centre.x + 4)} ${num(centre.y + 16)} ${num(centre.x + 12)} ${num(centre.y + 20)} ${num(centre.x + 14)} ${num(centre.y + 30)}`;

  return `<path d="${chain}" ${line(pen, INK, 2.6)}/><path d="${chain}" ${line(pen, GOLD, 1.2)} stroke-dasharray="1.4 1.2"/><circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(radius)}" fill="${PAPER}" fill-opacity="0.22"/><circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(radius)}" ${line(pen, INK, 3.6)}/><circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(radius)}" ${line(pen, GOLD, 1.7)}/><path d="M${num(centre.x - radius * 0.62)} ${num(centre.y - radius * 0.1)}A${num(radius * 0.64)} ${num(radius * 0.64)} 0 0 1 ${num(centre.x - radius * 0.06)} ${num(centre.y - radius * 0.64)}" ${line(pen, PAPER, 1.5)}/>`;
};

const specs = (frame: Frame) => {
  const { eye, scale, pen } = frame;
  const w = 15.6 * scale;
  const h = 12 * scale;
  const lens = `<rect x="${num(eye.x - w / 2)}" y="${num(eye.y - h / 2)}" width="${num(w)}" height="${num(h)}" rx="${num(3.6 * scale)}" fill="${PAPER}" fill-opacity="0.22" ${stroked(pen, featureInk(pen), 2.4)}/><path d="M${num(eye.x - w / 2 + 2.6 * scale)} ${num(eye.y + h / 2 - 2.4 * scale)}L${num(eye.x - w / 2 + 6 * scale)} ${num(eye.y - h / 2 + 2.6 * scale)}" ${line(pen, PAPER, 1.3)} stroke-opacity="0.8"/>`;

  return `${temples(frame, 7.8, featureInk(pen))}${bridge(frame, 7.8, 1.6, featureInk(pen), 2.4)}${lens}${mirror(lens)}`;
};

const eyepatch = (frame: Frame) => {
  const { eye, scale, pen } = frame;
  const centre = right(eye);
  const x = (dx: number) => num(centre.x + dx * scale);
  const y = (dy: number) => num(centre.y + dy * scale);

  return `<path d="M${x(-6.6)} ${y(-5)}L${num(eye.x - 8)} ${num(eye.y - 15 * scale)}M${x(6.8)} ${y(-3.6)}L${num(Math.min(centre.x + 13 * scale, 100 - frame.side.x))} ${y(-7)}" ${line(pen, featureInk(pen), 2.4)}/><path d="M${x(-7)} ${y(-5.4)}Q${x(0)} ${y(-7.8)} ${x(7)} ${y(-5.4)}Q${x(8.4)} ${y(4)} ${x(0)} ${y(7.8)}Q${x(-8.4)} ${y(4)} ${x(-7)} ${y(-5.4)}Z" fill="#15131f" ${outlined(pen, 2.2)}/>${spadeAt({ x: centre.x, y: centre.y + 0.6 * scale }, 6 * scale, PAPER)}`;
};

export type Coverage = "Opaque" | "Clear" | "Patch" | "Bare";

export const COVERAGE: Readonly<Record<Eyewear, Coverage>> = {
  Aviators: "Opaque",
  Eyepatch: "Patch",
  Monocle: "Clear",
  None: "Bare",
  Round: "Opaque",
  Shades: "Opaque",
  Specs: "Clear",
  Stars: "Opaque",
  Wraps: "Opaque",
};

export const EYEWEAR_ART: Readonly<
  Record<Eyewear, (frame: Frame, glint: Glint) => string>
> = {
  Aviators: aviators,
  Eyepatch: eyepatch,
  Monocle: monocle,
  None: () => "",
  Round: roundShades,
  Shades: wayfarers,
  Specs: specs,
  Stars: stars,
  Wraps: wraps,
};

export const worn = (frame: Frame, wear: Wear, body: string) => {
  const pivot = `${num(50)} ${num(frame.eye.y)}`;

  const moves = [
    wear.shift.x === 0 && wear.shift.y === 0
      ? ""
      : `translate(${at(wear.shift)})`,
    wear.tilt === 0 ? "" : `rotate(${num(wear.tilt)} ${pivot})`,
  ]
    .filter((move) => move !== "")
    .join(" ");

  return moves === "" ? body : `<g transform="${moves}">${body}</g>`;
};

const drapeAt = (neck: Point, t: number): Point => {
  const start = { x: neck.x, y: neck.y - 9 };
  const control = { x: 50, y: neck.y + 15 };
  const end = { x: 100 - neck.x, y: neck.y - 9 };
  const u = 1 - t;

  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  };
};

const LINKS = 14;

const goldChain = (pen: Pen, neck: Point) => {
  const links = Array.from({ length: LINKS + 1 }, (_, index) => {
    const t = index / LINKS;
    const here = drapeAt(neck, t);
    const ahead = drapeAt(neck, Math.min(1, t + 0.01));
    const behind = drapeAt(neck, Math.max(0, t - 0.01));

    const turn =
      (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;

    const flat = index % 2 === 0;

    return `<ellipse cx="${num(here.x)}" cy="${num(here.y)}" rx="${flat ? "2.9" : "2.4"}" ry="${flat ? "1.9" : "1.5"}" transform="rotate(${num(flat ? turn : turn + 90)} ${at(here)})" fill="${flat ? GOLD : GOLD_DEEP}" ${outlined(pen, 1.3)}/>`;
  });

  return (
    links.filter((_, index) => index % 2 === 1).join("") +
    links.filter((_, index) => index % 2 === 0).join("")
  );
};

const medallion = (pen: Pen, neck: Point) => {
  const centre = { x: 50, y: neck.y + 6.4 };

  return `${goldChain(pen, neck)}<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="7.4" fill="${GOLD}" ${outlined(pen, 2.2)}/><circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="5.2" ${line(pen, GOLD_DEEP, 1.2)}/>${spadeAt(centre, 6.6, GOLD_DEEP)}<path d="M${num(centre.x - 4.6)} ${num(centre.y - 2.4)}A5.4 5.4 0 0 1 ${num(centre.x - 1.6)} ${num(centre.y - 5.2)}" ${line(pen, GOLD_LIGHT, 1.3)}/>`;
};

const bolo = (pen: Pen, neck: Point) => {
  const slide = { x: 50, y: neck.y - 0.4 };
  const cord = `M${num(neck.x + 3)} ${num(neck.y - 9)}Q${num(slide.x - 6)} ${num(slide.y - 2)} ${num(slide.x)} ${num(slide.y)}Q${num(slide.x + 6)} ${num(slide.y - 2)} ${num(100 - neck.x - 3)} ${num(neck.y - 9)}M${num(slide.x - 1.4)} ${num(slide.y + 4)}L${num(slide.x - 2.6)} ${num(slide.y + 13)}M${num(slide.x + 1.4)} ${num(slide.y + 4)}L${num(slide.x + 2.6)} ${num(slide.y + 13)}`;

  return `<path d="${cord}" ${line(pen, INK, 2)}/><path d="M${num(slide.x - 2.6)} ${num(slide.y + 12.4)}V${num(slide.y + 15.4)}M${num(slide.x + 2.6)} ${num(slide.y + 12.4)}V${num(slide.y + 15.4)}" ${line(pen, "#c9ced9", 2.4)}/><ellipse cx="${num(slide.x)}" cy="${num(slide.y)}" rx="5.2" ry="6" fill="#d6dbe6" ${outlined(pen, 2)}/><ellipse cx="${num(slide.x)}" cy="${num(slide.y)}" rx="3.2" ry="4" fill="#33c9c0"/><path d="M${num(slide.x - 1.4)} ${num(slide.y - 2.2)}L${num(slide.x - 0.2)} ${num(slide.y - 3)}" ${line(pen, PAPER, 1.1)}/>`;
};

const bowtie = (pen: Pen, neck: Point) => {
  const y = neck.y - 3;

  return `<path d="M50 ${num(y)}L39 ${num(y - 6)}Q36.5 ${num(y)} 39 ${num(y + 6)}ZM50 ${num(y)}L61 ${num(y - 6)}Q63.5 ${num(y)} 61 ${num(y + 6)}Z" fill="${CARD_RED}" ${outlined(pen, 2.2)}/><rect x="46.6" y="${num(y - 3.4)}" width="6.8" height="6.8" rx="2" fill="#b0233a" ${outlined(pen, 2)}/>`;
};

const HOODIE = "#3d4460";

const HOODIE_DEEP = "#2a2f45";

const hoodie = (pen: Pen, neck: Point) => {
  const top = neck.y - 6;

  return `<path d="M4 104L9 ${num(top + 10)}C13 ${num(top + 1)} 30 ${num(top - 3)} 50 ${num(top)}C70 ${num(top - 3)} 87 ${num(top + 1)} 91 ${num(top + 10)}L96 104Z" fill="${HOODIE}" ${outlined(pen, 2.5)}/><path d="M22 ${num(top + 1)}C30 ${num(top + 9)} 70 ${num(top + 9)} 78 ${num(top + 1)}" ${line(pen, HOODIE_DEEP, 3.6)}/><path d="M43 ${num(top + 6)}L42 ${num(top + 17)}M57 ${num(top + 6)}L58 ${num(top + 17)}" ${line(pen, PAPER, 1.8)}/>${spadeAt({ x: 50, y: top + 15 }, 6, NEON)}`;
};

const pearls = (pen: Pen, neck: Point) =>
  Array.from({ length: 13 }, (_, index) => {
    const bead = drapeAt(neck, index / 12);

    return `<circle cx="${num(bead.x)}" cy="${num(bead.y)}" r="2.6" fill="${PAPER}" ${outlined(pen, 1.3)}/><circle cx="${num(bead.x - 0.8)}" cy="${num(bead.y - 0.8)}" r="0.8" fill="#ffffff"/>`;
  }).join("");

export const NECKWEAR_ART: Readonly<
  Record<Neckwear, (pen: Pen, neck: Point) => string>
> = {
  Bolo: bolo,
  Bowtie: bowtie,
  Chain: goldChain,
  Hoodie: hoodie,
  Medallion: medallion,
  None: () => "",
  Pearls: pearls,
};

export const MOUTH_PROPS: ReadonlySet<Extra> = new Set([
  "Toothpick",
  "Cigar",
  "Lollipop",
]);

const WOOD = "#e9c27f";

const CIGAR = "#7b4a2b";

export const heldInMouth = (
  pen: Pen,
  extra: Extra,
  corner: Point,
  turn: number
) => {
  const place = (body: string) =>
    `<g transform="translate(${at(corner)}) rotate(${num(turn)})">${body}</g>`;

  if (extra === "Toothpick") {
    return place(
      `<path d="M-1 0.4L12 -1.6" ${line(pen, INK, 3.4)}/><path d="M-1 0.4L12 -1.6" ${line(pen, WOOD, 1.6)}/>`
    );
  }

  if (extra === "Cigar") {
    const smoke = pen.small
      ? ""
      : `<path d="M15.4 -3.4C18 -6 13.6 -8 16 -11C18 -13.4 15 -15 16.6 -17.4" ${line(pen, "#d5d7e3", 1.6)} stroke-opacity="0.85"/>`;

    return place(
      `<rect x="-1.4" y="-2.3" width="15.4" height="4.6" rx="2.2" fill="${CIGAR}" ${outlined(pen, 1.8)}/><path d="M3 -2.1V2.1" ${line(pen, GOLD, 2.2)}/><path d="M13 -1.8V1.8" ${line(pen, "#ff7a3d", 2)}/>${smoke}`
    );
  }

  if (extra === "Lollipop") {
    return place(
      `<path d="M-1 0L8.6 -2.4" ${line(pen, INK, 2.8)}/><path d="M-1 0L8.6 -2.4" ${line(pen, PAPER, 1.4)}/><circle cx="12" cy="-3.4" r="4.8" fill="#ff5fa0" ${outlined(pen, 1.8)}/><path d="M12 -3.4m-2.4 0a2.4 2.4 0 1 1 2.4 2.4" ${line(pen, PAPER, 1.4)}/>`
    );
  }

  return "";
};

export const hoop = (pen: Pen, side: Point) =>
  `<circle cx="${num(side.x + 1.2)}" cy="${num(side.y + 7)}" r="5.2" ${line(pen, INK, 4.2)}/><circle cx="${num(side.x + 1.2)}" cy="${num(side.y + 7)}" r="5.2" ${line(pen, GOLD, 2.2)}/>`;

const BANDAID = "#f2c398";

export const bandaid = (pen: Pen, eye: Point, scale: number) => {
  const centre = { x: 100 - eye.x + 5 * scale, y: eye.y - 14 * scale };

  const strip = (turn: number) =>
    `<rect x="-6.4" y="-2" width="12.8" height="4" rx="2" fill="${BANDAID}" transform="rotate(${num(turn)})" ${outlined(pen, 1.5)}/>`;

  return `<g transform="translate(${at(centre)})">${strip(32)}${strip(-32)}<rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="0.8" fill="#e3a77a"/></g>`;
};

export const tuckedAce = (pen: Pen, side: Point) => {
  const x = side.x + 1;
  const y = side.y - 22;

  return `<g transform="rotate(-20 ${num(x + 5)} ${num(y + 7)})"><rect x="${num(x)}" y="${num(y)}" width="11" height="15" rx="1.8" fill="${PAPER}" ${outlined(pen, 1.8)}/>${spadeAt({ x: x + 5.5, y: y + 7.2 }, 7, INK)}<path d="M${num(x + 2.4)} ${num(y + 2)}V${num(y + 4.4)}" ${line(pen, CARD_RED, 1.2)}/></g>`;
};
