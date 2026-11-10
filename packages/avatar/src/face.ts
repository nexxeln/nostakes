import type { Expression, Eyes, Mouth } from "./avatar.js";
import {
  BLUSH,
  GOLD,
  INK,
  MOUTH_INSIDE,
  PAPER,
  SNOW,
  TEAR,
  TONGUE,
} from "./palette.js";
import { featureInk, line, num, outlined } from "./pen.js";
import type { Pen, Point } from "./pen.js";
import type { Jaw } from "./species.js";

export interface Face {
  readonly pen: Pen;
  readonly style: Eyes;
  readonly eye: Point;
  readonly scale: number;
}

const rightEye = (face: Face): Point => ({
  x: 100 - face.eye.x,
  y: face.eye.y,
});

const ring = (pen: Pen) =>
  pen.skin.dark ? ` stroke="${SNOW}" stroke-width="${pen.width(1.2)}"` : "";

const shine = (x: number, y: number, radius: number) =>
  `<circle cx="${num(x)}" cy="${num(y)}" r="${num(radius)}" fill="${PAPER}"/>`;

const LOOK_AHEAD: Point = { x: 0, y: 0 };

const LOOK_UP_AND_AWAY: Point = { x: 1.6, y: -1.9 };

const LOOK_AWAY: Point = { x: 2, y: 0.4 };

const openEye = (face: Face, centre: Point, look: Point, left: boolean) => {
  const s = face.scale;
  const { pen } = face;
  const x = centre.x + look.x * s;
  const y = centre.y + look.y * s;

  if (face.style === "Wide") {
    const px = centre.x + look.x * 1.9 * s;
    const py = centre.y + look.y * 1.9 * s;

    return `<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(6.9 * s)}" fill="${PAPER}" ${outlined(pen, 2)}/><circle cx="${num(px)}" cy="${num(py + 0.4 * s)}" r="${num(3.5 * s)}" fill="${INK}"/>${shine(px + 1.2 * s, py - 1 * s, 1.2 * s)}`;
  }

  if (face.style === "Beady") {
    return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(3.3 * s)}" fill="${INK}"${ring(pen)}/>${shine(x + 1.1 * s, y - 1.2 * s, 1.1 * s)}`;
  }

  if (face.style === "Sleepy") {
    return `<path d="M${num(x - 5.6 * s)} ${num(y - 0.6 * s)}A${num(5.6 * s)} ${num(6 * s)} 0 0 0 ${num(x + 5.6 * s)} ${num(y - 0.6 * s)}Z" fill="${INK}"${ring(pen)}/><path d="M${num(x - 6.8 * s)} ${num(y - 0.4 * s)}Q${num(x)} ${num(y - 2.6 * s)} ${num(x + 6.8 * s)} ${num(y - 0.8 * s)}" ${line(pen, featureInk(pen), 2.6)}/>${shine(x + 2 * s, y + 1.6 * s, 1.3 * s)}`;
  }

  if (face.style === "Sharp") {
    const side = left ? 1 : -1;
    const ix = (dx: number) => num(x + dx * side * s);

    return `<path d="M${ix(-6)} ${num(y - 2.8 * s)}L${ix(5.6)} ${num(y + 0.6 * s)}Q${ix(4.6)} ${num(y + 5.8 * s)} ${ix(-0.4)} ${num(y + 5.6 * s)}Q${ix(-6.2)} ${num(y + 5 * s)} ${ix(-6)} ${num(y - 2.8 * s)}Z" fill="${INK}"${ring(pen)}/><path d="M${ix(-7.8)} ${num(y - 4.2 * s)}L${ix(5.8)} ${num(y + 0.4 * s)}" ${line(pen, featureInk(pen), 2.4)}/>${shine(x + 0.8 * side * s, y + 2 * s, 1.3 * s)}`;
  }

  return `<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(5.4 * s)}" ry="${num(6.4 * s)}" fill="${INK}"${ring(pen)}/>${shine(x + 1.8 * s, y - 2.3 * s, 2.1 * s)}${shine(x - 1.6 * s, y + 2.6 * s, 0.9 * s)}`;
};

