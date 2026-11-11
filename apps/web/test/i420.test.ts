import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { i420Size, writeI420 } from "../src/features/moments/i420.js";
import { sequenceOf } from "../src/features/moments/sps.js";

const block = (pixels: readonly (readonly [number, number, number])[]) => {
  const rgba = new Uint8ClampedArray(16);

  for (const [index, [r, g, b]] of pixels.entries()) {
    rgba.set([r, g, b, 255], index * 4);
  }

  const out = writeI420(rgba, 2, 2, new Uint8Array(i420Size(2, 2)));

  return { blue: out[4], luma: [...out.subarray(0, 4)], red: out[5] };
};

const solid = (r: number, g: number, b: number) => {
  const found = block([
    [r, g, b],
    [r, g, b],
    [r, g, b],
    [r, g, b],
  ]);

  return [found.luma[0], found.blue, found.red];
};

const hex = (text: string) =>
  Uint8Array.from(
    text.match(/../gu)?.map((pair) => Number.parseInt(pair, 16)) ?? []
  );

const CHROMIUM_CANVAS =
  "01640c28ffe1001467640c28ac18d0088055f2cd37010d010784423501000468ce3c80fdf8f800";

const WEBKIT_CANVAS =
  "01640028ffe1001127640028ac56804402af9669b80868081001000428ee3cb0fdf8f800";

const CHROMIUM_LIMITED =
  "01640c28ffe1001467640c28ac18d0088055f2cd35010d010784423501000468ce3c80fdf8f800";

const WEBKIT_LIMITED =
  "01640028ffe1001127640028ac56804402af9669a80868081001000428ee3cb0fdf8f800";

const pixels = Arbitrary.schema(
  Schema.Array(
    Schema.Int.check(Schema.isBetween({ maximum: 255, minimum: 0 }))
  ).check(Schema.isMinLength(16), Schema.isMaxLength(16))
);

describe("a clip's frames in limited-range BT.709", () => {
  it("turns the primaries, white, and black into the published BT.709 limited-range codes", () => {
    expect({
      black: solid(0, 0, 0),
      blue: solid(0, 0, 255),
      green: solid(0, 255, 0),
      red: solid(255, 0, 0),
      white: solid(255, 255, 255),
    }).toStrictEqual({
      black: [16, 128, 128],
      blue: [32, 240, 118],
      green: [173, 42, 26],
      red: [63, 102, 240],
      white: [235, 128, 128],
    });
  });

  it("keeps each pixel's own luma and averages the colour of each two by two block", () => {
    expect(
      block([
        [255, 0, 0],
        [0, 0, 255],
        [255, 0, 0],
        [0, 0, 255],
      ])
    ).toStrictEqual({ blue: 171, luma: [63, 32, 63, 32], red: 179 });
  });

  it.prop(
    "never leaves the legal range a player expects",
    { channels: pixels },
    ({ channels }) => {
      const rgba = Uint8ClampedArray.from(channels);
      const out = writeI420(rgba, 2, 2, new Uint8Array(i420Size(2, 2)));
      const luma = [...out.subarray(0, 4)];
      const chroma = [...out.subarray(4)];

      expect({
        chroma: chroma.every((value) => value >= 16 && value <= 240),
        luma: luma.every((value) => value >= 16 && value <= 235),
      }).toStrictEqual({ chroma: true, luma: true });
    }
  );
});

describe("the colour a clip's H.264 stream declares", () => {
  it("reads what each browser's encoder writes in the sequence parameter set", () => {
    expect(
      [CHROMIUM_CANVAS, WEBKIT_CANVAS, CHROMIUM_LIMITED, WEBKIT_LIMITED].map(
        (text) => sequenceOf(hex(text))
      )
    ).toStrictEqual([
      {
        colour: { fullRange: true, matrix: 1, primaries: 1, transfer: 13 },
        height: 1350,
        profile: 100,
        width: 1080,
      },
      {
        colour: { fullRange: true, matrix: 1, primaries: 1, transfer: 13 },
        height: 1350,
        profile: 100,
        width: 1080,
      },
      {
        colour: { fullRange: false, matrix: 1, primaries: 1, transfer: 13 },
        height: 1350,
        profile: 100,
        width: 1080,
      },
      {
        colour: { fullRange: false, matrix: 1, primaries: 1, transfer: 13 },
        height: 1350,
        profile: 100,
        width: 1080,
      },
    ]);
  });

  it("finds no sequence in a description that carries none", () => {
    expect(sequenceOf(Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe0))).toBe(null);
  });
});
