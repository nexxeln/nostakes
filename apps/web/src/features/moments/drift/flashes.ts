import { Option } from "effect";

import { boundsOf, cameraAt, placedAt, poseAt } from "../film.js";
import type { FilmKey, FilmRate, Shot } from "../film.js";
import type { Paint } from "./art.js";

export interface PaintedFilm {
  readonly camera: readonly FilmKey[];
  readonly fps: FilmRate;
  readonly height: number;
  readonly length: number;
  readonly shots: readonly (Shot & { readonly paint: Paint })[];
  readonly width: number;
}

export const FLASH_LIMIT = 3;

export const FLASH_STEP = 0.1;

export const DARK_BELOW = 0.8;

export const SATURATED_RED = 0.8;

const CELL = 120;

const REGION = { columns: 3, rows: 5 };

const lightsAt = (film: PaintedFilm, ms: number) => {
  const columns = Math.ceil(film.width / CELL);
  const rows = Math.ceil(film.height / CELL);
  const lights = new Float32Array(columns * rows);
  const camera = cameraAt(film, ms);

  for (const shot of film.shots) {
    const placed = placedAt(shot, poseAt(shot.keys, ms), camera);
    const bounds = Option.getOrNull(boundsOf(shot.box, placed, film));

    if (bounds !== null) {
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;

      for (
        let row = Math.floor(bounds.y / CELL);
        row * CELL < bottom;
        row += 1
      ) {
        for (
          let column = Math.floor(bounds.x / CELL);
          column * CELL < right;
          column += 1
        ) {
          const across =
            Math.min(right, (column + 1) * CELL) -
            Math.max(bounds.x, column * CELL);

          const down =
            Math.min(bottom, (row + 1) * CELL) - Math.max(bounds.y, row * CELL);

          const share =
            (placed.alpha * shot.paint.cover * across * down) / (CELL * CELL);

          const at = row * columns + column;

          lights[at] =
            (lights[at] ?? 0) * (1 - share) + shot.paint.luminance * share;
        }
      }
    }
  }

  return { columns, lights, rows };
};

const turnsIn = (series: readonly number[]) => {
  const turns: number[] = [];
  let low = series[0] ?? 0;
  let high = low;
  let heading = 0;

  for (const [frame, light] of series.entries()) {
    if (heading >= 0 && light > high) {
      high = light;
    }

    if (heading <= 0 && light < low) {
      low = light;
    }

    if (heading >= 0 && high - light >= FLASH_STEP && light < DARK_BELOW) {
      turns.push(frame);
      heading = -1;
      low = light;
      high = light;
    } else if (heading <= 0 && light - low >= FLASH_STEP && low < DARK_BELOW) {
      turns.push(frame);
      heading = 1;
      low = light;
      high = light;
    }
  }

  return turns;
};

const mostInASecond = (series: readonly number[], fps: number) => {
  const turns = turnsIn(series);
  let most = 0;

  for (const [index, first] of turns.entries()) {
    const within = turns
      .slice(index)
      .filter((frame) => frame - first < fps).length;

    most = Math.max(most, Math.floor(within / 2));
  }

  return most;
};

export interface Flashes {
  readonly region: number;
  readonly whole: number;
}

export const flashesIn = (film: PaintedFilm): Flashes => {
  const frames = Math.ceil((film.length * film.fps) / 1000);

  const lit = Array.from({ length: frames }, (_, frame) =>
    lightsAt(film, (frame * 1000) / film.fps)
  );

  const [first] = lit;

  if (first === undefined) {
    return { region: 0, whole: 0 };
  }

  const { columns, rows } = first;

  const meanOver = (left: number, top: number, wide: number, tall: number) =>
    lit.map(({ lights }) => {
      let total = 0;

      for (let row = top; row < top + tall; row += 1) {
        for (let column = left; column < left + wide; column += 1) {
          total += lights[row * columns + column] ?? 0;
        }
      }

      return total / (wide * tall);
    });

  let region = 0;

  for (let top = 0; top + REGION.rows <= rows; top += 1) {
    for (let left = 0; left + REGION.columns <= columns; left += 1) {
      region = Math.max(
        region,
        mostInASecond(
          meanOver(left, top, REGION.columns, REGION.rows),
          film.fps
        )
      );
    }
  }

  return {
    region,
    whole: mostInASecond(meanOver(0, 0, columns, rows), film.fps),
  };
};
