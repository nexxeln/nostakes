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
  readonly pileW: number;
  readonly laneW: number;
  readonly tabW: number;
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

const CAPTION_DEPTH = CAPTION + 6;

export const FACE_RISE = 0.175;

export const FACE_SPREAD = 0.045;

export const PIC_LIFT = 0.05;

export const CAPTION_INK = 43.5;

export const CAPTION_GAP = 3;

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

  return Math.max(Math.min(MIN_TILE, cap), tile);
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

type Spacing = "Column" | "Aside" | "AsideBelow" | "TopRow";

interface Room {
  readonly cap: number;
  readonly tabW: number;
  readonly laneW: number;
  readonly pileW: number;
  readonly round: number;
  readonly spacing: Spacing;
}

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
  bottom: number,
  round = 0
): Solved => {
  let tile = cap;
  let t = stadium(0, 0, 0, 0, 0);
  let pts: readonly TrackPoint[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const yTop = TOP + tile / 2 + 6;
    const yBottom = Math.max(yTop + tile * 0.6, bottom - tile / 2 - CAPTION);

    t = stadium(
      pad + tile / 2,
      w - pad - tile / 2,
      yTop,
      yBottom,
      Math.max(tile * 0.55, round)
    );
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
  readonly deck: Pt;
}

const stripMiddle = (
  w: number,
  sizes: ReturnType<typeof tallSizes>,
  heroTop: number,
  count: number,
  cap: number,
  round: number
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
    Math.min(MAX_TILE, sizes.tileCap, cap),
    stripY - 16,
    round
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

const aboveTheStrip = (strip: number, size: number, scale: number) =>
  strip - size / 2 - (CAPTION_INK + CAPTION_GAP) * scale;

const asideOfColumns = (
  pts: readonly TrackPoint[],
  reach: number,
  cx: number
): readonly TrackPoint[] =>
  pts.map((p) => {
    const under = pts.filter(
      (below) =>
        below.y > p.y &&
        Math.abs(below.x - p.x) < reach &&
        Math.abs(below.x - cx) > Math.abs(p.x - cx)
    );

    return under.length === 0
      ? p
      : {
          ...p,
          x:
            cx +
            Math.sign(p.x - cx) *
              Math.min(
                ...under.map(
                  (below) => Math.abs(below.x - cx) - reach - CAPTION_GAP
                )
              ),
        };
  });

const asideBelowColumns = (
  pts: readonly TrackPoint[],
  reach: number,
  cx: number
): readonly TrackPoint[] => {
  const lowestOfColumn = pts.map(
    (p) =>
      !pts.some((below) => below.y > p.y && Math.abs(below.x - p.x) < reach) &&
      pts.some((above) => above.y < p.y && Math.abs(above.x - p.x) < reach)
  );

  return pts.map((p, index) => {
    if (lowestOfColumn[index] !== true) {
      return p;
    }

    const over = pts.filter(
      (above) => above.y < p.y && Math.abs(above.x - p.x) < reach
    );

    return {
      ...p,
      x:
        cx +
        Math.sign(p.x - cx) *
          Math.min(
            ...over.map((above) => Math.abs(above.x - cx) - reach - CAPTION_GAP)
          ),
    };
  });
};

const topRowOf = (
  pts: readonly TrackPoint[],
  tile: number
): readonly TrackPoint[] => {
  const top = Math.min(...pts.map(({ y }) => y));
  const left = Math.min(...pts.map(({ x }) => x));
  const right = Math.max(...pts.map(({ x }) => x));

  const row = pts
    .flatMap((p, index) => (p.y < top + tile ? [{ index, p }] : []))
    .toSorted((one, other) => one.p.x - other.p.x);

  return pts.map((p, index) => {
    const place = row.findIndex((seat) => seat.index === index);

    return place === -1
      ? p
      : {
          ...p,
          x: left + ((right - left) * (place + 0.5)) / row.length,
          y: top,
        };
  });
};

const spacedColumns = (
  ring: readonly TrackPoint[],
  tile: number,
  bottom: number,
  spacing: Spacing,
  cx: number
): readonly TrackPoint[] => {
  const half = tile / 2;
  const reach = Math.max(tile * 0.65, half) + half + tile * FACE_SPREAD;
  const pitch = tile * (1 + FACE_RISE) + CAPTION_INK + CAPTION_GAP;

  const crowding = ring.some((above) =>
    ring.some(
      (below) =>
        below.y > above.y &&
        below.y - above.y < pitch &&
        Math.abs(below.x - above.x) < reach
    )
  );

  if (!crowding && spacing !== "TopRow") {
    return ring;
  }

  const pts = {
    Aside: () => asideOfColumns(ring, reach, cx),
    AsideBelow: () => asideBelowColumns(ring, reach, cx),
    Column: () => ring,
    TopRow: () => topRowOf(ring, tile),
  }[spacing]();

  const lowest = aboveTheStrip(bottom, tile, 1);
  const highest = TOP + half + tile * FACE_RISE;

  const topDown = pts
    .map((p, index) => ({ index, p }))
    .toSorted((one, other) => one.p.y - other.p.y);

  const linked = (one: Pt, other: Pt) => Math.abs(one.x - other.x) < reach;
  const ys = pts.map(({ y }) => y);
  const yOf = (index: number) => ys[index] ?? 0;

  for (const [rank, { index, p }] of topDown.entries()) {
    const under = topDown
      .slice(0, rank)
      .flatMap((above) =>
        linked(above.p, p) ? [yOf(above.index) + pitch] : []
      );

    ys[index] = Math.max(p.y, Math.min(Math.max(p.y, ...under), lowest));
  }

  for (const [rank, { index, p }] of [...topDown.entries()].toReversed()) {
    const over = topDown
      .slice(rank + 1)
      .flatMap((below) =>
        linked(below.p, p) ? [yOf(below.index) - pitch] : []
      );

    ys[index] = Math.max(Math.min(yOf(index), ...over), Math.min(p.y, highest));
  }

  const chainFrom = (index: number): readonly number[] => {
    const here = pts[index] ?? ORIGIN;

    const next = topDown.find(({ p }) => p.y > here.y && linked(here, p));

    return next === undefined ? [index] : [index, ...chainFrom(next.index)];
  };

  const chains = topDown.flatMap(({ index, p }, rank) =>
    topDown.slice(0, rank).some((above) => linked(above.p, p))
      ? []
      : [chainFrom(index)]
  );

  for (const chain of chains) {
    const first = yOf(chain[0] ?? 0);
    const last = yOf(chain.at(-1) ?? 0);

    if (
      chain.length > 2 &&
      chain.some((index) => yOf(index) !== pts[index]?.y)
    ) {
      for (const [step, index] of chain.entries()) {
        ys[index] = first + ((last - first) * step) / (chain.length - 1);
      }
    }
  }

  return pts.map((p, index) => ({ ...p, y: yOf(index) }));
};

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

const HERO_ROW_ROOM = 44;

const POT_STACKED_MIN = 50;

const POT_STACKED_MAX = 66;

const POT_FLAT_H = 24;

const POT_ABOVE_BOARD = 10;

const POT_FLAT_ABOVE_BOARD = 3;

const POT_MARGIN = 4;

const SELF_ABOVE_EDGE = 2;

const GROUP_MARGIN = 12;

const potHeight = (stacked: boolean, cardW: number) =>
  stacked ? Math.min(POT_STACKED_MAX, cardW * 1.2) : POT_FLAT_H;

const potGap = (stacked: boolean) =>
  stacked ? POT_ABOVE_BOARD : POT_FLAT_ABOVE_BOARD;

const tallGeo = (w: number, h: number, count: number, room: Room): Geo => {
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
    Math.min(MAX_TILE, sizes.tileCap, room.cap),
    heroTop - 12,
    room.round
  );

  const innerW = w - 2 * sizes.pad - 2 * inside.tile - 32;
  const cardInside = Math.min(76, (innerW - 32) / BOARD_CARDS);
  const boardInStrip = sizes.compact || cardInside < 54 || count >= 6;

  const middle = boardInStrip
    ? stripMiddle(w, sizes, heroTop, count, room.cap, room.round)
    : ovalMiddle(w, inside, cardInside);

  const railTop = Math.max(
    TOP + 40,
    (boardInStrip ? middle.strip.y : heroTop) - 150
  );

  return {
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
    laneW: room.laneW,
    pileW: room.pileW,
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
    seats: spacedColumns(
      middle.pts,
      middle.tile,
      boardInStrip ? middle.strip.y : heroTop,
      room.spacing,
      cx
    ).map((p) => tallSeat(p, cx, middle.tile, middle.strip)),
    self,
    strip: middle.strip,
    tabW: room.tabW,
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
  clusterHalf: number,
  most: number
): Oval => {
  const cap = Math.min(MAX_TILE, sizes.tileCap, most);
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

const wideGeo = (
  w: number,
  h: number,
  count: number,
  lift: number,
  room: Room
): Geo => {
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

  const oval = solveOval(w, h, count, sizes, hand, clusterHalf, room.cap);
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
    laneW: room.laneW,
    pileW: room.pileW,
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
    tabW: room.tabW,
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

const PILE_BOX = { h: 22 };

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

export const pileBox = (point: Pt, width: number): Box => ({
  h: PILE_BOX.h,
  w: width,
  x: point.x - width / 2,
  y: point.y - PILE_BOX.h / 2,
});

const gapTo = (point: Pt, box: Box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - box.x - box.w),
    Math.max(box.y - point.y, 0, point.y - box.y - box.h)
  );

const gapToSeat = (point: Pt, footprint: Footprint) => {
  let least = Number.POSITIVE_INFINITY;

  for (const box of footprint.seat) {
    least = Math.min(least, gapTo(point, box));
  }

  return least;
};

const LANE_OWNERSHIP = 2;

const nearerBy = (own: number, other: number) => own + LANE_OWNERSHIP < other;

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

const clearIn = (geo: Geo, blocked: readonly Box[], box: Box) =>
  onTable(geo, box) && blocked.every((other) => overlap(box, other) === 0);

export type TagSide = "Before" | "After" | "Below" | "Above";

export const POST_TAG_HEIGHT = 20;

export const POST_TAG_WIDTHS = { narrow: 38, wide: 64 } as const;

const TAG_GAP = 4;

export const postTagBox = (
  pile: Pt,
  side: TagSide,
  width: number,
  pileW: number
): Box => {
  const half = { h: PILE_BOX.h / 2, w: pileW / 2 };

  const across = {
    Above: {
      x: pile.x - width / 2,
      y: pile.y - half.h - TAG_GAP - POST_TAG_HEIGHT,
    },
    After: {
      x: pile.x + half.w + TAG_GAP,
      y: pile.y - POST_TAG_HEIGHT / 2,
    },
    Before: {
      x: pile.x - half.w - TAG_GAP - width,
      y: pile.y - POST_TAG_HEIGHT / 2,
    },
    Below: { x: pile.x - width / 2, y: pile.y + half.h + TAG_GAP },
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
      ...piles
        .filter((__, other) => other !== index)
        .map((pile) => pileBox(pile, geo.pileW)),
    ],
    own: owners[index]?.footprint.seat ?? [],
  }));
};

