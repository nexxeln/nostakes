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
  readonly potStacked: boolean;
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
  readonly readout: Pt & { readonly align: "center" | "right" };
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

const READOUT_DEPTH = 0.72;

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

const BET_ABOVE_BOARD = 16;

const tallSeat = (
  p: TrackPoint,
  cx: number,
  tile: number,
  board: Box
): SeatGeo => {
  const side = sideOf(p, cx);

  const bet =
    side === "top"
      ? {
          x: p.x,
          y: Math.min(
            p.y + tile * 0.8 + CAPTION + 36,
            Math.max(
              p.y + tile / 2 + CAPTION + BET_ABOVE_BOARD,
              board.y - BET_ABOVE_BOARD
            )
          ),
        }
      : { x: p.x + p.nx * (tile * 0.5 + 24), y: p.y + tile * 0.2 + p.ny * 26 };

  return { bet, nx: p.nx, ny: p.ny, side, x: p.x, y: p.y };
};

export const HAND_HINT = { gap: 4, h: 34, w: 240 };

const RING_REACH = 10;

const FACE_RISE = 0.15;

const HERO_ROW_ROOM = 44;

const POT_STACKED_MIN = 50;

const POT_STACKED_MAX = 66;

const POT_FLAT_H = 24;

const POT_ABOVE_BOARD = 10;

const POT_FLAT_ABOVE_BOARD = 3;

const POT_MARGIN = 4;

const SELF_ABOVE_EDGE = 2;

const CAPTION_DEPTH = CAPTION + 6;

const GROUP_MARGIN = 12;

const potHeight = (stacked: boolean, cardW: number) =>
  stacked ? Math.min(POT_STACKED_MAX, cardW * 1.2) : POT_FLAT_H;

const potGap = (stacked: boolean) =>
  stacked ? POT_ABOVE_BOARD : POT_FLAT_ABOVE_BOARD;

