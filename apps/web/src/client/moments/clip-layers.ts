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

export interface Atlas {
  readonly bands: readonly ImageBitmap[];
  readonly layers: readonly Layer[];
}

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

export const atlasOf = (
  svg: string,
  look: {
    readonly boxes: readonly PartBox[];
    readonly fonts: string;
    readonly size: { readonly height: number; readonly width: number };
  },
  slot: Effect.Effect<void>
): Effect.Effect<Atlas, ClipUnavailable> =>
  Effect.gen(function* buildAtlas() {
    yield* slot;

    const measured = yield* Effect.try({
      catch: failedAt("lay the picture's parts out"),
      try: () => layersIn(svg, look.boxes, look.size),
    });

    const cells = measured.map((layer) => layer.cell);
    const packed = packCells(cells);
    const bands = bandsOf(cells, packed);
    const bitmaps: ImageBitmap[] = [];

    for (const band of bands) {
      yield* slot;
      bitmaps.push(
        yield* bandBitmap(
          bandSvg(look.fonts, measured, packed, band),
          band,
          slot
        )
      );
    }

    const bandOf = (index: number) =>
      Math.max(
        0,
        bands.findIndex((band) => band.members.includes(index))
      );

    return {
      bands: bitmaps,
      layers: measured.map((layer, index) => {
        const band = bandOf(index);
        const source = packed.sources[index] ?? { x: 0, y: 0 };

        return {
          band,
          cell: layer.cell,
          centre: layer.centre,
          index: layer.index,
          role: layer.role,
          source: { x: source.x, y: source.y - (bands[band]?.top ?? 0) },
        };
      }),
    };
  });
