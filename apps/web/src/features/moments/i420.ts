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

export const writeI420 = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  into: Uint8Array
) => {
  const half = width / 2;
  const blueAt = width * height;
  const redAt = blueAt + half * (height / 2);
  let r = 0;
  let g = 0;
  let b = 0;

  const take = (pixel: number) => {
    const at = pixel * 4;
    const red = rgba[at] ?? 0;
    const green = rgba[at + 1] ?? 0;
    const blue = rgba[at + 2] ?? 0;

    r += red;
    g += green;
    b += blue;
    into[pixel] =
      LUMA_FLOOR + LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue;
  };

  for (let row = 0; row < height; row += 2) {
    for (let col = 0; col < width; col += 2) {
      const top = row * width + col;

      r = 0;
      g = 0;
      b = 0;
      take(top);
      take(top + 1);
      take(top + width);
      take(top + width + 1);

      const shade = luma(r / 4, g / 4, b / 4);
      const chroma = (row / 2) * half + col / 2;

      into[blueAt + chroma] = CHROMA_ZERO + BLUE_SCALE * (b / 4 - shade);
      into[redAt + chroma] = CHROMA_ZERO + RED_SCALE * (r / 4 - shade);
    }
  }

  return into;
};