const downEye = (face: Face, centre: Point) => {
  const s = face.scale;
  const { pen } = face;
  const { x } = centre;
  const y = centre.y + 1.2 * s;
  const wide = face.style === "Beady" ? 3.6 : 5.4;
  const lid = `<path d="M${num(x - (wide + 1.4) * s)} ${num(y - 0.6 * s)}Q${num(x)} ${num(y + 1.6 * s)} ${num(x + (wide + 1.4) * s)} ${num(y - 0.6 * s)}" ${line(pen, featureInk(pen), 2.5)}/>`;

  if (face.style === "Wide") {
    return `<path d="M${num(x - 6.9 * s)} ${num(y)}A${num(6.9 * s)} ${num(6.9 * s)} 0 0 0 ${num(x + 6.9 * s)} ${num(y)}Q${num(x)} ${num(y + 1.6 * s)} ${num(x - 6.9 * s)} ${num(y)}Z" fill="${PAPER}" ${outlined(pen, 2)}/><circle cx="${num(x)}" cy="${num(y + 3.9 * s)}" r="${num(2.6 * s)}" fill="${INK}"/>${lid}`;
  }

  return `<path d="M${num(x - wide * s)} ${num(y)}Q${num(x)} ${num(y + 1.6 * s)} ${num(x + wide * s)} ${num(y)}A${num(wide * s)} ${num(wide * 0.95 * s)} 0 0 1 ${num(x - wide * s)} ${num(y)}Z" fill="${INK}"${ring(pen)}/>${lid}${shine(x + 1.5 * s, y + 2.8 * s, 0.9 * s)}`;
};

const happyEye = (face: Face, centre: Point) => {
  const s = face.scale;

  return `<path d="M${num(centre.x - 5.2 * s)} ${num(centre.y + 2 * s)}Q${num(centre.x)} ${num(centre.y - 5 * s)} ${num(centre.x + 5.2 * s)} ${num(centre.y + 2 * s)}" ${line(face.pen, featureInk(face.pen), 2.8)}/>`;
};

const closedEye = (face: Face, centre: Point) => {
  const s = face.scale;

  return `<path d="M${num(centre.x - 5.2 * s)} ${num(centre.y + 0.6 * s)}Q${num(centre.x)} ${num(centre.y + 4.4 * s)} ${num(centre.x + 5.2 * s)} ${num(centre.y + 0.6 * s)}" ${line(face.pen, featureInk(face.pen), 2.5)}/>`;
};

const wetEye = (face: Face, centre: Point) => {
  const s = face.scale;
  const { x, y } = centre;

  return `<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(5.6 * s)}" ry="${num(6.6 * s)}" fill="${INK}"${ring(face.pen)}/>${shine(x + 1.8 * s, y - 2.4 * s, 2.2 * s)}${shine(x - 1.7 * s, y + 2.8 * s, 1.4 * s)}${shine(x + 2.4 * s, y + 2.9 * s, 0.75 * s)}`;
};

export const tearUnder = (pen: Pen, centre: Point, scale: number) => {
  const x = centre.x + 4.4 * scale;
  const y = centre.y + 6.4 * scale;

  return `<path d="M${num(x)} ${num(y)}C${num(x - 2.6)} ${num(y + 3.6)} ${num(x - 2.8)} ${num(y + 6.4)} ${num(x)} ${num(y + 6.4)}C${num(x + 2.8)} ${num(y + 6.4)} ${num(x + 2.6)} ${num(y + 3.6)} ${num(x)} ${num(y)}Z" fill="${TEAR}" ${outlined(pen, 1.3)}/>`;
};

type BrowMood = "Style" | "Raised" | "Worried" | "Relaxed" | "Focused";

const browLine = (
  face: Face,
  centre: Point,
  lift: number,
  path: (x: number, y: number, side: number) => string
) => {
  const side = centre.x < 50 ? 1 : -1;
  const y = centre.y - lift * face.scale;
  const thick = face.style === "Beady" || face.style === "Sharp" ? 3 : 2.5;

  return `<path d="${path(centre.x, y, side)}" ${line(face.pen, featureInk(face.pen), thick)}/>`;
};

const STYLE_LIFT: Readonly<Record<Eyes, number>> = {
  Beady: 8.4,
  Round: 10.4,
  Sharp: 8.8,
  Sleepy: 7.6,
  Wide: 11.4,
};

const styleBrow =
  (face: Face, drop: number) => (x: number, y: number, side: number) => {
    const s = face.scale;
    const d = (value: number) => num(x + value * side * s);
    const yy = y + drop;

    if (face.style === "Sharp") {
      return `M${d(-5.4)} ${num(yy - 2 * s)}L${d(5)} ${num(yy + 1.6 * s)}`;
    }

    if (face.style === "Beady") {
      return `M${d(-5)} ${num(yy - 0.9 * s)}L${d(4.8)} ${num(yy + 0.7 * s)}`;
    }

    if (face.style === "Sleepy") {
      return `M${d(-5.4)} ${num(yy + 0.2 * s)}Q${d(0)} ${num(yy - 0.8 * s)} ${d(5.2)} ${num(yy + 0.4 * s)}`;
    }

    return `M${d(-4.6)} ${num(yy + 0.8 * s)}Q${d(0)} ${num(yy - 1.8 * s)} ${d(4.6)} ${num(yy + 0.4 * s)}`;
  };