const OTHERS_WEIGH = 4;

const postTagSides = (geo: Geo, width: number): readonly TagSide[] => {
  const grounds = postTagGround(geo);

  return pilesOf(geo).map((pile, index) => {
    const preferred = TAG_PREFERENCES[geo.seats[index]?.side ?? "self"];
    const ground = grounds[index] ?? { others: [], own: [] };

    const crowding = (side: TagSide) => {
      const box = postTagBox(pile, side, width, geo.pileW);
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

const hintFixedGround = (geo: Geo): readonly Box[] => [
  geo.strip,
  ...ownersOf(geo).flatMap(({ footprint }, index, all) =>
    index === all.length - 1 ? faceAndName(footprint) : footprint.boxes
  ),
  {
    h: geo.chip.size,
    w: geo.chip.size,
    x: geo.chip.x - geo.chip.size / 2,
    y: geo.chip.y - geo.chip.size / 2,
  },
];

export const handHintGround = (geo: Geo): readonly Box[] => [
  ...hintFixedGround(geo),
  ...geo.seats.map(({ bet }) => pileBox(bet, geo.pileW)),
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

  for (
    let rise = 0;
    rise <= rises && (best === undefined || rise * 2 < best.cost);
    rise += HINT_STEP
  ) {
    for (
      let shift = 0;
      shift <= geo.w / 2 &&
      (best === undefined || shift + rise * 2 < best.cost);
      shift += HINT_STEP
    ) {
      for (const side of shift === 0 ? [0] : [-1, 1]) {
        const box = { ...start, x: start.x + side * shift, y: start.y - rise };
        const cost = shift + rise * 2;

        if (
          (best === undefined || cost < best.cost) &&
          clearIn(geo, blocked, box)
        ) {
          best = { box, cost };
        }
      }
    }
  }

  return best?.box;
};

const hintAmong = (geo: Geo, blocked: readonly Box[]): HandHint => {
  const w = Math.min(HAND_HINT.w, geo.w - 16);
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

const handHint = (geo: Geo): HandHint => hintAmong(geo, handHintGround(geo));

const hintBoxOf = ({ foot, say }: HandHint): Box => {
  const top = Math.min(say.y, foot.y);
  const left = Math.min(say.x, foot.x);

  return {
    h: Math.max(say.y + say.h, foot.y + foot.h) - top,
    w: Math.max(say.x + say.w, foot.x + foot.w) - left,
    x: left,
    y: top,
  };
};

export const handHintBox = (geo: Geo, hint = handHint(geo)): Box =>
  hintBoxOf(hint);

const PEEK_LIFT = 30;

const liftedHand = (geo: Geo): Box => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  return {
    h: handH + PEEK_LIFT,
    w: handW,
    x: geo.hand.x - handW / 2,
    y: geo.hand.y - handH / 2 - PEEK_LIFT,
  };
};

const middleObstacles = (geo: Geo, hint: Box): readonly Box[] => [
  ...pilesOf(geo).map((pile) => pileBox(pile, geo.pileW)),
  hint,
  liftedHand(geo),
  {
    h: geo.chip.size,
    w: geo.chip.size,
    x: geo.chip.x - geo.chip.size / 2,
    y: geo.chip.y - geo.chip.size / 2,
  },
  geo.strip,
];

const tagObstacles = (geo: Geo): readonly Box[] => {
  const sides = postTagSides(geo, POST_TAG_WIDTHS.narrow);

  return pilesOf(geo).map((pile, index) =>
    postTagBox(
      pile,
      sides[index] ?? "Before",
      POST_TAG_WIDTHS.narrow,
      geo.pileW
    )
  );
};

const sharedObstacles = (geo: Geo): readonly Box[] => [
  ...middleObstacles(geo, handHintBox(geo)),
  ...tagObstacles(geo),
];

export interface ButtonGround {
  readonly own: readonly Box[];
  readonly ownSeat: readonly Box[];
  readonly others: readonly Box[];
  readonly tags: readonly Box[];
  readonly untouchable: readonly Box[];
}

export const buttonGround = (
  geo: Geo,
  hint = handHintBox(geo)
): readonly ButtonGround[] => {
  const middle = middleObstacles(geo, hint);
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

const TIE_TOLERANCE = 1e-6;

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

  const seatReach = Math.hypot(
    owner.size * 0.65,
    owner.size / 2 + CAPTION_DEPTH
  );

  const turns = Array.from({ length: BUTTON_ANGLES }, (__, step) => {
    const turn = (step / BUTTON_ANGLES) * 2 * Math.PI;

    return {
      bending: Math.min(turn, 2 * Math.PI - turn) * owner.size * 0.35,
      cos: Math.cos(facing + turn),
      sin: Math.sin(facing + turn),
    };
  });

  let best: { readonly spot: ButtonSpot; readonly cost: number } | undefined;

  for (
    let reach = nearest;
    reach <= farthest && (best === undefined || reach - seatReach < best.cost);
    reach += BUTTON_STEP
  ) {
    for (const { bending, cos, sin } of turns) {
      if (
        best !== undefined &&
        reach - seatReach + bending - TIE_TOLERANCE >= best.cost
      ) {
        continue;
      }

      const spot = {
        r,
        x: centre.x + cos * reach,
        y: centre.y + sin * reach,
      };

      const own = gapToSeat(spot, owner.footprint);
      const cost = own + bending;

      if (
        (best === undefined || cost < best.cost) &&
        clearIn(geo, blocked, buttonBox(spot)) &&
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

const buttonSpots = (geo: Geo): ButtonSpots => {
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
        clearIn(geo, blocked, buttonBox(spot)) &&
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

const hintCrowding = (geo: Geo, blocked: readonly Box[]) => {
  const { foot, onCards, say, stacked } = hintAmong(geo, blocked);
  const apart = stacked ? 0 : 1;

  return (
    crowdingIn(geo, blocked, say) +
    crowdingIn(geo, blocked, foot) +
    apart +
    (onCards ? 1 : 0)
  );
};

const seatsOnBoard = (geo: Geo) =>
  coveredBy(
    geo.strip,
    ownersOf(geo).flatMap(({ footprint }) => footprint.seat)
  );

interface LiftJudge {
  readonly board: (geo: Geo) => number;
  readonly hint: (geo: Geo) => number;
}

const TODAYS_LIFT: LiftJudge = {
  board: (geo) =>
    seatsOnBoard(geo) +
    coveredBy(
      geo.strip,
      geo.seats.map(({ bet }) => pileBox(bet, geo.pileW))
    ),
  hint: (geo) => hintCrowding(geo, handHintGround(geo)),
};

const LANES_LIFT: LiftJudge = {
  board: seatsOnBoard,
  hint: (geo) => hintCrowding(geo, hintFixedGround(geo)),
};

const potTabBox = (geo: Geo): Box => {
  const tab = potTabOf(geo);

  return { h: tab.h, w: tab.w, x: tab.x - tab.w / 2, y: tab.y - tab.h / 2 };
};

const liftedForHint = (
  w: number,
  h: number,
  count: number,
  room: Room,
  judge: LiftJudge,
  finish: (geo: Geo) => Geo
): Geo => {
  const level = finish(wideGeo(w, h, count, 0, room));

  if (judge.hint(level) === 0) {
    return level;
  }

  const crowded = judge.board(level);

  for (
    let lift = BOARD_LIFT_STEP;
    lift <= BOARD_LIFT_MOST;
    lift += BOARD_LIFT_STEP
  ) {
    const lifted = finish(wideGeo(w, h, count, lift, room));

    if (judge.board(lifted) > crowded) {
      break;
    }

    if (judge.hint(lifted) === 0) {
      return lifted;
    }
  }

  return level;
};

export interface SeatPlan {
  readonly index: number;
  readonly active: boolean;
  readonly folded: boolean;
  readonly winner: boolean;
}

export interface SeatPlace extends Pt {
  readonly scale: number;
}

export interface ButtonRide {
  readonly owner: number | null;
  readonly spot: ButtonSpot;
}

export interface SeatsAtRest<Plan extends SeatPlan> {
  readonly seats: readonly Plan[];
  readonly someoneElse: boolean;
  readonly bets: readonly number[];
  readonly heroBet: boolean;
  readonly button: ButtonRide | null;
  readonly tags: readonly Box[];
  readonly tabsInside: readonly boolean[];
  readonly tabShifts: readonly number[];
}

const ACTIVE_SCALE_MAX = 1.26;

const ACTIVE_TILE_MAX = 176;

const WINNER_SCALE = 1.12;

const FOLDED_SCALE = 0.8;

const FOLDED_SHIFT = 0.07;

const WAITING_SCALE = 0.95;

const ACTOR_SCALE_STEP = 0.01;

const ROOM_GAP = 2;

export const activeScaleFor = (tile: number) =>
  Math.min(ACTIVE_SCALE_MAX, ACTIVE_TILE_MAX / tile);

export const restingScale = (someoneElse: boolean) =>
  someoneElse ? WAITING_SCALE : 1;

const tileScale = (plan: SeatPlan, tile: number, someoneElse: boolean) => {
  if (plan.winner) {
    return WINNER_SCALE;
  }

  if (plan.active) {
    return activeScaleFor(tile);
  }

  if (plan.folded) {
    return FOLDED_SCALE;
  }

  return restingScale(someoneElse);
};

const boxesOf = (
  geo: Geo,
  place: SeatPlace,
  rising: number
): readonly Box[] => {
  const size = geo.tile * place.scale;
  const half = size / 2;
  const captionHalf = Math.max(size * 0.65, half);
  const rise = size * rising;
  const drawn = rising > 0;

  return [
    {
      h: size + rise,
      w: size * (drawn ? 1 + FACE_SPREAD : 1),
      x: place.x - half,
      y: place.y - half - rise,
    },
    {
      h: (drawn ? CAPTION_INK + CAPTION_GAP : CAPTION_DEPTH) * place.scale,
      w: captionHalf * 2,
      x: place.x - captionHalf,
      y: place.y + half,
    },
  ];
};

export const seatBoxes = (geo: Geo, place: SeatPlace) => boxesOf(geo, place, 0);

const roomyBoxes = (geo: Geo, place: SeatPlace) =>
  boxesOf(geo, place, FACE_RISE);

interface Placement {
  fixed: boolean;
  axis: "x" | "y";
  scale: number;
  x: number;
  y: number;
}

const keptIn = (geo: Geo, box: Placement) => {
  const half = (geo.tile * box.scale) / 2 + (box.fixed ? 14 : 8);

  const lowest =
    geo.boardInStrip && !box.fixed
      ? aboveTheStrip(geo.strip.y, geo.tile * box.scale, box.scale)
      : geo.zone.bottom - geo.caption - half + (box.fixed ? 30 : 0);

  box.x = clamp(box.x, half, geo.w - half);
  box.y = clamp(box.y, geo.zone.top + half, lowest);
};

const pushApart = (a: Placement, b: Placement, geo: Geo) => {
  const reach = (((a.scale + b.scale) * geo.tile) / 2) * 0.9 + 4;
  const overlapX = reach - Math.abs(a.x - b.x);
  const overlapY = reach + geo.caption - Math.abs(a.y - b.y);

  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }

  const movers = [a, b].filter((box) => !box.fixed);
  const share = movers.length === 2 ? 0.5 : 1;

  for (const moving of movers) {
    const other = moving === a ? b : a;

    if (moving.axis === "x") {
      moving.x += Math.sign(moving.x - other.x || 1) * overlapX * share;
    } else {
      moving.y += Math.sign(moving.y - other.y || 1) * overlapY * share;
    }

    keptIn(geo, moving);
  }
};

const crowded = (geo: Geo, placed: readonly Placement[]) => {
  const drawn = placed.map((place) => roomyBoxes(geo, place));

  return drawn.some(([, caption], which) =>
    drawn.some(
      ([face], other) =>
        other !== which &&
        caption !== undefined &&
        face !== undefined &&
        overlap(caption, face) > 0
    )
  );
};

const separate = (placed: readonly Placement[], geo: Geo) => {
  for (const box of placed) {
    keptIn(geo, box);
  }

  for (let round = 0; round < 4; round += 1) {
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        const a = placed[first];
        const b = placed[second];

        if (a !== undefined && b !== undefined && !(a.fixed && b.fixed)) {
          pushApart(a, b, geo);
        }
      }
    }
  }
};

const clearOf = (
  still: readonly Box[],
  moving: readonly Box[],
  axis: "x" | "y",
  direction: number
) => {
  const lane = (a: Box, b: Box) =>
    axis === "y"
      ? a.x < b.x + b.w && b.x < a.x + a.w
      : a.y < b.y + b.h && b.y < a.y + a.h;

  const needed = still.flatMap((fixed) =>
    moving.flatMap((box) => {
      if (!lane(fixed, box)) {
        return [];
      }

      const [low, size, otherLow, otherSize] =
        axis === "y"
          ? [fixed.y, fixed.h, box.y, box.h]
          : [fixed.x, fixed.w, box.x, box.w];

      return [
        direction > 0
          ? low + size + ROOM_GAP - otherLow
          : otherLow + otherSize + ROOM_GAP - low,
      ];
    })
  );

  return Math.max(0, ...needed);
};

const touches = (mine: readonly Box[], theirs: readonly Box[]) =>
  mine.some((box) => theirs.some((other) => overlap(box, other) > 0));

const makeRoom = (
  geo: Geo,
  placed: readonly Placement[],
  actor: number,
  piles: readonly Box[],
  rides: (which: number, place: Placement) => readonly Box[],
  strays: (
    which: number,
    place: Placement,
    placed: readonly Placement[]
  ) => boolean
) => {
  const acting = placed[actor];

  if (acting === undefined) {
    return;
  }

  const grown = roomyBoxes(geo, acting);

  for (const [which, mover] of placed.entries()) {
    if (which !== actor && touches(roomyBoxes(geo, mover), grown)) {
      const others = [
        ...placed.flatMap((place, other) =>
          other === which || other === actor ? [] : roomyBoxes(geo, place)
        ),
        ...piles,
      ];

      const moves = (["x", "y"] as const)
        .map((axis) => {
          const ahead = axis === "x" ? mover.x - acting.x : mover.y - acting.y;
          const direction = Math.sign(ahead || 1);
          const shift = clearOf(grown, roomyBoxes(geo, mover), axis, direction);

          const moved = {
            ...mover,
            x: axis === "x" ? mover.x + direction * shift : mover.x,
            y: axis === "y" ? mover.y + direction * shift : mover.y,
          };

          keptIn(geo, moved);

          return { moved, shift };
        })
        .toSorted((left, right) => left.shift - right.shift);

      const safe = moves.find(
        ({ moved }) =>
          (moved.x !== mover.x || moved.y !== mover.y) &&
          !touches(
            [...roomyBoxes(geo, moved), ...rides(which, moved)],
            others
          ) &&
          !strays(which, moved, placed)
      );

      if (safe !== undefined) {
        mover.x = safe.moved.x;
        mover.y = safe.moved.y;
      }
    }
  }
};

export const ridingScale = (scale: number) => Math.max(1, scale);

const ridingButton = (
  geo: Geo,
  button: ButtonRide,
  placed: readonly Placement[],
  plans: readonly SeatPlan[]
): Box => {
  const ridden = plans.findIndex(({ index }) => index === button.owner);
  const owner = placed[ridden];
  const home = geo.seats[button.owner ?? -1];

  if (owner === undefined || home === undefined) {
    return buttonBox(button.spot);
  }

  return buttonBox({
    r: button.spot.r,
    x: owner.x + (button.spot.x - home.x) * ridingScale(owner.scale),
    y: owner.y + (button.spot.y - home.y) * ridingScale(owner.scale),
  });
};

type BoxesOf = (geo: Geo, place: SeatPlace) => readonly Box[];

const middleGround = (geo: Geo): readonly Box[] => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  return [
    geo.strip,
    potTabBox(geo),
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
  ];
};

const actorGround = (
  geo: Geo,
  rest: SeatsAtRest<SeatPlan>,
  placed: readonly Placement[],
  actor: number,
  boxes: BoxesOf
): readonly Box[] => {
  const owner = rest.seats[actor]?.index;

  return [
    ...placed.flatMap((place, which) =>
      which === actor ? [] : boxes(geo, place)
    ),
    ...footprintOf(geo.self, geo.self.size).seat,
    ...rest.bets.flatMap((index) => {
      const bet = geo.seats[index]?.bet;

      return bet === undefined ? [] : [pileBox(bet, geo.pileW)];
    }),
    ...(rest.heroBet ? [pileBox(geo.heroBet, geo.pileW)] : []),
    ...rest.tags,
    ...(rest.button === null || rest.button.owner === owner
      ? []
      : [ridingButton(geo, rest.button, placed, rest.seats)]),
    ...middleGround(geo),
  ];
};

const fitActor = (
  geo: Geo,
  place: Placement,
  ground: readonly Box[],
  boxes: BoxesOf,
  floor: number,
  rides: (place: Placement) => readonly Box[]
): number | undefined => {
  const middle = [...middleGround(geo), liftedHand(geo)];

  const clear = (scale: number) =>
    boxes(geo, { ...place, scale }).every((box) =>
      ground.every((other) => overlap(box, other) === 0)
    ) &&
    rides({ ...place, scale }).every(
      (box) =>
        onTable(geo, box) &&
        [...ground, ...middle].every((other) => overlap(box, other) === 0)
    );

  const steps = Math.max(
    0,
    Math.floor((place.scale - floor) / ACTOR_SCALE_STEP + 1e-9)
  );

  const scales = Array.from(
    { length: steps + 1 },
    (__, step) => place.scale - step * ACTOR_SCALE_STEP
  );

  return scales.find(clear);
};

interface Fit {
  readonly boxes: BoxesOf;
  readonly spot: Pt;
}

const firstFit = (
  fits: readonly Fit[],
  scaleAt: (fit: Fit) => number | undefined
): { readonly scale: number; readonly spot: Pt } | null => {
  for (const fit of fits) {
    const scale = scaleAt(fit);

    if (scale !== undefined) {
      return { scale, spot: fit.spot };
    }
  }

  return null;
};

const awayFromLane = (geo: Geo, home: SeatGeo, scale: number): Pt => {
  const dx = home.bet.x - home.x;
  const dy = home.bet.y - home.y;
  const length = Math.hypot(dx, dy) || 1;
  const grow = (scale - 1) * (geo.tile / 2 + CAPTION_DEPTH);

  return {
    x: home.x - (dx / length) * grow,
    y: home.y - (dy / length) * grow,
  };
};

const AWARD_TAB = {
  h: 22,
  inset: 8,
  least: 48,
  padding: 16,
  plus: 7.6,
  rise: 13,
};

export const awardTabBox = (
  face: Pt,
  size: number,
  scale: number,
  width: number,
  inside: boolean,
  shift = 0
): Box => ({
  h: AWARD_TAB.h * scale,
  w: width * scale,
  x: face.x + (shift - width / 2) * scale,
  y: inside
    ? face.y - size / 2 + AWARD_TAB.inset * scale
    : face.y - size / 2 - AWARD_TAB.rise * scale,
});

const GROWN_SLACK = 0.5;

export const placeSeats = <Plan extends SeatPlan>(
  geo: Geo,
  rest: SeatsAtRest<Plan>
): readonly (Plan & SeatPlace)[] => {
  const homes = rest.seats.flatMap((plan) => {
    const spot = geo.seats[plan.index];

    return spot === undefined ? [] : [{ plan, spot }];
  });

  const seats = homes.map(({ plan }) => plan);
  const { button } = rest;

  const rides = (which: number, place: Placement): readonly Box[] => {
    const owner = seats[which]?.index;
    const from = geo.seats[owner ?? -1];

    return button === null || from === undefined || button.owner !== owner
      ? []
      : [
          buttonBox({
            r: button.spot.r,
            x: place.x + (button.spot.x - from.x) * ridingScale(place.scale),
            y: place.y + (button.spot.y - from.y) * ridingScale(place.scale),
          }),
        ];
  };

  const laid = [
    ...rest.bets.flatMap((index) => {
      const bet = geo.seats[index]?.bet;

      return bet === undefined ? [] : [pileBox(bet, geo.pileW)];
    }),
    ...(rest.heroBet ? [pileBox(geo.heroBet, geo.pileW)] : []),
    ...rest.tags,
  ];

  const middle = [...middleGround(geo), liftedHand(geo)];
  const yourSeat = footprintOf(geo.self, geo.self.size).seat;

  const strays = (
    which: number,
    place: Placement,
    placed: readonly Placement[]
  ) =>
    touches(roomyBoxes(geo, place), [
      ...laid,
      ...placed.flatMap((other, slot) =>
        slot === which ? [] : rides(slot, other)
      ),
    ]) ||
    rides(which, place).some(
      (box) =>
        !onTable(geo, box) ||
        touches(
          [box],
          [
            ...laid,
            ...middle,
            ...placed.flatMap((other, slot) =>
              slot === which ? [] : seatBoxes(geo, other)
            ),
          ]
        )
    );

  const drawnWithTab = (placed: readonly Placement[], winner: number) =>
    placed.map((place, which) => [
      ...seatBoxes(geo, place),
      ...(which === winner
        ? [
            awardTabBox(
              place,
              geo.tile * place.scale,
              place.scale,
              geo.tabW,
              rest.tabsInside[seats[which]?.index ?? -1] === true,
              rest.tabShifts[seats[which]?.index ?? -1] ?? 0
            ),
          ]
        : []),
    ]);

  const contactsOf = (placed: readonly Placement[], winner: number) => {
    const drawn = drawnWithTab(placed, winner);
    const found = new Map<string, number>();

    const nearby = [...middleGround(geo), ...yourSeat];

    for (const [which, boxes] of drawn.entries()) {
      for (const [part, box] of boxes.entries()) {
        for (const [other, theirs] of drawn.entries()) {
          for (const [slot, them] of theirs.entries()) {
            if (other !== which && overlap(box, them) > 0) {
              found.set(
                `${which}.${part}:${other}.${slot}`,
                overlap(box, them)
              );
            }
          }
        }

        for (const [slot, them] of nearby.entries()) {
          if (overlap(box, them) > 0) {
            found.set(`${which}.${part}:middle.${slot}`, overlap(box, them));
          }
        }

        if (!onTable(geo, box)) {
          found.set(`${which}.${part}:edge`, 1);
        }
      }
    }

    return found;
  };

  const grows = (
    grown: readonly Placement[],
    still: readonly Placement[],
    winner: number
  ) => {
    const before = contactsOf(still, winner);

    return [...contactsOf(grown, winner)].every(
      ([contact, area]) => area <= (before.get(contact) ?? 0) + GROWN_SLACK
    );
  };

  const settle = (lit: boolean, winnerGrows = true) => {
    const placed = homes.map(({ plan: planned, spot }): Placement => {
      const plan = winnerGrows ? planned : { ...planned, winner: false };
      const active = lit && plan.active;
      const shrink = plan.folded ? FOLDED_SHIFT : 0;
      const lean = active ? 0.05 : 0;

      return {
        axis: spot.side === "top" ? "x" : "y",
        fixed: active,
        scale: tileScale({ ...plan, active }, geo.tile, rest.someoneElse),
        x: spot.x + spot.nx * geo.tile * (lean - shrink),
        y: spot.y + spot.ny * geo.tile * (lean * 0.8 - shrink),
      };
    });

    for (const place of placed) {
      keptIn(geo, place);
    }

    const before = placed.map((place) => ({ ...place }));

    separate(placed, geo);

    for (const [which, place] of placed.entries()) {
      const was = before[which];

      if (
        was !== undefined &&
        !place.fixed &&
        (place.x !== was.x || place.y !== was.y) &&
        strays(which, place, placed) &&
        !strays(which, was, placed)
      ) {
        place.x = was.x;
        place.y = was.y;
      }
    }

    return placed;
  };

  const actor = seats.findIndex((plan) => plan.active && !plan.winner);
  const lit = settle(true);

  makeRoom(geo, lit, actor, laid, rides, strays);

  const acting = lit[actor];
  const home = geo.seats[seats[actor]?.index ?? -1];

  const fitted =
    acting === undefined || home === undefined
      ? null
      : firstFit(
          [
            { x: acting.x, y: acting.y },
            home,
            awayFromLane(geo, home, acting.scale),
          ].map((spot) => ({ boxes: roomyBoxes, spot })),
          ({ boxes, spot }) =>
            fitActor(
              geo,
              { ...acting, x: spot.x, y: spot.y },
              actorGround(geo, { ...rest, seats }, lit, actor, boxes),
              boxes,
              Math.min(acting.scale, restingScale(rest.someoneElse)),
              (place) => rides(actor, place)
            )
        );

  if (acting !== undefined && fitted !== null) {
    acting.scale = fitted.scale;
    acting.x = fitted.spot.x;
    acting.y = fitted.spot.y;
  }

  const placed =
    acting === undefined || (fitted !== null && !crowded(geo, lit))
      ? lit
      : settle(false);

  const winner = seats.findIndex((plan) => plan.winner);
  const calm = winner === -1 ? placed : settle(false, false);
  const shown = winner === -1 || grows(placed, calm, winner) ? placed : calm;

  return seats.flatMap((plan, which) => {
    const place = shown[which];

    return place === undefined
      ? []
      : [{ ...plan, scale: place.scale, x: place.x, y: place.y }];
  });
};

interface Attempt {
  readonly cap: number;
  readonly compact: boolean;
  readonly round: number;
  readonly spacing: Spacing;
}

interface Laned {
  readonly clashes: number;
  readonly geo: Geo;
  readonly hint: HandHint;
  readonly lanes: Arrangement;
}

const firstFitting = (
  attempts: readonly Attempt[],
  run: (attempt: Attempt) => Laned | null
): { readonly attempt: Attempt; readonly result: Laned } | null => {
  for (const attempt of attempts) {
    const result = run(attempt);

    if (result !== null && result.clashes === 0) {
      return { attempt, result };
    }
  }

  return null;
};

const DEFAULT_MOST = 9999;

const CHIPS_W = 20;

const DIGIT_W = 9.6;

const COMMA_W = 4.5;

export const awardTabWidthFor = (most: number) => {
  const digits = String(Math.trunc(Math.max(0, most))).length;
  const commas = Math.floor((digits - 1) / 3);

  return Math.max(
    AWARD_TAB.least,
    Math.ceil(
      AWARD_TAB.padding + AWARD_TAB.plus + digits * DIGIT_W + commas * COMMA_W
    )
  );
};

export const pileWidthFor = (most: number, compact: boolean) => {
  const digits = String(Math.trunc(Math.max(0, most))).length;
  const commas = Math.floor((digits - 1) / 3);

  return Math.ceil(
    (compact ? 0 : CHIPS_W) + digits * DIGIT_W + commas * COMMA_W
  );
};

const FACE_FLOOR = 40;

const LANE_STEP = 2;

const LANE_COARSE = 8;

const capsDown = (top: number, step: number): readonly number[] =>
  Array.from(
    { length: Math.max(0, Math.ceil((top - FACE_FLOOR) / step)) + 1 },
    (__, taken) => Math.max(FACE_FLOOR, top - taken * step)
  );

const LANE_GAP = 4;

const LANE_ROUNDS = [0, 0.15, 0.3] as const;

const SPACINGS: readonly Spacing[] = [
  "Column",
  "Aside",
  "AsideBelow",
  "TopRow",
];

export interface TagSides {
  readonly narrow: readonly TagSide[];
  readonly wide: readonly TagSide[];
  readonly wideFits: readonly boolean[];
}

export interface Table extends Geo {
  readonly buttons: ButtonSpots;
  readonly compactPiles: boolean;
  readonly fits: boolean;
  readonly hint: HandHint;
  readonly lanes: boolean;
  readonly tabShifts: readonly number[];
  readonly tabsInside: readonly boolean[];
  readonly tagSides: TagSides;
}

interface Arrangement {
  readonly buttons: readonly ButtonSpot[];
  readonly piles: readonly Pt[];
  readonly tags: readonly TagSide[];
}

export const restingPlaces = (geo: Geo) =>
  placeSeats(geo, {
    bets: [],
    button: null,
    heroBet: false,
    seats: geo.seats.map((__, index) => ({
      active: false,
      folded: false,
      index,
      winner: false,
    })),
    someoneElse: false,
    tabShifts: [],
    tabsInside: [],
    tags: [],
  });

const atRest = (geo: Geo): Geo => {
  const resting = restingPlaces(geo);

  return {
    ...geo,
    seats: geo.seats.map((seat, index) => {
      const place = resting[index];

      return place === undefined
        ? seat
        : {
            ...seat,
            bet: {
              x: seat.bet.x + place.x - seat.x,
              y: seat.bet.y + place.y - seat.y,
            },
            x: place.x,
            y: place.y,
          };
    }),
  };
};

const ownersAt = (geo: Geo, seats: readonly Pt[]) => [
  ...seats.map((centre) => footprintOf(centre, geo.tile)),
  footprintOf(geo.self, geo.self.size),
];

const captionsOnFaces = (geo: Geo, seats: readonly Pt[]) => {
  const drawn = [
    ...seats.map((seat) => roomyBoxes(geo, { ...seat, scale: 1 })),
    roomyBoxes(geo, { ...geo.self, scale: geo.self.size / geo.tile }),
  ];

  return drawn.flatMap(([, caption], index) =>
    drawn.flatMap(([face], other) =>
      other !== index &&
      caption !== undefined &&
      face !== undefined &&
      overlap(caption, face) > 0
        ? [other]
        : []
    )
  ).length;
};

const TAB_EDGE = 2;

interface TabPlace {
  readonly clear: boolean;
  readonly inside: boolean;
  readonly shift: number;
}

const TAB_SHIFTS = [0, -0.25, 0.25, -0.5, 0.5] as const;

export const boardCardsBox = (geo: Geo): Box => {
  const xs = geo.board.map(({ x }) => x);
  const ys = geo.board.map(({ y }) => y);
  const halfW = geo.cardW / 2;
  const halfH = geo.cardW * 0.7;

  return {
    h: Math.max(...ys) - Math.min(...ys) + halfH * 2,
    w: Math.max(...xs) - Math.min(...xs) + halfW * 2,
    x: Math.min(...xs) - halfW,
    y: Math.min(...ys) - halfH,
  };
};

export const FELT_RULES_INSET = 6;

export const FELT_RULES_TAP_PX = 44;

const FELT_RULES_HEIGHT = 60;

const FELT_RULES_NARROWEST = 112;

const FELT_RULES_STEP = 4;

const FELT_RULES_SHIFTS = 130;

const FELT_CALL_GAP = 8;

const FELT_RULES_WIDE_INSET = 40;

const callHeight = (w: number) => {
  if (w >= 280) {
    return 84;
  }

  if (w >= 176) {
    return 100;
  }

  return w >= 140 ? 124 : 156;
};

const rulesHeight = (w: number) => (w >= 160 ? FELT_RULES_HEIGHT : 92);

const restingBoxes = (geo: Geo) =>
  [
    ...restingPlaces(geo).map((place) => seatBoxes(geo, place)),
    seatBoxes(geo, { ...geo.self, scale: geo.self.size / geo.tile }),
  ].flat();

const shiftsOf = (count: number) =>
  Array.from(
    { length: count * 2 + 1 },
    (_, step) =>
      (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * FELT_RULES_STEP
  );

const clearOnTable = (geo: Geo, blocked: readonly Box[]) => (box: Box) =>
  box.x >= FELT_RULES_INSET &&
  box.x + box.w <= geo.w - FELT_RULES_INSET &&
  box.y >= geo.top + FELT_RULES_INSET &&
  box.y + box.h <= geo.h - FELT_RULES_INSET &&
  blocked.every((other) => overlap(box, other) === 0);

export interface FeltBlock {
  readonly rules: Box;
  readonly call: Box;
}

const feltMiddle = (geo: Geo): Pt =>
  geo.boardInStrip
    ? { x: geo.w / 2, y: (geo.top + geo.strip.y) / 2 }
    : { x: geo.table.x, y: geo.table.y };

const blockAt = (centre: Pt, w: number, dy: number): FeltBlock => {
  const h = callHeight(w);
  const card = rulesHeight(w);
  const top = centre.y + dy - (card + FELT_CALL_GAP + h) / 2;
  const x = centre.x - w / 2;

  return {
    call: { h, w, x, y: top + card + FELT_CALL_GAP },
    rules: { h: card, w, x, y: top },
  };
};

const BESIDE_CALL_WIDTHS = [240, 208, 176] as const;

const besideAt = (
  centre: Pt,
  w: number,
  callW: number,
  dy: number
): FeltBlock => {
  const h = callHeight(callW);
  const card = rulesHeight(w);
  const left = centre.x - (w + FELT_CALL_GAP + callW) / 2;
  const middle = centre.y + dy;

  const top = middle - Math.max(card, h) / 2;

  return {
    call: { h, w: callW, x: left + w + FELT_CALL_GAP, y: top },
    rules: { h: card, w, x: left, y: top },
  };
};

export const feltBlock = (geo: Geo): FeltBlock => {
  const centre = feltMiddle(geo);

  const widest = Math.max(
    FELT_RULES_NARROWEST,
    Math.min(
      geo.boardInStrip
        ? geo.strip.w - FELT_RULES_WIDE_INSET
        : boardCardsBox(geo).w,
      geo.w - FELT_RULES_INSET * 2
    )
  );

  const clear = clearOnTable(geo, restingBoxes(geo));

  const widths = Array.from(
    {
      length:
        Math.max(
          0,
          Math.floor((widest - FELT_RULES_NARROWEST) / FELT_RULES_STEP)
        ) + 1,
    },
    (_, step) => widest - step * FELT_RULES_STEP
  );

  const fits = ({ call, rules }: FeltBlock) => clear(rules) && clear(call);
  const shifts = shiftsOf(FELT_RULES_SHIFTS);

  const stacked = shifts
    .flatMap((dy) => widths.map((w) => blockAt(centre, w, dy)))
    .find(fits);

  const beside = () =>
    shifts
      .flatMap((dy) =>
        widths.flatMap((w) =>
          BESIDE_CALL_WIDTHS.map((callW) => besideAt(centre, w, callW, dy))
        )
      )
      .find(fits);

  return stacked ?? beside() ?? blockAt(centre, widest, 0);
};

export const feltRulesBox = (geo: Geo): Box => feltBlock(geo).rules;

export const waitingCallBox = (geo: Geo): Box => feltBlock(geo).call;

const tabsOf = (places: readonly TabPlace[]) => ({
  tabShifts: places.map(({ shift }) => shift),
  tabsInside: places.map(({ inside }) => inside),
});

const tabPlacesFor = (
  geo: Geo,
  seats: readonly Pt[],
  hint: HandHint
): readonly TabPlace[] => {
  const owners = ownersAt(geo, seats);
  const half = geo.tabW / 2 + TAB_EDGE;

  const middle = [
    boardCardsBox(geo),
    ...middleGround(geo).slice(1),
    hint.say,
    hint.foot,
  ];

  return owners.map((own, index) => {
    const { x } = own.centre;
    const size = index < seats.length ? geo.tile : geo.self.size;
    const edge = Math.max(0, half - x) - Math.max(0, x + half - geo.w);

    const others = owners.flatMap((other, slot) =>
      slot === index ? [] : other.seat
    );

    const places = [false, true].flatMap((inside) =>
      TAB_SHIFTS.map((share) => ({
        clear: true,
        inside,
        shift: edge + share * geo.tabW,
      }))
    );

    return (
      places.find(({ inside, shift }) =>
        clearIn(
          geo,
          [...others, ...middle],
          awardTabBox(own.centre, size, 1, geo.tabW, inside, shift)
        )
      ) ?? { clear: false, inside: true, shift: edge }
    );
  });
};

const shrunkSeats = (
  geo: Geo,
  seats: readonly Pt[],
  except: number
): readonly Box[] =>
  seats.flatMap((place, index) => {
    if (index === except) {
      return [];
    }

    const { nx = 0, ny = 0 } = geo.seats[index] ?? {};
    const out = geo.tile * FOLDED_SHIFT;

    return [
      ...seatBoxes(geo, { ...place, scale: WAITING_SCALE }),
      ...seatBoxes(geo, {
        scale: FOLDED_SCALE,
        x: place.x - nx * out,
        y: place.y - ny * out,
      }),
    ];
  });

const SETTLED_PX = 0.01;

const SETTLING_PASSES = 16;

const settled = (geo: Geo): Geo => {
  let current = geo;

  for (let pass = 0; pass < SETTLING_PASSES; pass += 1) {
    const previous = current;
    const next = atRest(previous);

    const moved = Math.max(
      0,
      ...next.seats.map((seat, index) => {
        const was = previous.seats[index] ?? seat;

        return Math.hypot(seat.x - was.x, seat.y - was.y);
      })
    );

    current = next;

    if (moved < SETTLED_PX) {
      break;
    }
  }

  return current;
};

const fixedGround = (geo: Geo, seats: readonly Pt[], except = -1) => [
  ...ownersAt(geo, seats).flatMap(({ seat }, index) =>
    index === except ? [] : seat
  ),
  ...shrunkSeats(geo, seats, except),
  ...middleGround(geo),
];

const centreOf = (box: Box): Pt => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});

const SHRUNK_SCALES = [FOLDED_SCALE, WAITING_SCALE] as const;

const clearOfShrunk = (geo: Geo, seat: Pt, button: Box) =>
  SHRUNK_SCALES.every((scale) =>
    seatBoxes(geo, { scale, x: seat.x, y: seat.y }).every(
      (box) => overlap(button, box) === 0
    )
  );

const foldingReach = (
  geo: Geo,
  seat: { readonly nx: number; readonly ny: number },
  box: Box
): Box => {
  const dx = -seat.nx * geo.tile * FOLDED_SHIFT;
  const dy = -seat.ny * geo.tile * FOLDED_SHIFT;

  return {
    h: box.h + Math.abs(dy),
    w: box.w + Math.abs(dx),
    x: box.x + Math.min(0, dx),
    y: box.y + Math.min(0, dy),
  };
};

type Judged = "Everything" | "PilesAndTags";

const clashList = (
  geo: Geo,
  seats: readonly Pt[],
  arrangement: Arrangement,
  hint: Box,
  judged: Judged = "Everything"
): readonly string[] => {
  const owners = ownersAt(geo, seats);
  const fixed = fixedGround(geo, seats);
  const buttonsAvoid = [hint, liftedHand(geo)];

  const items = owners.map((__, index) => {
    const pile = arrangement.piles[index] ?? geo.interior;
    const home = geo.seats[index];
    const rested = seats[index];

    const spot = arrangement.buttons[index] ?? {
      ...geo.interior,
      r: MIN_BUTTON_RADIUS,
    };

    const box = buttonBox(spot);

    return {
      button: home === undefined ? box : foldingReach(geo, home, box),
      others: fixedGround(geo, seats, index),
      pile: pileBox(pile, geo.pileW),
      shrunkClear:
        (home === undefined ||
          rested === undefined ||
          clearOfShrunk(geo, rested, box)) &&
        (owners[index]?.seat ?? []).every((mine) => overlap(box, mine) === 0),
      spot,
      tag: postTagBox(
        pile,
        arrangement.tags[index] ?? "Before",
        POST_TAG_WIDTHS.narrow,
        geo.pileW
      ),
    };
  });

  const owned = (point: Pt, index: number) => {
    const own = owners[index];

    return (
      own !== undefined &&
      owners.every(
        (other, slot) =>
          slot === index ||
          nearerBy(gapToSeat(point, own), gapToSeat(point, other))
      )
    );
  };

  return items.flatMap((item, index) => {
    const buttons = judged === "Everything";

    const parts = [
      ["pile", item.pile, centreOf(item.pile)],
      ["tag", item.tag, centreOf(item.tag)],
      ...(buttons ? [["button", item.button, item.spot] as const] : []),
    ] as const;

    return [
      ...(item.shrunkClear || !buttons
        ? []
        : [`${index} button on its own seat`]),
      ...(buttons ? buttonsAvoid : []).flatMap((box, which) =>
        overlap(item.button, box) > 0
          ? [`${index} button on ${which === 0 ? "the hint" : "your cards"}`]
          : []
      ),
      ...parts.flatMap(([part, box, point]) => [
        ...(onTable(geo, box) ? [] : [`${index} ${part} off the table`]),
        ...(part === "button" ? item.others : fixed).flatMap((other, slot) =>
          overlap(box, other) > 0 ? [`${index} ${part} on ground ${slot}`] : []
        ),
        ...items.flatMap((other, slot) =>
          slot === index && part !== "button"
            ? []
            : (
                [
                  ["pile", other.pile],
                  ["tag", other.tag],
                ] as const
              ).flatMap(([what, theirs]) =>
                overlap(box, theirs) > 0
                  ? [`${index} ${part} on ${slot} ${what}`]
                  : []
              )
        ),
        ...(owned(point, index) ? [] : [`${index} ${part} not owned`]),
      ]),
    ];
  });
};

const clashesOf = (
  geo: Geo,
  seats: readonly Pt[],
  arrangement: Arrangement,
  hint: Box
): number => clashList(geo, seats, arrangement, hint).length;

interface Lane {
  readonly button: ButtonSpot;
  readonly pile: Pt;
  readonly reach: Box;
  readonly tag: TagSide;
}

type Heading = "Down" | "Up" | "Right" | "Left";

const HEADINGS: Record<Heading, Pt> = {
  Down: { x: 0, y: 1 },
  Left: { x: -1, y: 0 },
  Right: { x: 1, y: 0 },
  Up: { x: 0, y: -1 },
};

const ALONG: Record<Heading, TagSide> = {
  Down: "Below",
  Left: "Below",
  Right: "Below",
  Up: "Above",
};

const laneTowards = (
  geo: Geo,
  seat: Pt,
  heading: Heading
): readonly Omit<Lane, "reach">[] => {
  const { tile } = geo;
  const r = geo.laneW < CHIPS_W * 3 ? MIN_BUTTON_RADIUS : buttonRadius(tile);
  const disc = 2 * (r + BUTTON_CLEARANCE);
  const row = PILE_BOX.h;
  const toward = Math.sign(geo.w / 2 - seat.x) || 1;
  const tags: readonly TagSide[] = [ALONG[heading], "After", "Before"];

  const placed = (button: Pt, piles: readonly Pt[]) => {
    const spot = { ...button, r };

    return piles.flatMap((pile) =>
      tags.map((tag) => ({ button: spot, pile, tag }))
    );
  };

  if (heading === "Down" || heading === "Up") {
    const down = heading === "Down" ? 1 : -1;

    const edge =
      heading === "Down"
        ? seat.y + tile / 2 + CAPTION_DEPTH + LANE_GAP
        : seat.y - tile / 2 - tile * FACE_RISE - LANE_GAP;

    const pileY = edge + down * (disc + LANE_GAP + row / 2);

    return placed(
      { x: seat.x, y: edge + (down * disc) / 2 },
      [0, toward / 2, -toward / 2, toward, -toward].map((shift) => ({
        x: seat.x + shift * geo.laneW,
        y: pileY,
      }))
    );
  }

  const across = heading === "Right" ? 1 : -1;
  const face = seat.x + across * (tile / 2 + LANE_GAP);
  const caption = seat.x + across * (tile * 0.65 + LANE_GAP);
  const bottom = seat.y + tile / 2 + CAPTION_DEPTH;

  const levels = [
    seat.y,
    seat.y - tile / 2 + disc / 2,
    seat.y + tile / 2 - disc / 2,
    seat.y + tile / 2 + CAPTION_DEPTH / 2,
    bottom - disc / 2,
  ];

  return levels.flatMap((level) => {
    const beside = level + disc / 2 > seat.y + tile / 2 ? caption : face;
    const button = { x: beside + (across * disc) / 2, y: level };
    const below = level + disc / 2 + LANE_GAP + row / 2;

    return placed(button, [
      { x: caption + (across * geo.laneW) / 2, y: below },
      {
        x: button.x + across * (disc / 2 + LANE_GAP + geo.laneW / 2),
        y: level,
      },
      { x: caption + across * (disc + LANE_GAP + geo.laneW / 2), y: below },
    ]);
  });
};

const INWARD_TURNS = [0, -0.35, 0.35, -0.7, 0.7] as const;

const INWARD_TAGS: readonly TagSide[] = ["After", "Before", "Below", "Above"];

const grown = (box: Box, by: number): Box => ({
  h: box.h + by * 2,
  w: box.w + by * 2,
  x: box.x - by,
  y: box.y - by,
});

interface Span {
  readonly from: number;
  readonly to: number;
}

const ALWAYS: Span = {
  from: Number.NEGATIVE_INFINITY,
  to: Number.POSITIVE_INFINITY,
};

const spanAlong = (origin: number, step: number, low: number, high: number) => {
  if (step === 0) {
    return origin > low && origin < high ? ALWAYS : null;
  }

  const first = (low - origin) / step;
  const second = (high - origin) / step;

  return { from: Math.min(first, second), to: Math.max(first, second) };
};

const overlapSpan = (
  from: Pt,
  direction: Pt,
  half: Pt,
  other: Box
): Span | null => {
  const across = spanAlong(
    from.x,
    direction.x,
    other.x - half.x,
    other.x + other.w + half.x
  );

  const down = spanAlong(
    from.y,
    direction.y,
    other.y - half.y,
    other.y + other.h + half.y
  );

  if (across === null || down === null) {
    return null;
  }

  const span = {
    from: Math.max(across.from, down.from),
    to: Math.min(across.to, down.to),
  };

  return span.from < span.to ? span : null;
};

const CLEAR_EPSILON = 1e-6;

const spanHolding = (spans: readonly Span[], reach: number) =>
  spans.find((span) => span.from < reach && reach < span.to);

const firstClearAlong = (
  from: Pt,
  direction: Pt,
  start: number,
  limit: number,
  half: Pt,
  taken: readonly Box[]
): Pt | undefined => {
  const spans = taken.flatMap((other) => {
    const span = overlapSpan(from, direction, half, other);

    return span === null ? [] : [span];
  });

  let reach = start;
  let blocked = spanHolding(spans, reach);

  while (blocked !== undefined && reach <= limit) {
    reach = blocked.to + CLEAR_EPSILON;
    blocked = spanHolding(spans, reach);
  }

  return reach <= limit
    ? { x: from.x + direction.x * reach, y: from.y + direction.y * reach }
    : undefined;
};

const lanesInward = (
  geo: Geo,
  seat: SeatGeo
): readonly Omit<Lane, "reach">[] => {
  const r =
    geo.laneW < CHIPS_W * 3 ? MIN_BUTTON_RADIUS : buttonRadius(geo.tile);

  const own = [1, ...SHRUNK_SCALES].flatMap((scale) =>
    seatBoxes(geo, { scale, x: seat.x, y: seat.y }).map((box) =>
      grown(box, LANE_GAP)
    )
  );

  const limit = geo.tile * 1.5 + CAPTION_DEPTH + geo.laneW;
  const buttonAt = (point: Pt) => buttonBox({ ...point, r });
  const pileAt = (point: Pt) => pileBox(point, geo.laneW);
  const buttonHalf = { x: r + BUTTON_CLEARANCE, y: r + BUTTON_CLEARANCE };
  const pileHalf = { x: geo.laneW / 2, y: PILE_BOX.h / 2 };

  return INWARD_TURNS.flatMap((turn) => {
    const direction = {
      x: seat.nx * Math.cos(turn) - seat.ny * Math.sin(turn),
      y: seat.nx * Math.sin(turn) + seat.ny * Math.cos(turn),
    };

    const start = geo.tile / 2;

    const button = firstClearAlong(
      seat,
      direction,
      start,
      limit,
      buttonHalf,
      own
    );

    const pileBeyond =
      button === undefined
        ? undefined
        : firstClearAlong(seat, direction, start, limit, pileHalf, [
            ...own,
            grown(buttonAt(button), LANE_GAP),
          ]);

    const pile = firstClearAlong(seat, direction, start, limit, pileHalf, own);

    const buttonBeyond =
      pile === undefined
        ? undefined
        : firstClearAlong(seat, direction, start, limit, buttonHalf, [
            ...own,
            grown(pileAt(pile), LANE_GAP),
          ]);

    return [
      ...(button === undefined || pileBeyond === undefined
        ? []
        : [{ button, pile: pileBeyond }]),
      ...(pile === undefined || buttonBeyond === undefined
        ? []
        : [{ button: buttonBeyond, pile }]),
    ].flatMap((placing) => {
      const spot = { ...placing.button, r };

      return INWARD_TAGS.map((tag) => ({
        button: spot,
        pile: placing.pile,
        tag,
      }));
    });
  });
};

const HEADING_ORDER: readonly Heading[] = ["Down", "Up", "Right", "Left"];

const facing = (seat: SeatGeo, heading: Heading) =>
  HEADINGS[heading].x * seat.nx + HEADINGS[heading].y * seat.ny;

const lanesAround = (geo: Geo, seat: SeatGeo): readonly Lane[] => {
  const reaches = new Map<ButtonSpot, Box>();

  const reachOf = (button: ButtonSpot) => {
    const known = reaches.get(button);

    if (known !== undefined) {
      return known;
    }

    const reach = foldingReach(geo, seat, buttonBox(button));
    reaches.set(button, reach);

    return reach;
  };

  return [
    ...lanesInward(geo, seat),
    ...HEADING_ORDER.toSorted(
      (left, right) => facing(seat, right) - facing(seat, left)
    ).flatMap((heading) => laneTowards(geo, seat, heading)),
  ].flatMap((lane) =>
    (lane.pile.x - seat.x) * seat.nx + (lane.pile.y - seat.y) * seat.ny > 0
      ? [{ ...lane, reach: reachOf(lane.button) }]
      : []
  );
};

const laneBoxes = (geo: Geo, lane: Lane) => [
  lane.reach,
  pileBox(lane.pile, geo.pileW),
  postTagBox(lane.pile, lane.tag, POST_TAG_WIDTHS.narrow, geo.pileW),
];

interface LaneGround {
  readonly all: readonly Box[];
  readonly button: readonly Box[];
}

const remembered = <Key>(
  known: Map<Key, boolean>,
  key: Key,
  judge: () => boolean
) => {
  const was = known.get(key);

  if (was !== undefined) {
    return was;
  }

  const now = judge();
  known.set(key, now);

  return now;
};

const laneClearFor = (
  geo: Geo,
  index: number,
  owners: readonly Footprint[],
  ground: LaneGround
) => {
  const seat = geo.seats[index];
  const own = owners[index];

  const nearest = (point: Pt) =>
    own !== undefined &&
    owners.every(
      (other, slot) =>
        slot === index ||
        nearerBy(gapToSeat(point, own), gapToSeat(point, other))
    );

  const fits = (box: Box, point: Pt, taken: readonly Box[]) =>
    clearIn(geo, taken, box) && nearest(point);

  const buttons = new Map<ButtonSpot, boolean>();
  const piles = new Map<Pt, boolean>();

  const clear = (lane: Lane) => {
    const pile = pileBox(lane.pile, geo.pileW);

    const tag = postTagBox(
      lane.pile,
      lane.tag,
      POST_TAG_WIDTHS.narrow,
      geo.pileW
    );

    return (
      remembered(buttons, lane.button, () => {
        const box = buttonBox(lane.button);

        return (
          fits(lane.reach, lane.button, ground.button) &&
          (seat === undefined || clearOfShrunk(geo, seat, box)) &&
          (own?.seat ?? []).every((mine) => overlap(box, mine) === 0)
        );
      }) &&
      remembered(piles, lane.pile, () =>
        fits(pile, centreOf(pile), ground.all)
      ) &&
      overlap(lane.reach, pile) === 0 &&
      overlap(lane.reach, tag) === 0 &&
      fits(tag, centreOf(tag), ground.all)
    );
  };

  return clear;
};

const lanesClearFor = (
  geo: Geo,
  index: number,
  owners: readonly Footprint[],
  ground: LaneGround,
  candidates: readonly Lane[]
): readonly Lane[] =>
  candidates.filter(laneClearFor(geo, index, owners, ground));

const lanesOfEverySeat = (geo: Geo): readonly (readonly Lane[])[] =>
  geo.seats.map((seat) => lanesAround(geo, seat));

type SeatLanes =
  | { readonly lanes: readonly (readonly Lane[])[] }
  | { readonly stuck: number };

const lanesIfEverySeatHasOne = (geo: Geo, firstLook: number): SeatLanes => {
  const owners = ownersAt(geo, geo.seats);
  const fixed = fixedGround(geo, geo.seats);
  const hand = liftedHand(geo);
  const count = geo.seats.length;
  const found: (readonly Lane[])[] = [];

  for (let look = 0; look < count; look += 1) {
    const index = (firstLook + look) % count;
    const seat = geo.seats[index];
    const nearby = seat === undefined ? [] : lanesAround(geo, seat);

    const clear = nearby.some(
      laneClearFor(geo, index, owners, {
        all: fixed,
        button: [...fixedGround(geo, geo.seats, index), hand],
      })
    );

    if (!clear) {
      return { stuck: index };
    }

    found[index] = nearby;
  }

  return { lanes: found };
};

const LANE_SEARCH = 4000;

const apart = (geo: Geo, lane: Lane, other: Lane) => {
  const [button, pile, tag] = laneBoxes(geo, lane);
  const [theirButton, theirPile, theirTag] = laneBoxes(geo, other);
  const mine = [pile, tag];
  const theirs = [theirPile, theirTag];

  return (
    [button, ...mine].every((box) =>
      theirs.every(
        (them) =>
          box === undefined || them === undefined || overlap(box, them) === 0
      )
    ) &&
    mine.every(
      (box) =>
        box === undefined ||
        theirButton === undefined ||
        overlap(box, theirButton) === 0
    )
  );
};

const chooseLanes = (
  geo: Geo,
  options: readonly (readonly Lane[])[]
): readonly Lane[] | null => {
  const order = options
    .map((choices, index) => ({ choices: choices.length, index }))
    .toSorted((left, right) => left.choices - right.choices)
    .map(({ index }) => index);

  const chosen = new Map<number, Lane>();
  let budget = LANE_SEARCH;

  const place = (step: number): boolean => {
    const index = order[step];

    if (index === undefined) {
      return true;
    }

    for (const lane of options[index] ?? []) {
      budget -= 1;

      if (budget < 0) {
        return false;
      }

      if ([...chosen.values()].every((other) => apart(geo, lane, other))) {
        chosen.set(index, lane);

        if (place(step + 1)) {
          return true;
        }

        chosen.delete(index);
      }
    }

    return false;
  };

  return options.every((choices) => choices.length > 0) && place(0)
    ? options.flatMap((choices, index) => {
        const lane = chosen.get(index) ?? choices[0];

        return lane === undefined ? [] : [lane];
      })
    : null;
};

const fallbackLane = (geo: Geo, seat: SeatGeo | undefined): Lane => {
  const button = { ...geo.interior, r: MIN_BUTTON_RADIUS };

  return (
    (seat === undefined ? undefined : lanesAround(geo, seat)[0]) ?? {
      button,
      pile: geo.interior,
      reach: buttonBox(button),
      tag: "Below",
    }
  );
};

const HERO_TAGS: readonly TagSide[] = ["After", "Before", "Above", "Below"];

const yoursNearest = (owners: readonly Footprint[], point: Pt) => {
  const me = owners.at(-1);

  return (
    me !== undefined &&
    owners.every(
      (other) =>
        other === me || nearerBy(gapToSeat(point, me), gapToSeat(point, other))
    )
  );
};

const clearOn = (geo: Geo, box: Box, taken: readonly Box[]) =>
  onTable(geo, box) && taken.every((other) => overlap(box, other) === 0);

const yourButton = (
  geo: Geo,
  owners: readonly Footprint[],
  ground: readonly Box[],
  hint: readonly Box[]
): ButtonSpot => {
  const r = buttonRadius(geo.self.size);
  const disc = 2 * (r + BUTTON_CLEARANCE);
  const half = geo.self.size / 2;
  const you = ownersOf(geo).at(-1);
  const rivals = owners.slice(0, -1);

  const spots = [
    { r, x: geo.self.x, y: geo.self.y - half - LANE_GAP - disc / 2 },
    ...[1, -1].flatMap((side) =>
      [
        geo.self.y - half + disc / 2,
        geo.self.y,
        geo.self.y + half + CAPTION_DEPTH / 2,
      ].map((y) => ({
        r,
        x: geo.self.x + side * (half * 1.3 + LANE_GAP + disc / 2),
        y,
      }))
    ),
  ];

  const found = (taken: readonly Box[]) =>
    spots.find(
      (spot) =>
        clearOn(geo, buttonBox(spot), taken) && yoursNearest(owners, spot)
    ) ??
    [r, MIN_BUTTON_RADIUS]
      .map((radius) =>
        you === undefined
          ? undefined
          : onTheFelt(
              geo,
              you,
              rivals,
              [...taken, ...you.footprint.boxes],
              radius
            )
      )
      .find((spot) => spot !== undefined);

  return (
    found([...ground, ...hint]) ??
    found(ground) ??
    spots[0] ?? { r, x: geo.self.x, y: geo.self.y }
  );
};

const yourPile = (
  geo: Geo,
  owners: readonly Footprint[],
  ground: readonly Box[]
) => {
  const half = geo.self.size / 2;
  const row = PILE_BOX.h;

  const piles = [
    ...Array.from({ length: 6 }, (__, step) => ({
      x: geo.heroBet.x + ((geo.self.x - geo.heroBet.x) * step) / 6,
      y: geo.heroBet.y,
    })),
    ...[1, -1].flatMap((side) =>
      [0, half + CAPTION_DEPTH / 2].map((drop) => ({
        x: geo.self.x + side * (half * 1.3 + LANE_GAP + geo.laneW / 2),
        y: geo.self.y - half + row / 2 + drop,
      }))
    ),
    { x: geo.self.x, y: geo.self.y - half - LANE_GAP - row / 2 },
  ];

  const placings = piles
    .filter((pile) => pile.y < geo.self.y)
    .flatMap((pile) => HERO_TAGS.map((tag) => ({ pile, tag })));

  return (
    placings.find(({ pile, tag }) => {
      const pileAt = pileBox(pile, geo.pileW);
      const tagAt = postTagBox(pile, tag, POST_TAG_WIDTHS.narrow, geo.pileW);

      return (
        clearOn(geo, pileAt, ground) &&
        clearOn(geo, tagAt, ground) &&
        yoursNearest(owners, centreOf(pileAt)) &&
        yoursNearest(owners, centreOf(tagAt))
      );
    }) ??
    placings[0] ?? { pile: geo.heroBet, tag: "After" as const }
  );
};

const sameHint = (one: HandHint, other: HandHint) =>
  JSON.stringify(one) === JSON.stringify(other);

const hintWith = (geo: Geo, button: ButtonSpot, ground: readonly Box[]) =>
  hintAmong(geo, [...ground, buttonBox(button)]);

interface Laid extends Arrangement {
  readonly hint: HandHint;
}

const withPiles = (geo: Geo, lanes: Arrangement): Geo => ({
  ...geo,
  heroBet: lanes.piles.at(-1) ?? geo.heroBet,
  seats: geo.seats.map((seat, index) => ({
    ...seat,
    bet: lanes.piles[index] ?? seat.bet,
  })),
});

const wideTagFits = (
  geo: Geo,
  seats: readonly Pt[],
  arrangement: Arrangement,
  sides: readonly TagSide[]
): readonly boolean[] => {
  const owners = ownersAt(geo, seats);
  const fixed = fixedGround(geo, seats);

  return arrangement.piles.map((pile, index) => {
    const box = postTagBox(
      pile,
      sides[index] ?? "Before",
      POST_TAG_WIDTHS.wide,
      geo.pileW
    );

    const others = [
      ...arrangement.buttons.map((spot, slot) => {
        const home = geo.seats[slot];

        return home === undefined
          ? buttonBox(spot)
          : foldingReach(geo, home, buttonBox(spot));
      }),
      ...arrangement.piles.flatMap((other, slot) =>
        slot === index
          ? []
          : [
              pileBox(other, geo.pileW),
              postTagBox(
                other,
                arrangement.tags[slot] ?? "Before",
                POST_TAG_WIDTHS.narrow,
                geo.pileW
              ),
              postTagBox(
                other,
                sides[slot] ?? "Before",
                POST_TAG_WIDTHS.wide,
                geo.pileW
              ),
            ]
      ),
    ];

    const own = owners[index];
    const middle = centreOf(box);

    return (
      onTable(geo, box) &&
      [...fixed, ...others].every((other) => overlap(box, other) === 0) &&
      own !== undefined &&
      owners.every(
        (other) =>
          other === own ||
          nearerBy(gapToSeat(middle, own), gapToSeat(middle, other))
      )
    );
  });
};

const lanesOf = (
  geo: Geo,
  candidates: readonly (readonly Lane[])[] = lanesOfEverySeat(geo)
): Laid => {
  const owners = ownersAt(geo, geo.seats);
  const fixed = fixedGround(geo, geo.seats);
  const free = hintAmong(geo, hintFixedGround(geo));

  const button = yourButton(
    geo,
    owners,
    [...fixed, liftedHand(geo)],
    [hintBoxOf(free)]
  );

  const lines = hintWith(geo, button, hintFixedGround(geo));
  const hint = hintBoxOf(lines);
  const middle = [buttonBox(button), lines.say, lines.foot];

  const options = geo.seats.map((__, index) =>
    lanesClearFor(
      geo,
      index,
      owners,
      {
        all: [...fixed, ...middle],
        button: [
          ...fixedGround(geo, geo.seats, index),
          ...middle,
          hint,
          liftedHand(geo),
        ],
      },
      candidates[index] ?? []
    )
  );

  const lanes =
    chooseLanes(geo, options) ??
    geo.seats.map(
      (seat, index) => options[index]?.[0] ?? fallbackLane(geo, seat)
    );

  const yours = yourPile(geo, owners, [
    ...fixed,
    buttonBox(button),
    ...lanes.flatMap((lane) => [
      pileBox(lane.pile, geo.pileW),
      postTagBox(lane.pile, lane.tag, POST_TAG_WIDTHS.narrow, geo.pileW),
    ]),
  ]);

  return {
    buttons: [...lanes.map((lane) => lane.button), button],
    hint: lines,
    piles: [...lanes.map(({ pile }) => pile), yours.pile],
    tags: [...lanes.map(({ tag }) => tag), yours.tag],
  };
};

const todaysArrangement = (
  geo: Geo,
  resting: Geo,
  tags: readonly TagSide[]
) => {
  const spots = buttonSpots(geo);

  return {
    arrangement: {
      buttons: [
        ...spots.seats.map((spot, index) => {
          const home = geo.seats[index];
          const rest = resting.seats[index];

          return home === undefined || rest === undefined
            ? spot
            : {
                ...spot,
                x: spot.x + rest.x - home.x,
                y: spot.y + rest.y - home.y,
              };
        }),
        spots.self,
      ],
      piles: pilesOf(geo),
      tags,
    },
    spots,
  };
};

const FLIGHT_BENDS = [40, 80, 120, 160, 220, 280, 360, 440] as const;

const FLIGHT_TURNS = [
  0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180,
].map((degrees) => (degrees * Math.PI) / 180);

const FLIGHT_STEP_PX = 2;

const FLIGHT_ENDS = 0.06;

export const flightPoint = (from: Pt, control: Pt, to: Pt, u: number): Pt => ({
  x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * control.x + u * u * to.x,
  y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * control.y + u * u * to.y,
});

export const flightSamples = (from: Pt, control: Pt, to: Pt): readonly Pt[] => {
  const travel =
    Math.hypot(control.x - from.x, control.y - from.y) +
    Math.hypot(to.x - control.x, to.y - control.y);

  const steps = Math.max(1, Math.ceil(travel / FLIGHT_STEP_PX));

  return Array.from({ length: steps + 1 }, (__, step) =>
    flightPoint(
      from,
      control,
      to,
      FLIGHT_ENDS + ((1 - 2 * FLIGHT_ENDS) * step) / steps
    )
  );
};

export const flightClears = (
  from: Pt,
  control: Pt,
  to: Pt,
  avoid: readonly Box[],
  reach: number
) =>
  flightSamples(from, control, to).every((point) =>
    avoid.every(
      (box) =>
        overlap(
          {
            h: reach * 2,
            w: reach * 2,
            x: point.x - reach,
            y: point.y - reach,
          },
          box
        ) === 0
    )
  );

export const flightControl = (
  from: Pt,
  to: Pt,
  arc: number,
  avoid: readonly Box[],
  reach: number
): Pt => {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const straight = { x: middle.x, y: middle.y + arc };

  if (avoid.length === 0 || flightClears(from, straight, to, avoid, reach)) {
    return straight;
  }

  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };

  return (
    FLIGHT_BENDS.flatMap((bend) =>
      FLIGHT_TURNS.map((turn) => ({
        x:
          middle.x +
          (normal.x * Math.cos(turn) - normal.y * Math.sin(turn)) * bend,
        y:
          middle.y +
          (normal.x * Math.sin(turn) + normal.y * Math.cos(turn)) * bend,
      }))
    ).find((control) => flightClears(from, control, to, avoid, reach)) ??
    straight
  );
};

export const computeGeo = (
  w: number,
  h: number,
  count: number,
  most = DEFAULT_MOST
): Table => {
  const seated = Math.max(1, count);
  const wide = w > h * WIDE_RATIO;

  const laidOut = (room: Room, judge: LiftJudge, finish: (geo: Geo) => Geo) =>
    wide
      ? liftedForHint(w, h, seated, room, judge, finish)
      : finish(tallGeo(w, h, seated, room));

  const full = pileWidthFor(most, false);

  const today = laidOut(
    {
      cap: Number.POSITIVE_INFINITY,
      laneW: full,
      pileW: full,
      round: 0,
      spacing: "Column",
      tabW: awardTabWidthFor(most),
    },
    TODAYS_LIFT,
    (geo) => geo
  );

  const resting = atRest(today);
  const restingSeats = resting.seats.map(({ x, y }) => ({ x, y }));
  const todaysHint = handHint(today);
  const todaysTags = postTagSides(today, POST_TAG_WIDTHS.narrow);

  const pilesFit =
    clashList(
      today,
      restingSeats,
      { buttons: [], piles: pilesOf(today), tags: todaysTags },
      hintBoxOf(todaysHint),
      "PilesAndTags"
    ).length === 0;

  const kept = pilesFit ? todaysArrangement(today, resting, todaysTags) : null;

  if (
    kept !== null &&
    captionsOnFaces(today, restingSeats) === 0 &&
    clashesOf(today, restingSeats, kept.arrangement, hintBoxOf(todaysHint)) ===
      0
  ) {
    const wideSides = postTagSides(today, POST_TAG_WIDTHS.wide);

    return {
      ...today,
      buttons: kept.spots,
      compactPiles: false,
      fits: true,
      hint: todaysHint,
      lanes: false,
      ...tabsOf(tabPlacesFor(today, restingSeats, todaysHint)),
      tagSides: {
        narrow: kept.arrangement.tags,
        wide: wideSides,
        wideFits: wideTagFits(today, restingSeats, kept.arrangement, wideSides),
      },
    };
  }

  const roomOf = ({ cap, compact, round, spacing }: Attempt): Room => {
    const pileW = pileWidthFor(most, compact);
    const laneW = Math.max(pileW, pileWidthFor(DEFAULT_MOST, compact));

    return { cap, laneW, pileW, round, spacing, tabW: awardTabWidthFor(most) };
  };

  const restedAt = (attempt: Attempt) =>
    laidOut(roomOf(attempt), LANES_LIFT, settled);

  const ringOf = (attempt: Attempt) =>
    JSON.stringify(tallGeo(w, h, seated, roomOf(attempt)).seats);

  let stuckAt = 0;

  const spacingsAt = (cap: number, compact: boolean, round: number) => {
    if (wide) {
      return [{ cap, compact, round, spacing: "Column" as const }];
    }

    const column = ringOf({ cap, compact, round, spacing: "Column" });

    return SPACINGS.flatMap((spacing) => {
      const attempt = { cap, compact, round, spacing };

      return spacing === "Column" || ringOf(attempt) !== column
        ? [attempt]
        : [];
    });
  };

  const laned = (
    rested: Geo,
    candidates: readonly (readonly Lane[])[] = lanesOfEverySeat(rested)
  ): Laned => {
    const lanes = lanesOf(rested, candidates);
    const geo = withPiles(rested, lanes);

    const hint = hintWith(
      geo,
      lanes.buttons.at(-1) ?? { ...geo.self, r: MIN_BUTTON_RADIUS },
      handHintGround(geo)
    );

    const moved = sameHint(hint, lanes.hint) ? 0 : 1;

    const tabsWithout = tabPlacesFor(geo, geo.seats, hint).filter(
      ({ clear }) => !clear
    ).length;

    return {
      clashes:
        clashesOf(geo, geo.seats, lanes, hintBoxOf(hint)) +
        moved +
        tabsWithout +
        captionsOnFaces(geo, geo.seats),
      geo,
      hint,
      lanes,
    };
  };

  const rounds = wide ? [0] : LANE_ROUNDS.map((share) => w * share);

  const fitAmong = (caps: readonly number[], compact: boolean) =>
    firstFitting(
      caps.flatMap((cap) =>
        rounds.flatMap((round) => spacingsAt(cap, compact, round))
      ),
      (attempt) => {
        const rested = restedAt(attempt);
        const seatLanes = lanesIfEverySeatHasOne(rested, stuckAt);

        if ("stuck" in seatLanes) {
          stuckAt = seatLanes.stuck;

          return null;
        }

        return laned(rested, seatLanes.lanes);
      }
    );

  const coarse = capsDown(today.tile, LANE_COARSE);
  let coarseFit: ReturnType<typeof fitAmong> = null;
  let above = Number.POSITIVE_INFINITY;

  for (const cap of coarse) {
    coarseFit = fitAmong([cap], false);

    if (coarseFit !== null) {
      break;
    }

    above = cap;
  }

  const finer = (fit: NonNullable<typeof coarseFit>, from: number) =>
    Number.isFinite(from)
      ? fitAmong(
          capsDown(from, LANE_STEP).filter(
            (cap) => cap < from && cap > fit.attempt.cap
          ),
          false
        )
      : null;

  const fitted = (coarseFit === null
    ? null
    : (finer(coarseFit, above) ?? coarseFit)) ??
    fitAmong([FACE_FLOOR], true) ?? {
      attempt: { cap: FACE_FLOOR, compact: true, round: 0, spacing: "Column" },
      result: laned(
        restedAt({
          cap: FACE_FLOOR,
          compact: true,
          round: 0,
          spacing: "Column",
        })
      ),
    };

  const { geo, hint, lanes } = fitted.result;

  return {
    ...geo,
    buttons: {
      seats: lanes.buttons.slice(0, -1),
      self: lanes.buttons.at(-1) ?? { ...geo.self, r: MIN_BUTTON_RADIUS },
    },
    compactPiles: fitted.attempt.compact,
    fits: fitted.result.clashes === 0,
    hint,
    lanes: true,
    ...tabsOf(tabPlacesFor(geo, geo.seats, hint)),
    tagSides: {
      narrow: lanes.tags,
      wide: lanes.tags,
      wideFits: wideTagFits(geo, geo.seats, lanes, lanes.tags),
    },
  };
};
