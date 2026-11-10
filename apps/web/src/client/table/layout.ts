export interface Pt {
  readonly x: number;
  readonly y: number;
}

export type Side = "left" | "top" | "right";

export interface SeatGeo extends Pt {
  readonly nx: number;
  readonly ny: number;
  readonly bet: Pt;
  readonly side: Side;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Geo {
  readonly w: number;
  readonly h: number;
  readonly top: number;
  readonly tile: number;
  readonly caption: number;
  readonly seats: readonly SeatGeo[];
  readonly interior: Pt;
  readonly table: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
  };
  readonly strip: Box;
  readonly boardInStrip: boolean;
  readonly pot: Pt;
  readonly banner: Pt;
  readonly board: readonly Pt[];
  readonly cardW: number;
  readonly deck: Pt;
  readonly heroBet: Pt;
  readonly hand: Pt;
  readonly handCardW: number;
  readonly self: Pt & { readonly size: number };
  readonly chip: Pt & { readonly size: number };
  readonly railTop: number;
  readonly readout: Pt & { readonly align: "left" | "right" };
  readonly keys: Pt;
  readonly handKeys: Pt;
  readonly zone: { readonly top: number; readonly bottom: number };
}

interface TrackPoint extends Pt {
  readonly nx: number;
  readonly ny: number;
}

interface Track {
  readonly pts: readonly TrackPoint[];
  readonly cum: readonly number[];
  readonly len: number;
}

const BOARD_CARDS = 5;

const CAPTION = 40;

const MAX_TILE = 170;

const TOP = 12;

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const track = (pts: readonly TrackPoint[]): Track => {
  const cum = [0];

  for (let index = 1; index < pts.length; index += 1) {
    const here = pts[index];
    const before = pts[index - 1];
    const sofar = cum[index - 1] ?? 0;

    cum.push(
      here && before
        ? sofar + Math.hypot(here.x - before.x, here.y - before.y)
        : sofar
    );
  }

  return { cum, len: cum.at(-1) ?? 0, pts };
};

const ORIGIN: TrackPoint = { nx: 0, ny: 1, x: 0, y: 0 };

const between = (a: TrackPoint, b: TrackPoint, u: number): TrackPoint => {
  const nx = a.nx + (b.nx - a.nx) * u;
  const ny = a.ny + (b.ny - a.ny) * u;
  const length = Math.hypot(nx, ny) || 1;

  return {
    nx: nx / length,
    ny: ny / length,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  };
};

const at = (t: Track, distance: number): TrackPoint => {
  const first = t.pts[0] ?? ORIGIN;
  const last = t.pts.at(-1) ?? ORIGIN;

  if (distance <= 0) {
    return first;
  }

  if (distance >= t.len) {
    return last;
  }

  let low = 0;
  let high = t.cum.length - 1;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);

    if ((t.cum[mid] ?? 0) < distance) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const startAt = t.cum[low] ?? 0;
  const span = Math.max(1e-6, (t.cum[high] ?? 0) - startAt);

  return between(
    t.pts[low] ?? first,
    t.pts[high] ?? last,
    (distance - startAt) / span
  );
};

const STEPS = 24;

const stadium = (
  left: number,
  right: number,
  top: number,
  bottom: number,
  radius: number
): Track => {
  const pts: TrackPoint[] = [];
  const quarter = Math.PI / 2;

  for (let index = 0; index <= STEPS; index += 1) {
    pts.push({
      nx: 1,
      ny: 0,
      x: left,
      y: bottom - ((bottom - top - radius) * index) / STEPS,
    });
  }

  for (let index = 1; index <= STEPS; index += 1) {
    const angle = Math.PI - (index / STEPS) * quarter;

    pts.push({
      nx: -Math.cos(angle),
      ny: Math.sin(angle),
      x: left + radius + Math.cos(angle) * radius,
      y: top + radius - Math.sin(angle) * radius,
    });
  }

  for (let index = 1; index <= STEPS; index += 1) {
    pts.push({
      nx: 0,
      ny: 1,
      x: left + radius + ((right - left - 2 * radius) * index) / STEPS,
      y: top,
    });
  }

  for (let index = 1; index <= STEPS; index += 1) {
    const angle = quarter - (index / STEPS) * quarter;

    pts.push({
      nx: -Math.cos(angle),
      ny: Math.sin(angle),
      x: right - radius + Math.cos(angle) * radius,
      y: top + radius - Math.sin(angle) * radius,
    });
  }

  for (let index = 1; index <= STEPS; index += 1) {
    pts.push({
      nx: -1,
      ny: 0,
      x: right,
      y: top + radius + ((bottom - top - radius) * index) / STEPS,
    });
  }

  return track(pts);
};