const tallGeo = (w: number, h: number, count: number): Geo => {
  const sizes = tallSizes(w);
  const cx = w / 2;
  const handH = sizes.handCardW * 1.4;
  const hand = { x: cx, y: h - sizes.bottomInset - handH / 2 - 18 };
  const heroTop = hand.y - handH / 2 - HERO_ROW_ROOM;

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
    potStacked: true,
    railTop,
    readout: boardInStrip
      ? {
          align: "center",
          x: cx,
          y: TOP + (middle.strip.y - TOP) * READOUT_DEPTH,
        }
      : { align: "right", x: chip.x - 170, y: (railTop + chip.y) / 2 - 40 },
    seats: middle.pts.map((p) => tallSeat(p, cx, middle.tile, middle.strip)),
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

const wideGeo = (w: number, h: number, count: number, lift: number): Geo => {
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
    y: sizes.compact
      ? h - SELF_ABOVE_EDGE - CAPTION_DEPTH - sizes.self / 2
      : hand.y + handH / 2 - CAPTION - sizes.self / 2 - 4,
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
  const potStacked = !sizes.compact && cardW * 1.2 >= POT_STACKED_MIN;
  const tabH = potHeight(potStacked, cardW);
  const boardY = oval.cy + (sizes.compact ? 6 : tile * 0.08) - lift;

  const boardTop = boardY - cardW * 0.7;
  const tabTop = boardTop - potGap(potStacked) - tabH;
  const pot = { x: cx, y: tabTop + tabH / 2 };
  const groupTop = tabTop - POT_MARGIN;
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
    potStacked,
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
      h: boardY + cardW * 0.7 + GROUP_MARGIN - groupTop,
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

export interface RunLane {
  readonly x: number;
  readonly y: number;
  readonly cardW: number;
  readonly gap: number;
}

const RUN_SCALES = [0.62, 0.52, 0.44, 0.36] as const;

const RUN_GAP = 4;

const RUN_MARGIN = 10;

const RUN_CROWDING_ALLOWED = 0.05;

const RUN_COVERING_YOURS = 40;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const outside = (box: Box, geo: Geo) =>
  box.w * box.h -
  overlap(box, { h: geo.h - geo.top, w: geo.w, x: 0, y: geo.top });

export const tableObstacles = (geo: Geo): readonly Box[] => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  return [
    ...geo.seats.map(({ x, y }) => ({
      h: geo.tile + geo.caption,
      w: geo.tile * 1.3,
      x: x - geo.tile * 0.65,
      y: y - geo.tile / 2,
    })),
    {
      h: geo.self.size + geo.caption,
      w: geo.self.size,
      x: geo.self.x - geo.self.size / 2,
      y: geo.self.y - geo.self.size / 2,
    },
    {
      h: handH + 30,
      w: handW,
      x: geo.hand.x - handW / 2,
      y: geo.hand.y - handH / 2 - 30,
    },
    {
      h: geo.chip.size,
      w: geo.chip.size,
      x: geo.chip.x - geo.chip.size / 2,
      y: geo.chip.y - geo.chip.size / 2,
    },
    geo.strip,
  ];
};

export const runLanesBox = (lanes: readonly RunLane[]): Box => {
  if (lanes.length === 0) {
    return { h: 0, w: 0, x: 0, y: 0 };
  }

  const left = Math.min(...lanes.map(({ x }) => x));
  const top = Math.min(...lanes.map(({ y }) => y));

  const right = Math.max(
    ...lanes.map(
      ({ cardW, gap, x }) => x + cardW * BOARD_CARDS + gap * (BOARD_CARDS - 1)
    )
  );

  const bottom = Math.max(...lanes.map(({ cardW, y }) => y + cardW * 1.4));

  return { h: bottom - top, w: right - left, x: left, y: top };
};

const runLanesArea = (lanes: readonly RunLane[]) => {
  const box = runLanesBox(lanes);

  return box.w * box.h;
};

type RunArrangement = "Stacked" | "SideBySide";

const RUN_ARRANGEMENTS: readonly RunArrangement[] = ["Stacked", "SideBySide"];

const RUN_SIDE_GAP = 12;

const arranged = (
  origin: Pt,
  rows: number,
  cardW: number,
  arrangement: RunArrangement
): readonly RunLane[] => {
  const rowW = cardW * BOARD_CARDS + RUN_GAP * (BOARD_CARDS - 1);

  return Array.from({ length: rows }, (_, row) => ({
    cardW,
    gap: RUN_GAP,
    x:
      origin.x +
      (arrangement === "SideBySide" ? row * (rowW + RUN_SIDE_GAP) : 0),
    y:
      origin.y +
      (arrangement === "Stacked" ? row * (cardW * 1.4 + RUN_GAP + 2) : 0),
  }));
};

const insideTable = (geo: Geo, lanes: readonly RunLane[]) => {
  const box = runLanesBox(lanes);
  const dx = clamp(0, -box.x, geo.w - box.x - box.w);
  const dy = clamp(0, geo.top - box.y, geo.h - box.y - box.h);

  return lanes.map((lane) => ({ ...lane, x: lane.x + dx, y: lane.y + dy }));
};

export const runLanes = (geo: Geo, rows: number): readonly RunLane[] => {
  if (rows === 0) {
    return [];
  }

  const group = geo.strip;
  const blocked = tableObstacles(geo);
  const cx = group.x + group.w / 2;
  const cy = group.y + group.h / 2;

  const tries = RUN_SCALES.flatMap((scale) =>
    RUN_ARRANGEMENTS.flatMap((arrangement) => {
      const cardW = Math.round(geo.cardW * scale);

      const { h, w } = runLanesBox(
        arranged({ x: 0, y: 0 }, rows, cardW, arrangement)
      );

      return [
        { x: cx - w / 2, y: group.y - RUN_MARGIN - h },
        { x: cx - w / 2, y: group.y + group.h + RUN_MARGIN },
        { x: group.x + group.w + RUN_MARGIN, y: cy - h / 2 },
        { x: group.x - RUN_MARGIN - w, y: cy - h / 2 },
      ].map((origin) => {
        const lanes = arranged(origin, rows, cardW, arrangement);
        const box = runLanesBox(lanes);
        let crowding = outside(box, geo) * RUN_COVERING_YOURS;

        for (const [index, other] of blocked.entries()) {
          crowding +=
            overlap(box, other) *
            (index < geo.seats.length ? 1 : RUN_COVERING_YOURS);
        }

        return { crowding, lanes };
      });
    })
  );

  const roomy = tries.find(
    ({ crowding, lanes }) =>
      crowding <= runLanesArea(lanes) * RUN_CROWDING_ALLOWED
  );

  let best = roomy ?? tries[0];

  for (const next of roomy === undefined ? tries : []) {
    if (best === undefined || next.crowding < best.crowding) {
      best = next;
    }
  }

  return insideTable(geo, best?.lanes ?? []);
};

const coveredBy = (box: Box, boxes: readonly Box[]) => {
  let total = 0;

  for (const other of boxes) {
    total += overlap(box, other);
  }

  return total;
};

const leastBy = <T>(items: readonly T[], cost: (item: T) => number) => {
  let best: { readonly item: T; readonly cost: number } | undefined;

  for (const item of items) {
    const next = cost(item);

    if (best === undefined || next < best.cost) {
      best = { cost: next, item };
    }
  }

  return best?.item;
};

const PILE_BOX = { h: 22, w: 44 };

const BUTTON_CLEARANCE = 2;

const BUTTON_STEP = 2;

const BUTTON_ANGLES = 72;

const OWNERSHIP_MARGIN = 6;

export interface ButtonSpot extends Pt {
  readonly r: number;
}

export interface ButtonSpots {
  readonly seats: readonly ButtonSpot[];
  readonly self: ButtonSpot;
}

interface Footprint {
  readonly centre: Pt;
  readonly boxes: readonly Box[];
  readonly seat: readonly Box[];
}

const footprintOf = (centre: Pt, size: number): Footprint => {
  const half = size / 2;
  const reach = half + RING_REACH;
  const captionHalf = Math.max(size * 0.65, half);

  const caption = {
    h: CAPTION_DEPTH,
    w: captionHalf * 2,
    x: centre.x - captionHalf,
    y: centre.y + half,
  };

  return {
    boxes: [
      {
        h: reach + half + size * FACE_RISE + RING_REACH,
        w: reach * 2,
        x: centre.x - reach,
        y: centre.y - half - size * FACE_RISE - RING_REACH,
      },
      caption,
    ],
    centre,
    seat: [
      { h: size, w: size, x: centre.x - half, y: centre.y - half },
      caption,
    ],
  };
};

const pileBox = (point: Pt): Box => ({
  h: PILE_BOX.h,
  w: PILE_BOX.w,
  x: point.x - PILE_BOX.w / 2,
  y: point.y - PILE_BOX.h / 2,
});

const gapTo = (point: Pt, box: Box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - box.x - box.w),
    Math.max(box.y - point.y, 0, point.y - box.y - box.h)
  );

