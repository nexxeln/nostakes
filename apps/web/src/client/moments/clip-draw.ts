import { Option } from "effect";

import {
  boundsOf,
  cameraAt,
  placedAt,
  poseAt,
} from "../../features/moments/film.js";
import type {
  Box,
  FilmKey,
  Placed,
  Point,
} from "../../features/moments/film.js";

export interface DrawnShot {
  readonly band: number;
  readonly box: Box;
  readonly keys: readonly FilmKey[];
  readonly pinned: boolean;
  readonly pivot: Point;
  readonly size: { readonly height: number; readonly width: number };
  readonly source: Point;
}

export interface Reel {
  readonly camera: readonly FilmKey[];
  readonly height: number;
  readonly scale: number;
  readonly shots: readonly DrawnShot[];
  readonly width: number;
}

const scaledPlace = (placed: Placed, scale: number): Placed => {
  const [a, b, c, d, e, f] = placed.matrix;

  return { alpha: placed.alpha, matrix: [a, b, c, d, e * scale, f * scale] };
};

export const placementsAt = (reel: Reel, ms: number): readonly Placed[] => {
  const camera = cameraAt(
    {
      camera: reel.camera,
      height: reel.height / reel.scale,
      width: reel.width / reel.scale,
    },
    ms
  );

  return reel.shots.map((shot) =>
    scaledPlace(placedAt(shot, poseAt(shot.keys, ms), camera), reel.scale)
  );
};

const meets = (one: Box, other: Box) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

export const drawAreas = (
  ctx: OffscreenCanvasRenderingContext2D,
  bands: readonly ImageBitmap[],
  reel: Reel,
  placements: readonly Placed[],
  areas: readonly Box[]
) => {
  const frame = { height: reel.height, width: reel.width };

  const reach = reel.shots.map((shot, index) => {
    const placed = placements[index];

    return placed === undefined
      ? Option.none<Box>()
      : boundsOf(shot.size, placed, frame);
  });

  for (const area of areas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.width, area.height);
    ctx.clip();
    ctx.clearRect(area.x, area.y, area.width, area.height);

    for (const [index, shot] of reel.shots.entries()) {
      const placed = placements[index];
      const source = bands[shot.band];
      const bounds = reach[index] ?? Option.none<Box>();

      if (
        placed !== undefined &&
        source !== undefined &&
        Option.isSome(bounds) &&
        meets(bounds.value, area)
      ) {
        ctx.globalAlpha = placed.alpha;
        ctx.setTransform(...placed.matrix);
        ctx.drawImage(
          source,
          shot.source.x,
          shot.source.y,
          shot.size.width,
          shot.size.height,
          0,
          0,
          shot.size.width,
          shot.size.height
        );
      }
    }

    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};