const ARC_STEPS = 360;

const ellipseArc = (
  centre: Pt,
  rx: number,
  ry: number,
  from: number,
  to: number
): Track => {
  const pts: TrackPoint[] = [];

  for (let index = 0; index <= ARC_STEPS; index += 1) {
    const angle = from + ((to - from) * index) / ARC_STEPS;
    const x = centre.x + Math.cos(angle) * rx;
    const y = centre.y + Math.sin(angle) * ry;
    const nx = -(x - centre.x) / (rx * rx);
    const ny = -(y - centre.y) / (ry * ry);
    const length = Math.hypot(nx, ny) || 1;

    pts.push({ nx: nx / length, ny: ny / length, x, y });
  }

  return track(pts);
};

const insetFor = (count: number) => {
  if (count <= 3) {
    return 0.5;
  }

  return count <= 5 ? 0.25 : 0;
};

const spread = (t: Track, count: number): readonly TrackPoint[] => {
  if (count === 1) {
    return [at(t, t.len / 2)];
  }

  const inset = insetFor(count);

  return Array.from({ length: count }, (_, index) =>
    at(t, (t.len * (index + inset)) / (count - 1 + 2 * inset))
  );
};

const MIN_TILE = 48;

const fitTile = (pts: readonly Pt[], cap: number) => {
  let tile = cap;

  for (let index = 1; index < pts.length; index += 1) {
    const here = pts[index] ?? ORIGIN;
    const before = pts[index - 1] ?? ORIGIN;
    const byX = Math.abs(here.x - before.x) - 10;
    const byY = Math.abs(here.y - before.y) - CAPTION - 10;

    tile = Math.min(tile, Math.max(byX, byY));
  }

  return Math.max(MIN_TILE, tile);
};

const footprintReach = (dx: number, dy: number, tile: number) => {
  const half = tile / 2;
  const down = half + CAPTION;
  const tx = Math.abs(dx) > 1e-6 ? half / Math.abs(dx) : Infinity;
  const below = dy > 0 ? down : half;
  const ty = Math.abs(dy) > 1e-6 ? below / Math.abs(dy) : Infinity;

  return Math.min(tx, ty);
};

const sideOf = (p: TrackPoint, cx: number): Side => {
  if (p.ny > 0.7) {
    return "top";
  }

  return p.x < cx ? "left" : "right";
};

interface HeroRow {
  readonly selfX: number;
  readonly chipX: number;
  readonly handW: number;
}

const heroRow = (
  w: number,
  pad: number,
  sizes: {
    readonly handCardW: number;
    readonly self: number;
    readonly chip: number;
    readonly gap: number;
  }
): HeroRow => {
  const cx = w / 2;
  const handW = sizes.handCardW * 1.5 + 24;

  return {
    chipX: Math.min(
      w - pad - sizes.chip / 2 - 4,
      cx + handW / 2 + sizes.gap + sizes.chip / 2
    ),
    handW,
    selfX: Math.max(
      pad + sizes.self / 2 + 4,
      cx - handW / 2 - sizes.gap - sizes.self / 2
    ),
  };
};

const ITERATIONS = 8;

interface Solved {
  readonly tile: number;
  readonly t: Track;
  readonly pts: readonly TrackPoint[];
}

const solveStadium = (
  w: number,
  pad: number,
  count: number,
  cap: number,
  bottom: number
): Solved => {
  let tile = cap;
  let t = stadium(0, 0, 0, 0, 0);
  let pts: readonly TrackPoint[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const yTop = TOP + tile / 2 + 6;
    const yBottom = Math.max(yTop + tile * 0.6, bottom - tile / 2 - CAPTION);

    t = stadium(pad + tile / 2, w - pad - tile / 2, yTop, yBottom, tile * 0.55);
    pts = spread(t, count);

    const next = Math.min(cap, fitTile(pts, cap));
    const settled = Math.abs(next - tile) < 0.5;

    tile = next;

    if (settled) {
      break;
    }
  }

  return { pts, t, tile };
};