export const brows = (face: Face, mood: BrowMood, lifted: number) => {
  const left = face.eye;
  const right = rightEye(face);
  const s = face.scale;
  const lift = Math.max(STYLE_LIFT[face.style], lifted);

  if (mood === "Raised") {
    return (
      browLine(face, left, lift - 0.6, styleBrow(face, 1.2 * s)) +
      browLine(
        face,
        right,
        lift + 3,
        (x, y) =>
          `M${num(x - 4.8 * s)} ${num(y + 1.2 * s)}Q${num(x)} ${num(y - 3 * s)} ${num(x + 5 * s)} ${num(y)}`
      )
    );
  }

  if (mood === "Worried") {
    const worried = (x: number, y: number, side: number) =>
      `M${num(x - 5 * side * s)} ${num(y + 1.4 * s)}Q${num(x)} ${num(y + 0.2 * s)} ${num(x + 4.6 * side * s)} ${num(y - 2.6 * s)}`;

    return (
      browLine(face, left, lift, worried) + browLine(face, right, lift, worried)
    );
  }

  if (mood === "Relaxed") {
    const relaxed = (x: number, y: number) =>
      `M${num(x - 4.8 * s)} ${num(y + 0.6 * s)}Q${num(x)} ${num(y - 0.6 * s)} ${num(x + 4.8 * s)} ${num(y + 0.6 * s)}`;

    return (
      browLine(face, left, lift - 0.4, relaxed) +
      browLine(face, right, lift - 0.4, relaxed)
    );
  }

  const drop = mood === "Focused" ? 1.6 * s : 0;

  return (
    browLine(face, left, lift, styleBrow(face, drop)) +
    browLine(face, right, lift, styleBrow(face, drop))
  );
};

export const EYES_BY_EXPRESSION: Readonly<
  Record<Expression, (face: Face) => string>
> = {
  Folded: (face) => closedEye(face, face.eye) + closedEye(face, rightEye(face)),
  Gutted: (face) => wetEye(face, face.eye) + wetEye(face, rightEye(face)),
  Happy: (face) => happyEye(face, face.eye) + happyEye(face, rightEye(face)),
  LookingDown: (face) =>
    downEye(face, face.eye) + downEye(face, rightEye(face)),
  Resting: (face) =>
    openEye(face, face.eye, LOOK_AHEAD, true) +
    openEye(face, rightEye(face), LOOK_AHEAD, false),
  Thinking: (face) =>
    openEye(face, face.eye, LOOK_UP_AND_AWAY, true) +
    openEye(face, rightEye(face), LOOK_UP_AND_AWAY, false),
};

export const BROWS_BY_EXPRESSION: Readonly<Record<Expression, BrowMood>> = {
  Folded: "Relaxed",
  Gutted: "Worried",
  Happy: "Relaxed",
  LookingDown: "Focused",
  Resting: "Style",
  Thinking: "Raised",
};

export const LOOKS: Readonly<Record<Expression, Point>> = {
  Folded: LOOK_AWAY,
  Gutted: LOOK_AHEAD,
  Happy: LOOK_AHEAD,
  LookingDown: LOOK_AHEAD,
  Resting: LOOK_AHEAD,
  Thinking: LOOK_UP_AND_AWAY,
};

export interface Lips {
  readonly pen: Pen;
  readonly at: Point;
  readonly scale: number;
  readonly style: Mouth;
  readonly jaw: Jaw;
}

const mouthGrid = (lips: Lips) => ({
  x: (dx: number) => num(lips.at.x + dx * lips.scale),
  y: (dy: number) => num(lips.at.y + dy * Math.min(lips.scale, 1.15)),
});

const ink = (lips: Lips, width: number) =>
  line(lips.pen, featureInk(lips.pen), width);

const LIP = "#ff7f9a";

