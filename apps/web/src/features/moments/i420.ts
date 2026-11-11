export const LIMITED_BT709 = {
  fullRange: false,
  matrix: "bt709",
  primaries: "bt709",
  transfer: "iec61966-2-1",
} as const;

const RED = 0.2126;

const GREEN = 0.7152;

const BLUE = 0.0722;

const LUMA_SPAN = 219 / 255;

const CHROMA_SPAN = 224 / 255;

const BLUE_SCALE = CHROMA_SPAN / (2 * (1 - BLUE));

const RED_SCALE = CHROMA_SPAN / (2 * (1 - RED));

const ROUNDED_BY_TRUNCATION = 0.5;

const LUMA_FLOOR = 16 + ROUNDED_BY_TRUNCATION;

const CHROMA_ZERO = 128 + ROUNDED_BY_TRUNCATION;

export const i420Size = (width: number, height: number) =>
  width * height + 2 * (width / 2) * (height / 2);

const luma = (r: number, g: number, b: number) =>
  RED * r + GREEN * g + BLUE * b;

const LUMA_RED = LUMA_SPAN * RED;

const LUMA_GREEN = LUMA_SPAN * GREEN;

const LUMA_BLUE = LUMA_SPAN * BLUE;

export interface Channels {
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

export const RGBA_ORDER: Channels = { blue: 2, green: 1, red: 0 };

export const BGRA_ORDER: Channels = { blue: 0, green: 1, red: 2 };

export interface Pixels {
  readonly bytes: Uint8Array | Uint8ClampedArray;
  readonly offset: number;
  readonly order: Channels;
  readonly stride: number;
}

export interface Area {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export const writeI420Area = (
  pixels: Pixels,
  area: Area,
  frame: { readonly height: number; readonly width: number },
  into: Uint8Array
) => {
  const { bytes, offset, order, stride } = pixels;
  const { red: R, green: G, blue: B } = order;
  const { width } = frame;
  const half = width / 2;
  const blueAt = width * frame.height;
  const redAt = blueAt + half * (frame.height / 2);
  const right = area.x + area.width;
  const bottom = area.y + area.height;

  for (let row = area.y; row < bottom; row += 2) {
    const upper = offset + (row - area.y) * stride - area.x * 4;
    const lower = upper + stride;
    const lumaUpper = row * width;
    const lumaLower = lumaUpper + width;
    const chromaRow = (row / 2) * half;

    for (let col = area.x; col < right; col += 2) {
      const a = upper + col * 4;
      const b = a + 4;
      const c = lower + col * 4;
      const d = c + 4;
      const r0 = bytes[a + R] ?? 0;
      const g0 = bytes[a + G] ?? 0;
      const b0 = bytes[a + B] ?? 0;
      const r1 = bytes[b + R] ?? 0;
      const g1 = bytes[b + G] ?? 0;
      const b1 = bytes[b + B] ?? 0;
      const r2 = bytes[c + R] ?? 0;
      const g2 = bytes[c + G] ?? 0;
      const b2 = bytes[c + B] ?? 0;
      const r3 = bytes[d + R] ?? 0;
      const g3 = bytes[d + G] ?? 0;
      const b3 = bytes[d + B] ?? 0;

      into[lumaUpper + col] =
        LUMA_FLOOR + LUMA_RED * r0 + LUMA_GREEN * g0 + LUMA_BLUE * b0;
      into[lumaUpper + col + 1] =
        LUMA_FLOOR + LUMA_RED * r1 + LUMA_GREEN * g1 + LUMA_BLUE * b1;
      into[lumaLower + col] =
        LUMA_FLOOR + LUMA_RED * r2 + LUMA_GREEN * g2 + LUMA_BLUE * b2;
      into[lumaLower + col + 1] =
        LUMA_FLOOR + LUMA_RED * r3 + LUMA_GREEN * g3 + LUMA_BLUE * b3;

      const r = r0 + r1 + r2 + r3;
      const g = g0 + g1 + g2 + g3;
      const bl = b0 + b1 + b2 + b3;
      const shade = luma(r / 4, g / 4, bl / 4);
      const chroma = chromaRow + col / 2;

      into[blueAt + chroma] = CHROMA_ZERO + BLUE_SCALE * (bl / 4 - shade);
      into[redAt + chroma] = CHROMA_ZERO + RED_SCALE * (r / 4 - shade);
    }
  }

  return into;
};

export const writeI420 = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  into: Uint8Array
) =>
  writeI420Area(
    { bytes: rgba, offset: 0, order: RGBA_ORDER, stride: width * 4 },
    { height, width, x: 0, y: 0 },
    { height, width },
    into
  );
