import type { Box } from "./film.js";

export const CLIP_FPS = 30;

const GUTTER = 2;

export const ATLAS_WIDTH = 2048;

export interface Packed {
  readonly height: number;
  readonly sources: readonly { readonly x: number; readonly y: number }[];
  readonly width: number;
}

export const packCells = (cells: readonly Box[]): Packed => {
  const width = Math.max(
    ATLAS_WIDTH,
    ...cells.map((cell) => cell.width + GUTTER)
  );

  const order = cells
    .map((cell, index) => ({ cell, index }))
    .toSorted((one, other) => other.cell.height - one.cell.height);

  const sources = cells.map(() => ({ x: 0, y: 0 }));
  let shelf = { height: 0, x: 0, y: 0 };

  for (const { cell, index } of order) {
    if (shelf.x + cell.width > width) {
      shelf = { height: 0, x: 0, y: shelf.y + shelf.height + GUTTER };
    }

    sources[index] = { x: shelf.x, y: shelf.y };
    shelf = {
      height: Math.max(shelf.height, cell.height),
      x: shelf.x + cell.width + GUTTER,
      y: shelf.y,
    };
  }

  return { height: shelf.y + shelf.height, sources, width };
};

export const BAND_AREA = 600_000;

export interface Band {
  readonly height: number;
  readonly members: readonly number[];
  readonly top: number;
  readonly width: number;
}

export const bandsOf = (
  cells: readonly Box[],
  packed: Packed
): readonly Band[] => {
  const shelves = new Map<number, number[]>();

  for (const index of cells.keys()) {
    const top = packed.sources[index]?.y ?? 0;

    shelves.set(top, [...(shelves.get(top) ?? []), index]);
  }

  const bands: {
    area: number;
    bottom: number;
    members: number[];
    top: number;
  }[] = [];

  for (const [top, members] of [...shelves.entries()].toSorted(
    ([one], [other]) => one - other
  )) {
    const area = members.reduce(
      (total, index) =>
        total + (cells[index]?.width ?? 0) * (cells[index]?.height ?? 0),
      0
    );

    const bottom = Math.max(
      ...members.map((index) => top + (cells[index]?.height ?? 0))
    );

    const open = bands.at(-1);

    if (open !== undefined && open.area + area <= BAND_AREA) {
      open.area += area;
      open.bottom = Math.max(open.bottom, bottom);
      open.members.push(...members);
    } else {
      bands.push({ area, bottom, members: [...members], top });
    }
  }

  return bands.map((band) => ({
    height: band.bottom - band.top,
    members: band.members,
    top: band.top,
    width: Math.max(
      ...band.members.map(
        (index) => (packed.sources[index]?.x ?? 0) + (cells[index]?.width ?? 0)
      )
    ),
  }));
};