const RESTING_MOUTHS: Readonly<Record<Mouth, (lips: Lips) => string>> = {
  Fangs: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-4.6)} ${y(1)}L${x(-3.2)} ${y(4.6)}L${x(-1.8)} ${y(1.5)}ZM${x(4.6)} ${y(1)}L${x(3.2)} ${y(4.6)}L${x(1.8)} ${y(1.5)}Z" fill="${PAPER}" ${outlined(lips.pen, 1.2)}/><path d="M${x(-6.4)} ${y(-0.4)}Q${x(0)} ${y(3)} ${x(6.4)} ${y(-0.4)}" ${ink(lips, 2.3)}/>`;
  },
  GoldTooth: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-6.8)} ${y(-1)}Q${x(0)} ${y(1.2)} ${x(6.8)} ${y(-1.6)}Q${x(5.4)} ${y(5.4)} ${x(0)} ${y(5.4)}Q${x(-5.4)} ${y(5.2)} ${x(-6.8)} ${y(-1)}Z" fill="${MOUTH_INSIDE}" ${outlined(lips.pen, 1.9)}/><path d="M${x(-5.8)} ${y(-0.2)}Q${x(0)} ${y(1.6)} ${x(5.8)} ${y(-0.7)}L${x(5.2)} ${y(1.8)}Q${x(0)} ${y(3.6)} ${x(-5.2)} ${y(2)}Z" fill="${PAPER}"/><path d="M${x(1.1)} ${y(0.7)}H${x(3.7)}V${y(3.1)}H${x(1.1)}Z" fill="${GOLD}" ${outlined(lips.pen, 0.9)}/>`;
  },
  Grin: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-8)} ${y(-1.6)}Q${x(0)} ${y(1.6)} ${x(8)} ${y(-1.6)}Q${x(6.6)} ${y(6)} ${x(0)} ${y(6.2)}Q${x(-6.6)} ${y(6)} ${x(-8)} ${y(-1.6)}Z" fill="${PAPER}" ${outlined(lips.pen, 2)}/><path d="M${x(-6.6)} ${y(1.6)}L${x(-4.95)} ${y(3.7)}L${x(-3.3)} ${y(2.1)}L${x(-1.65)} ${y(4.1)}L${x(0)} ${y(2.3)}L${x(1.65)} ${y(4.1)}L${x(3.3)} ${y(2.1)}L${x(4.95)} ${y(3.7)}L${x(6.6)} ${y(1.6)}" ${line(lips.pen, INK, 1.2)}/>`;
  },
  Poker: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-5.6)} ${y(1.4)}L${x(5.6)} ${y(0.6)}" ${ink(lips, 2.6)}/>`;
  },
  Pout: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<ellipse cx="${x(0)}" cy="${y(1.6)}" rx="${num(4.2 * Math.min(lips.scale, 1.1))}" ry="3.7" fill="${LIP}" ${outlined(lips.pen, 1.9)}/><ellipse cx="${x(0)}" cy="${y(1.7)}" rx="${num(1.7 * Math.min(lips.scale, 1.1))}" ry="1.3" fill="${MOUTH_INSIDE}"/>`;
  },
  Smirk: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-6)} ${y(0.6)}Q${x(0)} ${y(3.4)} ${x(6.4)} ${y(-2.4)}" ${ink(lips, 2.5)}/><path d="M${x(5.6)} ${y(-4.2)}Q${x(7.2)} ${y(-2.6)} ${x(7.4)} ${y(-0.6)}" ${ink(lips, 1.8)}/>`;
  },
};

const happyMouth = (lips: Lips) => {
  const { x, y } = mouthGrid(lips);

  const gold =
    lips.style === "GoldTooth"
      ? `<path d="M${x(1.9)} ${y(-0.9)}L${x(3.8)} ${y(-1.2)}L${x(2.85)} ${y(3.6)}Z" fill="${GOLD}" ${outlined(lips.pen, 0.9)}/>`
      : "";

  return `<path d="M${x(-9)} ${y(-2.2)}Q${x(0)} ${y(0)} ${x(9)} ${y(-2.2)}Q${x(8)} ${y(10)} ${x(0)} ${y(10.4)}Q${x(-8)} ${y(10)} ${x(-9)} ${y(-2.2)}Z" fill="${MOUTH_INSIDE}" ${outlined(lips.pen, 2)}/><path d="M${x(-4.6)} ${y(8.6)}Q${x(0)} ${y(5.4)} ${x(4.6)} ${y(8.6)}Q${x(2.6)} ${y(10.1)} ${x(0)} ${y(10.1)}Q${x(-2.6)} ${y(10.1)} ${x(-4.6)} ${y(8.6)}Z" fill="${TONGUE}"/><path d="M${x(-8.2)} ${y(-1.6)}Q${x(0)} ${y(0.4)} ${x(8.2)} ${y(-1.6)}L${x(7.6)} ${y(0.4)}L${x(5.7)} ${y(3.6)}L${x(3.8)} ${y(1.2)}L${x(1.9)} ${y(3.8)}L${x(0)} ${y(1.4)}L${x(-1.9)} ${y(3.8)}L${x(-3.8)} ${y(1.2)}L${x(-5.7)} ${y(3.6)}L${x(-7.6)} ${y(0.4)}Z" fill="${PAPER}" ${outlined(lips.pen, 1)}/>${gold}`;
};