const tallSizes = (w: number) =>
  w < 560
    ? {
        bottomInset: 22,
        chip: 84,
        compact: true,
        gap: 12,
        handCardW: clamp(w * 0.225, 64, 88),
        pad: 8,
        self: 68,
        tileCap: (w - 16) * 0.36,
      }
    : {
        bottomInset: 40,
        chip: 92,
        compact: false,
        gap: clamp(w * 0.05, 24, 64),
        handCardW: clamp(w * 0.13, 88, 120),
        pad: clamp(w * 0.03, 12, 32),
        self: 84,
        tileCap: clamp(w * 0.19, 120, 168),
      };

interface Middle {
  readonly tile: number;
  readonly pts: readonly TrackPoint[];
  readonly board: readonly Pt[];
  readonly cardW: number;
  readonly pot: Pt;
  readonly strip: Box;
  readonly interior: Pt;
  readonly banner: Pt;
  readonly deck: Pt;
}

const stripMiddle = (
  w: number,
  sizes: ReturnType<typeof tallSizes>,
  heroTop: number,
  count: number
): Middle => {
  const { pad } = sizes;
  const cx = w / 2;
  const cardW = Math.min(sizes.compact ? 48 : 64, (w - 2 * pad - 110) / 5.6);
  const gap = Math.max(5, cardW * 0.12);
  const stripH = cardW * 1.4 + 18;
  const stripY = heroTop - stripH + 4;

  const solved = solveStadium(
    w,
    pad,
    count,
    Math.min(MAX_TILE, sizes.tileCap),
    stripY - 16
  );

  const boardW = cardW * BOARD_CARDS + gap * (BOARD_CARDS - 1);
  const potW = sizes.compact ? 96 : 120;
  const groupW = Math.min(w - 2 * pad - 8, potW + boardW + 24);
  const x0 = cx - groupW / 2;
  const boardX0 = x0 + groupW - boardW - 12;
  const mid = stripY + stripH / 2;
  const firstY = solved.t.pts[0]?.y ?? mid;

  const interior = {
    x: cx,
    y: (firstY + TOP + solved.tile / 2) / 2 + solved.tile * 0.25,
  };

  return {
    banner: { x: cx, y: Math.max(interior.y, stripY - 74) },
    board: Array.from({ length: BOARD_CARDS }, (_, index) => ({
      x: boardX0 + cardW / 2 + index * (cardW + gap),
      y: mid,
    })),
    cardW,
    deck: { x: cx, y: stripY - 10 },
    interior,
    pot: { x: x0 + (boardX0 - x0) / 2, y: mid },
    pts: solved.pts,
    strip: { h: stripH, w: groupW + 8, x: x0 - 4, y: stripY },
    tile: solved.tile,
  };
};

const ovalMiddle = (w: number, inside: Solved, cardW: number): Middle => {
  const cx = w / 2;
  const gap = 8;
  const boardW = cardW * BOARD_CARDS + gap * (BOARD_CARDS - 1);
  const yTop = TOP + inside.tile / 2 + 6;
  const yBottom = inside.t.pts[0]?.y ?? yTop;

  const midY =
    (yTop + inside.tile / 2 + CAPTION + yBottom) / 2 + inside.tile * 0.3;

  const pot = { x: cx, y: midY - cardW * 0.7 - 40 };

  return {
    banner: { x: cx, y: pot.y - 12 },
    board: Array.from({ length: BOARD_CARDS }, (_, index) => ({
      x: cx - boardW / 2 + cardW / 2 + index * (cardW + gap),
      y: midY,
    })),
    cardW,
    deck: { x: cx, y: midY - cardW * 0.7 - 10 },
    interior: { x: cx, y: midY - cardW * 0.7 },
    pot,
    pts: inside.pts,
    strip: {
      h: midY + cardW * 0.7 + 12 - (pot.y - 30),
      w: boardW + 32,
      x: cx - boardW / 2 - 16,
      y: pot.y - 30,
    },
    tile: inside.tile,
  };
};

const tallSeat = (p: TrackPoint, cx: number, tile: number): SeatGeo => {
  const side = sideOf(p, cx);

  const bet =
    side === "top"
      ? { x: p.x, y: p.y + tile * 0.8 + CAPTION + 28 }
      : { x: p.x + p.nx * (tile * 0.5 + 24), y: p.y + tile * 0.2 + p.ny * 26 };

  return { bet, nx: p.nx, ny: p.ny, side, x: p.x, y: p.y };
};

