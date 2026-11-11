import { Effect } from "effect";

import { drawAreas, placementsAt } from "../../src/client/moments/clip-draw.js";
import { shotAtlas } from "../../src/client/moments/clip-layers.js";
import type { ClipUnavailable } from "../../src/client/moments/clip-layers.js";
import { EMBEDDED_FONTS } from "../../src/client/pictures/png.js";
import type { Film } from "../../src/features/moments/film.js";

export interface Sheet {
  readonly png: string;
  readonly times: readonly number[];
}

const base64Of = (bytes: Uint8Array) => {
  let binary = "";

  for (let at = 0; at < bytes.length; at += 32_768) {
    binary += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  }

  return btoa(binary);
};

export const evenTimes = (film: Film, count: number) =>
  Array.from({ length: count }, (_, index) =>
    Math.round((index * (film.length - 1)) / Math.max(1, count - 1))
  );

export const filmSheet = (
  film: Film,
  layout: {
    readonly scale: number;
    readonly tile: number;
    readonly times: readonly number[];
  }
): Effect.Effect<Sheet, ClipUnavailable> =>
  Effect.gen(function* drawSheet() {
    const atlas = yield* shotAtlas(film.shots, EMBEDDED_FONTS, Effect.void);
    const reel = { ...film, shots: atlas.shots };
    const { scale, tile, times } = layout;
    const cellWidth = Math.round(film.width * scale);
    const cellHeight = Math.round(film.height * scale);

    const sheet = new OffscreenCanvas(
      cellWidth * tile,
      cellHeight * Math.ceil(times.length / tile)
    );

    const frame = new OffscreenCanvas(film.width, film.height);
    const sheetContext = sheet.getContext("2d");
    const context = frame.getContext("2d");

    if (sheetContext !== null && context !== null) {
      for (const [index, ms] of times.entries()) {
        drawAreas(context, atlas.bands, reel, placementsAt(reel, ms), [
          { height: film.height, width: film.width, x: 0, y: 0 },
        ]);
        sheetContext.drawImage(
          frame,
          (index % tile) * cellWidth,
          Math.floor(index / tile) * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }

    const blob = yield* Effect.promise(() =>
      sheet.convertToBlob({ type: "image/png" })
    );

    return {
      png: base64Of(
        new Uint8Array(yield* Effect.promise(() => blob.arrayBuffer()))
      ),
      times,
    };
  });
