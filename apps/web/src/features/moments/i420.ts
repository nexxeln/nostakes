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
  const half = frame.width / 2;
  const blueAt = frame.width * frame.height;
  const redAt = blueAt + half * (frame.height / 2);
  let r = 0;
  let g = 0;
  let b = 0;

  const take = (row: number, col: number) => {
    const at = offset + (row - area.y) * stride + (col - area.x) * 4;
    const red = bytes[at + order.red] ?? 0;
    const green = bytes[at + order.green] ?? 0;
    const blue = bytes[at + order.blue] ?? 0;

    r += red;
    g += green;
    b += blue;
    into[row * frame.width + col] =
      LUMA_FLOOR + LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue;
  };

  for (let row = area.y; row < area.y + area.height; row += 2) {
    for (let col = area.x; col < area.x + area.width; col += 2) {
      r = 0;
      g = 0;
      b = 0;
      take(row, col);
      take(row, col + 1);
      take(row + 1, col);
      take(row + 1, col + 1);

      const shade = luma(r / 4, g / 4, b / 4);
      const chroma = (row / 2) * half + col / 2;

      into[blueAt + chroma] = CHROMA_ZERO + BLUE_SCALE * (b / 4 - shade);
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