const gapToSeat = (point: Pt, footprint: Footprint) =>
  Math.min(...footprint.seat.map((box) => gapTo(point, box)));

export const ownedBy = (own: number, other: number) =>
  other - own >= Math.max(OWNERSHIP_MARGIN, own / 2);

export const buttonRadius = (size: number) => clamp(size * 0.22, 14, 18);

interface Owner {
  readonly footprint: Footprint;
  readonly size: number;
  readonly inward: Pt;
}

const ownersOf = (geo: Geo): readonly Owner[] => [
  ...geo.seats.map(({ nx, ny, x, y }) => ({
    footprint: footprintOf({ x, y }, geo.tile),
    inward: { x: nx, y: ny },
    size: geo.tile,
  })),
  {
    footprint: footprintOf(geo.self, geo.self.size),
    inward: { x: 0.5, y: -Math.sqrt(3) / 2 },
    size: geo.self.size,
  },
];

const onTable = (geo: Geo, box: Box) =>
  box.x >= 0 &&
  box.y >= geo.top &&
  box.x + box.w <= geo.w &&
  box.y + box.h <= geo.h;

export type TagSide = "Before" | "After" | "Below" | "Above";

export const POST_TAG_HEIGHT = 20;

export const POST_TAG_WIDTHS = { narrow: 34, wide: 64 } as const;

const TAG_GAP = 4;

const PILE_HALF = { h: 11, w: 24 };

export const postTagBox = (pile: Pt, side: TagSide, width: number): Box => {
  const across = {
    Above: {
      x: pile.x - width / 2,
      y: pile.y - PILE_HALF.h - TAG_GAP - POST_TAG_HEIGHT,
    },
    After: {
      x: pile.x + PILE_HALF.w + TAG_GAP,
      y: pile.y - POST_TAG_HEIGHT / 2,
    },
    Before: {
      x: pile.x - PILE_HALF.w - TAG_GAP - width,
      y: pile.y - POST_TAG_HEIGHT / 2,
    },
    Below: { x: pile.x - width / 2, y: pile.y + PILE_HALF.h + TAG_GAP },
  }[side];

  return { ...across, h: POST_TAG_HEIGHT, w: width };
};

