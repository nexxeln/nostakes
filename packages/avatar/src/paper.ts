export type Point = readonly [number, number];

export type Polygon = readonly Point[];

export const fmt = (value: number): string => String(Number(value.toFixed(2)));

const PARK_MILLER_MODULUS = 2_147_483_647;

const PARK_MILLER_MULTIPLIER = 16_807;

export const seeded = (seed: number): (() => number) => {
  const state = {
    value: (Math.abs(Math.floor(seed)) % (PARK_MILLER_MODULUS - 1)) + 1,
  };

  return () => {
    state.value = (state.value * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;

    return (state.value - 1) / (PARK_MILLER_MODULUS - 1);
  };
};

export const seedOf = (points: Polygon): number =>
  points.reduce(
    (sum, [x, y], index) => sum + (x * 131 + y * 71) * (index + 3),
    17
  );

export const between = (
  random: () => number,
  low: number,
  high: number
): number => low + (high - low) * random();

export const centroid = (points: Polygon): Point => {
  const count = Math.max(points.length, 1);

  return [
    points.reduce((sum, [x]) => sum + x, 0) / count,
    points.reduce((sum, [, y]) => sum + y, 0) / count,
  ];
};

const boxArea = (points: Polygon): number => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return (
    (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  );
};

const at = (points: Polygon, index: number): Point =>
  points[((index % points.length) + points.length) % points.length] ?? [0, 0];

const cornerAngle = (points: Polygon, index: number): number => {
  const [px, py] = at(points, index - 1);
  const [x, y] = at(points, index);
  const [nx, ny] = at(points, index + 1);
  const ax = px - x;
  const ay = py - y;
  const bx = nx - x;
  const by = ny - y;

  const cosine =
    (ax * bx + ay * by) /
    Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 0.0001);

  return (Math.acos(Math.min(Math.max(cosine, -1), 1)) * 180) / Math.PI;
};

const SMOOTH_HANDLE = 0.2;

const SHARP_CHANCE = 0.12;

const SHARPEST_SMOOTH_CORNER = 80;

const smoothCut = (
  points: Polygon,
  seed: number,
  pinned: ReadonlySet<number>
): string => {
  const random = seeded(seed);

  const handles = points.map((_, index) =>
    cornerAngle(points, index) < SHARPEST_SMOOTH_CORNER ||
    random() < SHARP_CHANCE ||
    pinned.has(index)
      ? 0
      : SMOOTH_HANDLE
  );

  const segments = points.map((point, index) => {
    const next = at(points, index + 1);
    const before = at(points, index - 1);
    const after = at(points, index + 2);
    const out = handles[index] ?? 0;
    const into = handles[(index + 1) % points.length] ?? 0;

    return `C${fmt(point[0] + (next[0] - before[0]) * out)} ${fmt(point[1] + (next[1] - before[1]) * out)} ${fmt(next[0] - (after[0] - point[0]) * into)} ${fmt(next[1] - (after[1] - point[1]) * into)} ${fmt(next[0])} ${fmt(next[1])}`;
  });

  const first = at(points, 0);

  return `M${fmt(first[0])} ${fmt(first[1])}${segments.join("")}Z`;
};

const roundedCut = (points: Polygon, radius: number): string => {
  const corners = points.map((point, index) => {
    const before = at(points, index - 1);
    const next = at(points, index + 1);
    const inLength = Math.hypot(point[0] - before[0], point[1] - before[1]);
    const outLength = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const r = Math.min(radius, inLength / 2.2, outLength / 2.2);

    const a: Point = [
      point[0] + ((before[0] - point[0]) / Math.max(inLength, 0.0001)) * r,
      point[1] + ((before[1] - point[1]) / Math.max(inLength, 0.0001)) * r,
    ];

    const b: Point = [
      point[0] + ((next[0] - point[0]) / Math.max(outLength, 0.0001)) * r,
      point[1] + ((next[1] - point[1]) / Math.max(outLength, 0.0001)) * r,
    ];

    return [a, point, b] as const;
  });

  const start = corners[0]?.[2] ?? [0, 0];

  const body = [...corners.slice(1), ...corners.slice(0, 1)]
    .map(
      ([a, point, b]) =>
        `L${fmt(a[0])} ${fmt(a[1])}Q${fmt(point[0])} ${fmt(point[1])} ${fmt(b[0])} ${fmt(b[1])}`
    )
    .join("");

  return `M${fmt(start[0])} ${fmt(start[1])}${body}Z`;
};

const ROUND_POINTS = 12;

const BIG_SHEET = 900;

const SMALL_CORNER = 1.8;

const BLOB_CORNER = 1000;

export const cutPath = (
  points: Polygon,
  seed: number,
  pinned: ReadonlySet<number>
): string => {
  if (points.length >= ROUND_POINTS && pinned.size === 0) {
    return roundedCut(points, BLOB_CORNER);
  }

  return boxArea(points) > BIG_SHEET
    ? smoothCut(points, seed, pinned)
    : roundedCut(points, SMALL_CORNER);
};

export const turnPoint = (
  point: Point,
  degrees: number,
  about: Point
): Point => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point[0] - about[0];
  const dy = point[1] - about[1];

  return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos];
};

export interface Clipped {
  readonly points: Polygon;
  readonly pinned: ReadonlySet<number>;
}

const crossing = (a: Point, b: Point, line: number): Point => {
  const t = (line - a[1]) / (b[1] - a[1]);

  return [a[0] + (b[0] - a[0]) * t, line];
};

export const clipBelow = (points: Polygon, line: number): Clipped => {
  const kept: Point[] = [];
  const pinned = new Set<number>();

  for (const [index, point] of points.entries()) {
    const next = at(points, index + 1);
    const inside = point[1] >= line;

    if (inside) {
      kept.push(point);
    }

    if (inside !== next[1] >= line) {
      pinned.add(kept.length);
      kept.push(crossing(point, next, line));
    }
  }

  return { pinned, points: kept };
};

export const foldDown = (points: Polygon, line: number): Clipped =>
  clipBelow(
    points.map(([x, y]): Point => [x, 2 * line - y]),
    line
  );

export const circle = (centre: Point, radius: number): Polygon =>
  Array.from({ length: 12 }, (_, index): Point => [
    centre[0] + radius * Math.cos((index * Math.PI) / 6),
    centre[1] + radius * Math.sin((index * Math.PI) / 6),
  ]);

export const band = (from: Point, to: Point, width: number): Polygon => {
  const length = Math.max(Math.hypot(to[0] - from[0], to[1] - from[1]), 0.001);
  const nx = (-(to[1] - from[1]) / length) * (width / 2);
  const ny = ((to[0] - from[0]) / length) * (width / 2);

  return [
    [from[0] + nx, from[1] + ny],
    [to[0] + nx, to[1] + ny],
    [to[0] - nx, to[1] - ny],
    [from[0] - nx, from[1] - ny],
  ];
};