export const MOUTHS_BY_EXPRESSION: Readonly<
  Record<Expression, (lips: Lips) => string>
> = {
  Folded: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-4.2)} ${y(2.2)}Q${x(0)} ${y(0.4)} ${x(4.2)} ${y(2.2)}" ${ink(lips, 2.4)}/>`;
  },
  Gutted: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-7)} ${y(4.2)}Q${x(-5)} ${y(0)} ${x(-2.5)} ${y(2.2)}Q${x(0)} ${y(0)} ${x(2.5)} ${y(2.2)}Q${x(5)} ${y(0)} ${x(7)} ${y(4.2)}" ${ink(lips, 2.4)}/>`;
  },
  Happy: happyMouth,
  LookingDown: (lips) => RESTING_MOUTHS[lips.style](lips),
  Resting: (lips) => RESTING_MOUTHS[lips.style](lips),
  Thinking: (lips) => {
    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-1.6)} ${y(2.2)}Q${x(1.2)} ${y(0.4)} ${x(3.8)} ${y(2)}Q${x(6.2)} ${y(3.6)} ${x(8.2)} ${y(1.4)}" ${ink(lips, 2.4)}/>`;
  },
};

export const tellingSmile = (lips: Lips) => {
  const { x, y } = mouthGrid(lips);

  return `<path d="M${x(-5.4)} ${y(-0.4)}Q${x(0)} ${y(5.6)} ${x(5.4)} ${y(-0.4)}Q${x(0)} ${y(2.2)} ${x(-5.4)} ${y(-0.4)}Z" fill="${MOUTH_INSIDE}" ${outlined(lips.pen, 2)}/>`;
};

export const JAWS: Readonly<
  Record<Jaw, (lips: Lips, expression: Expression) => string>
> = {
  Fangs: (lips, expression) => {
    const { x, y } = mouthGrid(lips);
    const base = expression === "Happy" ? 9.6 : 4.2;
    const tip = expression === "Happy" ? 5.6 : -0.6;

    return `<path d="M${x(-6.4)} ${y(base)}L${x(-4.9)} ${y(tip)}L${x(-3.4)} ${y(base)}ZM${x(6.4)} ${y(base)}L${x(4.9)} ${y(tip)}L${x(3.4)} ${y(base)}Z" fill="${PAPER}" ${outlined(lips.pen, 1.2)}/>`;
  },
  Needles: (lips, expression) => {
    if (expression === "Happy") {
      return "";
    }

    const { x, y } = mouthGrid(lips);

    return `<path d="M${x(-5)} ${y(0.6)}L${x(-4.2)} ${y(4.6)}L${x(-3.4)} ${y(0.8)}ZM${x(5)} ${y(0.2)}L${x(4.2)} ${y(4.2)}L${x(3.4)} ${y(0.4)}Z" fill="${PAPER}" ${outlined(lips.pen, 1)}/>`;
  },
  Plain: () => "",
};

export interface Corner {
  readonly at: Point;
  readonly turn: number;
}

export const mouthCorner = (lips: Lips, expression: Expression): Corner => {
  const point = (dx: number, dy: number): Point => ({
    x: lips.at.x + dx * lips.scale,
    y: lips.at.y + dy * Math.min(lips.scale, 1.15),
  });

  const corners: Readonly<Record<Expression, Corner>> = {
    Folded: { at: point(4.2, 2), turn: 24 },
    Gutted: { at: point(6.6, 3.4), turn: 40 },
    Happy: { at: point(8.6, -1.4), turn: -26 },
    LookingDown: { at: point(6, -0.6), turn: 8 },
    Resting: { at: point(6, -1), turn: -8 },
    Thinking: { at: point(8, 1.4), turn: 0 },
  };

  return corners[expression];
};

export const blush = (cheek: Point, opacity: number) =>
  `<ellipse cx="${num(cheek.x)}" cy="${num(cheek.y)}" rx="5.4" ry="3.2" fill="${BLUSH}" fill-opacity="${num(opacity)}"/><ellipse cx="${num(100 - cheek.x)}" cy="${num(cheek.y)}" rx="5.4" ry="3.2" fill="${BLUSH}" fill-opacity="${num(opacity)}"/>`;