const TAG_PREFERENCES: Record<Side | "self", readonly TagSide[]> = {
  left: ["After", "Below", "Above", "Before"],
  right: ["Before", "Below", "Above", "After"],
  self: ["Before", "After", "Above", "Below"],
  top: ["Before", "After", "Below", "Above"],
};

const pilesOf = (geo: Geo) => [...geo.seats.map(({ bet }) => bet), geo.heroBet];

export interface PostTagGround {
  readonly own: readonly Box[];
  readonly others: readonly Box[];
}

export const postTagGround = (geo: Geo): readonly PostTagGround[] => {
  const piles = pilesOf(geo);
  const owners = ownersOf(geo);
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  const middle = [
    {
      h: handH,
      w: handW,
      x: geo.hand.x - handW / 2,
      y: geo.hand.y - handH / 2,
    },
    {
      h: geo.chip.size,
      w: geo.chip.size,
      x: geo.chip.x - geo.chip.size / 2,
      y: geo.chip.y - geo.chip.size / 2,
    },
    geo.strip,
  ];

  return piles.map((_, index) => ({
    others: [
      ...middle,
      ...owners
        .filter((__, other) => other !== index)
        .flatMap(({ footprint }) => footprint.seat),
      ...piles.filter((__, other) => other !== index).map(pileBox),
    ],
    own: owners[index]?.footprint.seat ?? [],
  }));
};

const OTHERS_WEIGH = 4;

export const postTagSides = (geo: Geo, width: number): readonly TagSide[] => {
  const grounds = postTagGround(geo);

  return pilesOf(geo).map((pile, index) => {
    const preferred = TAG_PREFERENCES[geo.seats[index]?.side ?? "self"];
    const ground = grounds[index] ?? { others: [], own: [] };

    const crowding = (side: TagSide) => {
      const box = postTagBox(pile, side, width);
      const offTable = onTable(geo, box) ? 0 : box.w * box.h;

      return (
        (coveredBy(box, ground.others) + offTable) * OTHERS_WEIGH +
        coveredBy(box, ground.own)
      );
    };

    return leastBy(preferred, crowding) ?? "Before";
  });
};

const HINT_STEP = 2;

const HINT_RISE = 48;

export const HINT_LINES = { foot: 14, footW: 176, say: 18, sayW: 212 };

export interface HandHint {
  readonly say: Box;
  readonly foot: Box;
  readonly stacked: boolean;
  readonly onCards: boolean;
}

const faceAndName = (footprint: Footprint): readonly Box[] => {
  const [face, name] = footprint.seat;

  return face === undefined || name === undefined
    ? footprint.boxes
    : [
        {
          ...face,
          h: face.h + face.w * FACE_RISE,
          y: face.y - face.w * FACE_RISE,
        },
        name,
      ];
};

export const handHintGround = (geo: Geo): readonly Box[] => [
  geo.strip,
  ...ownersOf(geo).flatMap(({ footprint }, index, all) =>
    index === all.length - 1 ? faceAndName(footprint) : footprint.boxes
  ),
  ...geo.seats.map(({ bet }) => pileBox(bet)),
  {
    h: geo.chip.size,
    w: geo.chip.size,
    x: geo.chip.x - geo.chip.size / 2,
    y: geo.chip.y - geo.chip.size / 2,
  },
];

const handTopOf = (geo: Geo) => geo.hand.y - (geo.handCardW * 1.4) / 2;

const handBottomOf = (geo: Geo) => geo.hand.y + (geo.handCardW * 1.4) / 2;

const crowdingIn = (geo: Geo, blocked: readonly Box[], box: Box) =>
  coveredBy(box, blocked) + (onTable(geo, box) ? 0 : box.w * box.h);

const nearestClear = (
  geo: Geo,
  blocked: readonly Box[],
  start: Box,
  rises: number
): Box | undefined => {
  let best: { readonly box: Box; readonly cost: number } | undefined;

  for (let rise = 0; rise <= rises; rise += HINT_STEP) {
    for (let shift = 0; shift <= geo.w / 2; shift += HINT_STEP) {
      for (const side of shift === 0 ? [0] : [-1, 1]) {
        const box = { ...start, x: start.x + side * shift, y: start.y - rise };
        const cost = shift + rise * 2;

        if (
          (best === undefined || cost < best.cost) &&
          crowdingIn(geo, blocked, box) === 0
        ) {
          best = { box, cost };
        }
      }
    }
  }

  return best?.box;
};

