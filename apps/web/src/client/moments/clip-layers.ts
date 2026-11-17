import { Effect, Schema } from "effect";

import { bandsOf, packCells } from "../../features/moments/atlas.js";
import type { Band, Packed } from "../../features/moments/atlas.js";
import { pivotOf } from "../../features/moments/film.js";
import type { Box, Point, Shot } from "../../features/moments/film.js";
import type { DrawnShot } from "./clip-draw.js";

export class ClipUnavailable extends Schema.TaggedError<
  ClipUnavailable,
  { readonly brand: unique symbol }
>()("ClipUnavailable", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `This device could not make the moment's clip at "${this.step}": ${this.detail}. Keep the picture instead.`;
  }
}

export const failedAt =
  (step: string) =>
  (cause: unknown): ClipUnavailable =>
    new ClipUnavailable({ detail: String(cause), step });

const SVG = "http://www.w3.org/2000/svg";

interface Measured {
  readonly centre: Point;
  readonly cell: Box;
  readonly index: number;
  readonly local: { readonly x: number; readonly y: number };
  readonly markup: string;
  readonly role: string;
  readonly view?: { readonly height: number; readonly width: number };
}

const bandSvg = (
  fonts: string,
  measured: readonly Measured[],
  packed: Packed,
  band: Band
) => {
  const cells = band.members.flatMap((index) => {
    const layer = measured[index];
    const source = packed.sources[index];

    if (layer === undefined || source === undefined) {
      return [];
    }

    const { height, width } = layer.cell;
    const view = layer.view ?? { height, width };

    return [
      `<svg x="${source.x}" y="${source.y}" width="${width}" height="${height}" viewBox="${layer.local.x} ${layer.local.y} ${view.width} ${view.height}" overflow="hidden">${layer.markup}</svg>`,
    ];
  });

  const lettered = cells.some((cell) => cell.includes("<text"));

  return [
    `<svg xmlns="${SVG}" width="${band.width}" height="${band.height}" viewBox="0 ${band.top} ${band.width} ${band.height}">`,
    lettered ? `<style>${fonts}</style>` : "",
    ...cells,
    "</svg>",
  ].join("");
};

const bandBitmap = (svg: string, band: Band, slot: Effect.Effect<void>) => {
  const image = new Image();

  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return Effect.tryPromise({
    catch: failedAt("decode the clip's art"),
    try: () => image.decode(),
  }).pipe(
    Effect.andThen(slot),
    Effect.andThen(
      Effect.try({
        catch: failedAt("draw the clip's art"),
        try: () => {
          const canvas = new OffscreenCanvas(band.width, band.height);

          canvas.getContext("2d")?.drawImage(image, 0, 0);

          return canvas.transferToImageBitmap();
        },
      })
    )
  );
};

interface Rasterized {
  readonly bands: readonly ImageBitmap[];
  readonly places: readonly {
    readonly band: number;
    readonly source: { readonly x: number; readonly y: number };
  }[];
}

const rasterized = (
  measured: readonly Measured[],
  fonts: string,
  slot: Effect.Effect<void>
): Effect.Effect<Rasterized, ClipUnavailable> =>
  Effect.gen(function* drawAtlas() {
    const cells = measured.map((layer) => layer.cell);
    const packed = packCells(cells);
    const bands = bandsOf(cells, packed);
    const bitmaps: ImageBitmap[] = [];

    for (const band of bands) {
      yield* slot;
      bitmaps.push(
        yield* bandBitmap(bandSvg(fonts, measured, packed, band), band, slot)
      );
    }

    return {
      bands: bitmaps,
      places: measured.map((_, index) => {
        const band = Math.max(
          0,
          bands.findIndex((each) => each.members.includes(index))
        );

        const source = packed.sources[index] ?? { x: 0, y: 0 };

        return {
          band,
          source: { x: source.x, y: source.y - (bands[band]?.top ?? 0) },
        };
      }),
    };
  });

export interface ShotAtlas {
  readonly bands: readonly ImageBitmap[];
  readonly shots: readonly DrawnShot[];
}

const artKey = (shot: Shot) =>
  `${shot.box.x},${shot.box.y},${shot.box.width},${shot.box.height}|${shot.art}`;

const scaledSize = (box: Box, scale: number) => ({
  height: Math.max(1, Math.ceil(box.height * scale)),
  width: Math.max(1, Math.ceil(box.width * scale)),
});

export const shotAtlas = (
  shots: readonly Shot[],
  fonts: string,
  slot: Effect.Effect<void>,
  scale = 1
): Effect.Effect<ShotAtlas, ClipUnavailable> =>
  Effect.gen(function* buildShots() {
    const firsts = new Map<string, number>();

    for (const [index, shot] of shots.entries()) {
      if (!firsts.has(artKey(shot))) {
        firsts.set(artKey(shot), index);
      }
    }

    const unique = [...firsts.values()].flatMap((index) => {
      const shot = shots[index];

      return shot === undefined ? [] : [shot];
    });

    const measured: readonly Measured[] = unique.map((shot, index) => {
      const size = scaledSize(shot.box, scale);

      return {
        cell: { ...size, x: shot.box.x, y: shot.box.y },
        centre: pivotOf(shot),
        index,
        local: { x: shot.box.x, y: shot.box.y },
        markup: shot.art,
        role: "shot",
        view: { height: size.height / scale, width: size.width / scale },
      };
    });

    const drawn = yield* rasterized(measured, fonts, slot);
    const keys = [...firsts.keys()];

    return {
      bands: drawn.bands,
      shots: shots.map((shot) => {
        const art = keys.indexOf(artKey(shot));

        return {
          band: drawn.places[art]?.band ?? 0,
          box: shot.box,
          keys: shot.keys,
          pinned: shot.pinned === true,
          pivot: pivotOf(shot),
          size: scaledSize(shot.box, scale),
          source: drawn.places[art]?.source ?? { x: 0, y: 0 },
        };
      }),
    };
  });