const tallGeo = (w: number, h: number, count: number): Geo => {
  const sizes = tallSizes(w);
  const cx = w / 2;
  const handH = sizes.handCardW * 1.4;
  const hand = { x: cx, y: h - sizes.bottomInset - handH / 2 - 18 };
  const heroTop = hand.y - handH / 2 - 44;

  const row = heroRow(w, sizes.pad, {
    chip: sizes.chip,
    gap: sizes.gap,
    handCardW: sizes.handCardW,
    self: sizes.self,
  });

  const chip = {
    size: sizes.chip,
    x: row.chipX,
    y: h - sizes.bottomInset - sizes.chip / 2 - 8,
  };

  const self = {
    size: sizes.self,
    x: row.selfX,
    y: h - sizes.bottomInset - CAPTION - sizes.self / 2 - 2,
  };

  const inside = solveStadium(
    w,
    sizes.pad,
    count,
    Math.min(MAX_TILE, sizes.tileCap),
    heroTop - 12
  );

  const innerW = w - 2 * sizes.pad - 2 * inside.tile - 32;
  const cardInside = Math.min(76, (innerW - 32) / BOARD_CARDS);
  const boardInStrip = sizes.compact || cardInside < 54 || count >= 6;

  const middle = boardInStrip
    ? stripMiddle(w, sizes, heroTop, count)
    : ovalMiddle(w, inside, cardInside);

  const railTop = Math.max(
    TOP + 40,
    (boardInStrip ? middle.strip.y : heroTop) - 150
  );

  return {
    banner: middle.banner,
    board: middle.board,
    boardInStrip,
    caption: CAPTION,
    cardW: middle.cardW,
    chip,
    deck: middle.deck,
    h,
    hand,
    handCardW: sizes.handCardW,
    handKeys: { x: hand.x, y: hand.y + handH / 2 + 14 },
    heroBet: { x: cx, y: heroTop + 18 },
    interior: middle.interior,
    keys: { x: chip.x, y: chip.y + sizes.chip / 2 + 16 },
    pot: middle.pot,
    railTop,
    readout: boardInStrip
      ? { align: "left", x: 24, y: middle.strip.y + middle.strip.h / 2 }
      : { align: "right", x: chip.x - 170, y: (railTop + chip.y) / 2 - 40 },
    seats: middle.pts.map((p) => tallSeat(p, cx, middle.tile)),
    self,
    strip: middle.strip,
    table: {
      rx: w / 2 - sizes.pad - middle.tile * 0.5,
      ry: (heroTop - TOP) / 2,
      x: cx,
      y: (TOP + heroTop) / 2,
    },
    tile: middle.tile,
    top: TOP,
    w,
    zone: {
      bottom: boardInStrip ? middle.strip.y - 4 : heroTop + 20,
      top: TOP - 10,
    },
  };
};

const wideSizes = (w: number, h: number) =>
  h < 520
    ? {
        bottomInset: 10,
        chip: 68,
        compact: true,
        gap: 18,
        handCardW: clamp(h * 0.15, 48, 64),
        pad: 10,
        self: 52,
        tileCap: clamp(h * 0.19, 56, 76),
      }
    : {
        bottomInset: 40,
        chip: clamp(h * 0.1, 80, 96),
        compact: false,
        gap: clamp(w * 0.03, 28, 64),
        handCardW: clamp(Math.min(w * 0.075, h * 0.125), 72, 116),
        pad: clamp(w * 0.025, 16, 48),
        self: clamp(h * 0.095, 68, 96),
        tileCap: clamp(Math.min(w, h * 1.3) * 0.13, 96, 168),
      };

interface Oval {
  readonly tile: number;
  readonly pts: readonly TrackPoint[];
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

const solveOval = (
  w: number,
  h: number,
  count: number,
  sizes: ReturnType<typeof wideSizes>,
  hand: Pt,
  clusterHalf: number
): Oval => {
  const cap = Math.min(MAX_TILE, sizes.tileCap);
  let tile = cap;
  let pts: readonly TrackPoint[] = [];
  let cy = 0;
  let rx = 0;
  let ry = 0;

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const yTop = TOP + tile / 2 + 4;
    const yBottom = h - sizes.bottomInset - tile / 2 - CAPTION - 4;

    cy = (yTop + hand.y) / 2;
    ry = (hand.y - yTop) / 2;
    rx = w / 2 - sizes.pad - tile / 2 - 6;

    const byX = Math.acos(clamp(-(clusterHalf + tile / 2) / rx, -1, 1));
    const byY = Math.PI - Math.asin(clamp((yBottom - cy) / ry, -1, 1));
    const from = Math.max(byX, byY, Math.PI / 2 + 0.42);

    pts = spread(
      ellipseArc({ x: w / 2, y: cy }, rx, ry, from, 3 * Math.PI - from),
      count
    );

    const next = Math.min(cap, fitTile(pts, cap));
    const settled = Math.abs(next - tile) < 0.5;

    tile = next;

    if (settled) {
      break;
    }
  }