export const handHint = (geo: Geo): HandHint => {
  const w = Math.min(HAND_HINT.w, geo.w - 16);
  const blocked = handHintGround(geo);
  const x = geo.hand.x - w / 2;
  const top = handTopOf(geo) - HAND_HINT.gap;

  const together = nearestClear(
    geo,
    blocked,
    { h: HAND_HINT.h, w, x, y: top - HAND_HINT.h },
    HINT_RISE
  );

  if (together !== undefined) {
    return {
      foot: {
        h: HINT_LINES.foot,
        w,
        x: together.x,
        y: together.y + HAND_HINT.h - HINT_LINES.foot,
      },
      onCards: false,
      say: { h: HINT_LINES.say, w, x: together.x, y: together.y },
      stacked: true,
    };
  }

  const sayW = Math.min(HINT_LINES.sayW, w);
  const footW = Math.min(HINT_LINES.footW, w);

  const sayAt = {
    h: HINT_LINES.say,
    w: sayW,
    x: geo.hand.x - sayW / 2,
    y: top - HINT_LINES.say,
  };

  const footAt = {
    h: HINT_LINES.foot,
    w: footW,
    x: geo.hand.x - footW / 2,
    y: handBottomOf(geo) + HAND_HINT.gap / 2,
  };

  const foot = nearestClear(geo, blocked, footAt, 0) ?? footAt;
  const above = nearestClear(geo, blocked, sayAt, HINT_RISE);

  if (above !== undefined) {
    return { foot, onCards: false, say: above, stacked: false };
  }

  const selfRight = geo.self.x + geo.self.size * 0.65 + HAND_HINT.gap;
  const chipLeft = geo.chip.x - geo.chip.size / 2 - HAND_HINT.gap;

  return {
    foot,
    onCards: true,
    say: {
      h: HINT_LINES.say * 2,
      w: chipLeft - selfRight,
      x: selfRight,
      y: handTopOf(geo) + HAND_HINT.gap / 2,
    },
    stacked: false,
  };
};

export const handHintBox = (geo: Geo): Box => {
  const { foot, say } = handHint(geo);
  const top = Math.min(say.y, foot.y);
  const left = Math.min(say.x, foot.x);

  return {
    h: Math.max(say.y + say.h, foot.y + foot.h) - top,
    w: Math.max(say.x + say.w, foot.x + foot.w) - left,
    x: left,
    y: top,
  };
};

const middleObstacles = (geo: Geo): readonly Box[] => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  return [
    ...pilesOf(geo).map(pileBox),
    handHintBox(geo),
    {
      h: handH + 30,
      w: handW,
      x: geo.hand.x - handW / 2,
      y: geo.hand.y - handH / 2 - 30,
    },
    {
      h: geo.chip.size,
      w: geo.chip.size,
      x: geo.chip.x - geo.chip.size / 2,
      y: geo.chip.y - geo.chip.size / 2,
    },
    geo.strip,
  ];
};

const tagObstacles = (geo: Geo): readonly Box[] => {
  const sides = postTagSides(geo, POST_TAG_WIDTHS.narrow);

  return pilesOf(geo).map((pile, index) =>
    postTagBox(pile, sides[index] ?? "Before", POST_TAG_WIDTHS.narrow)
  );
};

const sharedObstacles = (geo: Geo): readonly Box[] => [
  ...middleObstacles(geo),
  ...tagObstacles(geo),
];

export interface ButtonGround {
  readonly own: readonly Box[];
  readonly ownSeat: readonly Box[];
  readonly others: readonly Box[];
  readonly tags: readonly Box[];
  readonly untouchable: readonly Box[];
}

export const buttonGround = (geo: Geo): readonly ButtonGround[] => {
  const middle = middleObstacles(geo);
  const tags = tagObstacles(geo);
  const owners = ownersOf(geo);

  return owners.map((owner) => {
    const rivals = owners.filter((other) => other !== owner);

    return {
      others: [
        ...middle,
        ...rivals.flatMap(({ footprint }) => footprint.boxes),
      ],
      own: owner.footprint.boxes,
      ownSeat: owner.footprint.seat,
      tags,
      untouchable: [
        ...middle,
        ...rivals.flatMap(({ footprint }) => footprint.seat),
      ].filter((box) =>
        owner.footprint.seat.every((mine) => overlap(box, mine) === 0)
      ),
    };
  });
};

