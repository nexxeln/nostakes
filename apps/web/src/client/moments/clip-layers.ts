import { Effect, Schema } from "effect";

import {
  BASE_ROLE,
  bandsOf,
  packCells,
} from "../../features/moments/clip-plan.js";
import type {
  Band,
  Box,
  Layer,
  Packed,
} from "../../features/moments/clip-plan.js";
import { pivotOf } from "../../features/moments/film.js";
import type { Shot } from "../../features/moments/film.js";
import type { DrawnShot } from "./clip-draw.js";
import { indexOf, isGraphic, roleOf, topParts } from "./clip-measure.js";
import type { PartBox } from "./clip-measure.js";

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

const MARGIN = 8;

const SVG = "http://www.w3.org/2000/svg";

const offsetOf = (part: SVGGraphicsElement, root: Element) => {
  const at = { x: 0, y: 0 };

  for (
    let node = part.parentElement;
    node !== null && node !== root;
    node = node.parentElement
  ) {
    if (!isGraphic(node) || node.localName === "svg") {
      throw new Error(`the part ${roleOf(part)} sits inside a nested viewport`);
    }

    const matrix = node.transform.baseVal.consolidate()?.matrix;

    if (matrix !== undefined) {
      if (
        matrix.a !== 1 ||
        matrix.b !== 0 ||
        matrix.c !== 0 ||
        matrix.d !== 1
      ) {
        throw new Error(
          `the part ${roleOf(part)} sits under a transform that is not a plain move`
        );
      }

      at.x += matrix.e;
      at.y += matrix.f;
    }
  }

  return at;
};

interface Measured {
  readonly centre: Layer["centre"];
  readonly cell: Box;
  readonly index: number;
  readonly local: { readonly x: number; readonly y: number };
  readonly markup: string;
  readonly role: string;
}

const placed = (
  part: SVGGraphicsElement,
  root: Element,
  measured: PartBox,
  serializer: XMLSerializer
): Measured => {
  if (measured.role !== roleOf(part) || measured.index !== indexOf(part)) {
    throw new Error(
      `the table showed ${measured.role} ${measured.index} where the picture has ${roleOf(part)} ${indexOf(part)}`
    );
  }

  const offset = offsetOf(part, root);
  const { box } = measured;
  const x = Math.floor(box.x + offset.x - MARGIN);
  const y = Math.floor(box.y + offset.y - MARGIN);

  return {
    cell: {
      height: Math.ceil(box.y + offset.y + box.height + MARGIN) - y,
      width: Math.ceil(box.x + offset.x + box.width + MARGIN) - x,
      x,
      y,
    },
    centre: {
      x: box.x + offset.x + box.width / 2,
      y: box.y + offset.y + box.height / 2,
    },
    index: measured.index,
    local: { x: x - offset.x, y: y - offset.y },
    markup: serializer.serializeToString(part),
    role: measured.role,
  };
};

const layersIn = (
  svg: string,
  boxes: readonly PartBox[],
  size: { readonly height: number; readonly width: number }
): readonly Measured[] => {
  const root = new DOMParser().parseFromString(
    svg,
    "image/svg+xml"
  ).documentElement;

  const serializer = new XMLSerializer();
  const parts = topParts(root);

  if (parts.length !== boxes.length) {
    throw new Error(
      `the table showed ${boxes.length} parts and the picture has ${parts.length}`
    );
  }

  const layers = parts.map((part, index) => {
    const measured = boxes[index];

    if (measured === undefined) {
      throw new Error(`no measure for part ${index}`);
    }

    return placed(part, root, measured, serializer);
  });

  for (const part of parts) {
    part.remove();
  }

  return [
    {
      cell: { height: size.height, width: size.width, x: 0, y: 0 },
      centre: { x: size.width / 2, y: size.height / 2 },
      index: 0,
      local: { x: 0, y: 0 },
      markup: [...root.childNodes]
        .map((node) => serializer.serializeToString(node))
        .join(""),
      role: BASE_ROLE,
    },
    ...layers,
  ];
};

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

    return [
      `<svg x="${source.x}" y="${source.y}" width="${width}" height="${height}" viewBox="${layer.local.x} ${layer.local.y} ${width} ${height}" overflow="hidden">${layer.markup}</svg>`,
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

export interface CardPart {
  readonly art: string;
  readonly cell: Box;
  readonly centre: { readonly x: number; readonly y: number };
  readonly index: number;
  readonly role: string;
}

export const cardParts = (
  svg: string,
  boxes: readonly PartBox[],
  size: { readonly height: number; readonly width: number }
): Effect.Effect<readonly CardPart[], ClipUnavailable> =>
  Effect.try({
    catch: failedAt("lay the picture's parts out"),
    try: () =>
      layersIn(svg, boxes, size).map((layer) => ({
        art:
          layer.cell.x === layer.local.x && layer.cell.y === layer.local.y
            ? layer.markup
            : `<g transform="translate(${layer.cell.x - layer.local.x} ${layer.cell.y - layer.local.y})">${layer.markup}</g>`,
        cell: layer.cell,
        centre: layer.centre,
        index: layer.index,
        role: layer.role,
      })),
  });

export interface ShotAtlas {
  readonly bands: readonly ImageBitmap[];
  readonly shots: readonly DrawnShot[];
}

const artKey = (shot: Shot) =>
  `${shot.box.x},${shot.box.y},${shot.box.width},${shot.box.height}|${shot.art}`;

export const shotAtlas = (
  shots: readonly Shot[],
  fonts: string,
  slot: Effect.Effect<void>
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

    const measured: readonly Measured[] = unique.map((shot, index) => ({
      cell: shot.box,
      centre: pivotOf(shot),
      index,
      local: { x: shot.box.x, y: shot.box.y },
      markup: shot.art,
      role: "shot",
    }));

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
          source: drawn.places[art]?.source ?? { x: 0, y: 0 },
        };
      }),
    };
  });