  return { cy, pts, rx, ry, tile };
};

const wideGeo = (w: number, h: number, count: number): Geo => {
  const sizes = wideSizes(w, h);
  const cx = w / 2;
  const handH = sizes.handCardW * 1.4;

  const hand = {
    x: cx,
    y: h - sizes.bottomInset - handH / 2 - (sizes.compact ? 6 : 12),
  };

  const heroTop = hand.y - handH / 2 - 30;

  const row = heroRow(w, sizes.pad, {
    chip: sizes.chip,
    gap: sizes.gap,
    handCardW: sizes.handCardW,
    self: sizes.self,
  });

  const chip = {
    size: sizes.chip,
    x: row.chipX,
    y: hand.y + handH / 2 - sizes.chip / 2 - 4,
  };

  const self = {
    size: sizes.self,
    x: row.selfX,
    y: hand.y + handH / 2 - CAPTION - sizes.self / 2 - 4,
  };

  const clusterHalf =
    row.handW / 2 +
    sizes.gap +
    Math.max(sizes.self, sizes.chip) +
    (sizes.compact ? 16 : 44);

  const oval = solveOval(w, h, count, sizes, hand, clusterHalf);
  const { tile } = oval;

  const table = {
    rx: oval.rx - tile * 0.66,
    ry: oval.ry - tile * 0.66,
    x: cx,
    y: oval.cy,
  };

  const cardW = sizes.compact
    ? clamp(table.ry * 0.36, 34, 44)
    : clamp(Math.min(table.rx * 0.16, table.ry * 0.36), 46, 92);

  const gap = Math.max(5, cardW * 0.12);
  const boardW = cardW * BOARD_CARDS + gap * (BOARD_CARDS - 1);
  const boardY = oval.cy + (sizes.compact ? 6 : tile * 0.08);
  const pot = { x: cx, y: boardY - cardW * 0.7 - (sizes.compact ? 22 : 40) };
  const groupTop = pot.y - (sizes.compact ? 18 : 30);
  const railLength = sizes.compact ? h - TOP - 120 : clamp(h * 0.4, 200, 360);
  const railTop = Math.max(TOP + 20, chip.y - 46 - railLength);

  return {
    banner: { x: cx, y: pot.y - 12 },
    board: Array.from({ length: BOARD_CARDS }, (_, index) => ({
      x: cx - boardW / 2 + cardW / 2 + index * (cardW + gap),
      y: boardY,
    })),
    boardInStrip: false,
    caption: CAPTION,
    cardW,
    chip,
    deck: { x: cx, y: boardY - cardW * 0.7 - 10 },
    h,
    hand,
    handCardW: sizes.handCardW,
    handKeys: { x: hand.x, y: hand.y + handH / 2 + 14 },
    heroBet: { x: cx, y: heroTop + 6 },
    interior: { x: cx, y: boardY },
    keys: { x: chip.x, y: chip.y + sizes.chip / 2 + 16 },
    pot,
    railTop,
    readout: {
      align: "right",
      x: chip.x - 170,
      y: (railTop + chip.y) / 2 - 30,
    },
    seats: oval.pts.map((p) => {
      const dx = cx - p.x;
      const dy = boardY - p.y;
      const length = Math.hypot(dx, dy) || 1;

      const reach =
        footprintReach(dx / length, dy / length, tile) +
        (sizes.compact ? 14 : 22);

      return {
        bet: { x: p.x + (dx / length) * reach, y: p.y + (dy / length) * reach },
        nx: p.nx,
        ny: p.ny,
        side: sideOf(p, cx),
        x: p.x,
        y: p.y,
      };
    }),
    self,
    strip: {
      h: boardY + cardW * 0.7 + 12 - groupTop,
      w: boardW + 32,
      x: cx - boardW / 2 - 16,
      y: groupTop,
    },
    table,
    tile,
    top: TOP,
    w,
    zone: { bottom: h - sizes.bottomInset + 6, top: TOP - 10 },
  };
};

const WIDE_RATIO = 1.08;

export const computeGeo = (w: number, h: number, count: number): Geo =>
  w > h * WIDE_RATIO
    ? wideGeo(w, h, Math.max(1, count))
    : tallGeo(w, h, Math.max(1, count));