export const buttonBox = (spot: ButtonSpot): Box => ({
  h: 2 * (spot.r + BUTTON_CLEARANCE),
  w: 2 * (spot.r + BUTTON_CLEARANCE),
  x: spot.x - spot.r - BUTTON_CLEARANCE,
  y: spot.y - spot.r - BUTTON_CLEARANCE,
});

const crowdingOf = (geo: Geo, blocked: readonly Box[], spot: ButtonSpot) => {
  const box = buttonBox(spot);
  const offTable = onTable(geo, box) ? 0 : box.w * box.h;

  return coveredBy(box, blocked) + offTable;
};

const around = (centre: Pt, reach: number, angle: number): Pt => ({
  x: centre.x + Math.cos(angle) * reach,
  y: centre.y + Math.sin(angle) * reach,
});

const MIN_BUTTON_RADIUS = 11;

const onTheFelt = (
  geo: Geo,
  owner: Owner,
  rivals: readonly Footprint[],
  blocked: readonly Box[],
  r: number
): ButtonSpot | undefined => {
  const { centre } = owner.footprint;
  const nearest = owner.size / 2 + RING_REACH + r;
  const farthest = owner.size / 2 + CAPTION + r * 4 + 40;
  const facing = Math.atan2(owner.inward.y, owner.inward.x);
  let best: { readonly spot: ButtonSpot; readonly cost: number } | undefined;

  for (let reach = nearest; reach <= farthest; reach += BUTTON_STEP) {
    for (let step = 0; step < BUTTON_ANGLES; step += 1) {
      const turn = (step / BUTTON_ANGLES) * 2 * Math.PI;
      const spot = { ...around(centre, reach, facing + turn), r };
      const own = gapToSeat(spot, owner.footprint);
      const bend = Math.min(turn, 2 * Math.PI - turn);
      const cost = own + bend * owner.size * 0.35;

      if (
        (best === undefined || cost < best.cost) &&
        crowdingOf(geo, blocked, spot) === 0 &&
        rivals.every((rival) => ownedBy(own, gapToSeat(spot, rival)))
      ) {
        best = { cost, spot };
      }
    }
  }

  return best?.spot;
};

const CORNER_INSETS = [0.25, 0.9] as const;

const onTheTile = (
  geo: Geo,
  owner: Owner,
  ground: ButtonGround
): ButtonSpot => {
  const r = MIN_BUTTON_RADIUS;
  const { centre } = owner.footprint;
  const toward = owner.inward.x < 0 ? -1 : 1;
  const edge = r + BUTTON_CLEARANCE;

  const corners = CORNER_INSETS.flatMap((inset) =>
    [-1, 1].flatMap((up) =>
      [toward, -toward].map((side) => {
        const half = owner.size / 2 - r * inset;

        return {
          r,
          x: clamp(centre.x + side * half, edge, geo.w - edge),
          y: clamp(centre.y + up * half, geo.top + edge, geo.h - edge),
        };
      })
    )
  );

  const crowding = (spot: ButtonSpot) =>
    crowdingOf(geo, ground.untouchable, spot) * geo.w * geo.h +
    crowdingOf(geo, ground.others, spot);

  return (
    leastBy(corners, crowding) ?? {
      r,
      x: clamp(centre.x, edge, geo.w - edge),
      y: clamp(centre.y, geo.top + edge, geo.h - edge),
    }
  );
};

const feltSpotsAt = (
  geo: Geo,
  owners: readonly Owner[],
  grounds: readonly ButtonGround[],
  r: number
): readonly (ButtonSpot | undefined)[] =>
  owners.map((owner, index) => {
    const ground = grounds[index];
    const firm = [...(ground?.others ?? []), ...(ground?.own ?? [])];

    const rivals = owners.flatMap((other) =>
      other === owner ? [] : [other.footprint]
    );

    const loose = [...(ground?.others ?? []), ...owner.footprint.seat];

    return (
      onTheFelt(geo, owner, rivals, [...firm, ...(ground?.tags ?? [])], r) ??
      onTheFelt(geo, owner, rivals, firm, r) ??
      onTheFelt(geo, owner, rivals, loose, r)
    );
  });

const missing = (spots: readonly (ButtonSpot | undefined)[]) =>
  spots.filter((spot) => spot === undefined).length;

export const buttonSpots = (geo: Geo): ButtonSpots => {
  const owners = ownersOf(geo);
  const grounds = buttonGround(geo);
  const smallest = feltSpotsAt(geo, owners, grounds, MIN_BUTTON_RADIUS);
  let felt = smallest;

  for (let r = buttonRadius(geo.tile); r > MIN_BUTTON_RADIUS; r -= 1) {
    const tried = feltSpotsAt(geo, owners, grounds, r);

    if (missing(tried) <= missing(smallest)) {
      felt = tried;
      break;
    }
  }

  const spots = owners.map(
    (owner, index) =>
      felt[index] ??
      onTheTile(
        geo,
        owner,
        grounds[index] ?? {
          others: [],
          own: [],
          ownSeat: [],
          tags: [],
          untouchable: [],
        }
      )
  );

  return {
    seats: spots.slice(0, -1),
    self: spots.at(-1) ?? { ...geo.self, r: MIN_BUTTON_RADIUS },
  };
};

export const deadButtonSpot = (
  geo: Geo,
  before: ButtonSpot,
  after: ButtonSpot
): ButtonSpot => {
  const r = Math.min(before.r, after.r);
  const seats = ownersOf(geo).map(({ footprint }) => footprint);

  const blocked = [
    ...sharedObstacles(geo),
    ...seats.flatMap(({ boxes }) => boxes),
  ];

  const middle = { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };

  for (let reach = 0; reach <= geo.tile * 2; reach += BUTTON_STEP) {
    for (let step = 0; step < BUTTON_ANGLES; step += 1) {
      const spot = {
        ...around(middle, reach, (step / BUTTON_ANGLES) * 2 * Math.PI),
        r,
      };

      if (
        crowdingOf(geo, blocked, spot) === 0 &&
        seats.every((seat) => gapToSeat(spot, seat) >= r * 2)
      ) {
        return spot;
      }
    }
  }

  return { ...middle, r };
};

export interface PotTab {
  readonly h: number;
  readonly stacked: boolean;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

export const potTabOf = (geo: Geo): PotTab => {
  if (geo.boardInStrip) {
    return {
      h: geo.strip.h - 20,
      stacked: true,
      w: 2 * (geo.pot.x - geo.strip.x) - 18,
      x: geo.pot.x,
      y: geo.pot.y,
    };
  }

  const h = potHeight(geo.potStacked, geo.cardW);
  const boardTop = (geo.board[0]?.y ?? geo.pot.y) - geo.cardW * 0.7;

  return {
    h,
    stacked: geo.potStacked,
    w: Math.min(88, geo.cardW * 1.6),
    x: geo.pot.x,
    y: boardTop - potGap(geo.potStacked) - h / 2,
  };
};

const BOARD_LIFT_STEP = 4;

const BOARD_LIFT_MOST = 64;

const hintCrowding = (geo: Geo) => {
  const { foot, onCards, say, stacked } = handHint(geo);
  const blocked = handHintGround(geo);
  const apart = stacked ? 0 : 1;

  return (
    crowdingIn(geo, blocked, say) +
    crowdingIn(geo, blocked, foot) +
    apart +
    (onCards ? 1 : 0)
  );
};

const boardCrowding = (geo: Geo) =>
  coveredBy(geo.strip, [
    ...ownersOf(geo).flatMap(({ footprint }) => footprint.seat),
    ...geo.seats.map(({ bet }) => pileBox(bet)),
  ]);

const liftedForHint = (w: number, h: number, count: number): Geo => {
  const level = wideGeo(w, h, count, 0);

  if (hintCrowding(level) === 0) {
    return level;
  }

  const crowded = boardCrowding(level);

  for (
    let lift = BOARD_LIFT_STEP;
    lift <= BOARD_LIFT_MOST;
    lift += BOARD_LIFT_STEP
  ) {
    const lifted = wideGeo(w, h, count, lift);

    if (boardCrowding(lifted) > crowded) {
      break;
    }

    if (hintCrowding(lifted) === 0) {
      return lifted;
    }
  }

  return level;
};

export const computeGeo = (w: number, h: number, count: number): Geo =>
  w > h * WIDE_RATIO
    ? liftedForHint(w, h, Math.max(1, count))
    : tallGeo(w, h, Math.max(1, count));
