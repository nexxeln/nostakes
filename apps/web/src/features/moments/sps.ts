export interface VideoColour {
  readonly fullRange: boolean;
  readonly matrix: number;
  readonly primaries: number;
  readonly transfer: number;
}

export interface Sequence {
  readonly colour: VideoColour | null;
  readonly height: number;
  readonly profile: number;
  readonly width: number;
}

const CHROMA_PROFILES = new Set([
  44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244,
]);

const EXTENDED_SAR = 255;

const MACROBLOCK = 16;

class BitReader {
  readonly #bytes: Uint8Array;
  #at = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  bit() {
    const byte = this.#bytes[Math.floor(this.#at / 8)] ?? 0;
    const bit = Math.floor(byte / 2 ** (7 - (this.#at % 8))) % 2;

    this.#at += 1;

    return bit;
  }

  bits(count: number) {
    let value = 0;

    for (let index = 0; index < count; index += 1) {
      value = value * 2 + this.bit();
    }

    return value;
  }

  flag() {
    return this.bit() === 1;
  }

  unsigned() {
    let zeros = 0;

    while (this.bit() === 0 && zeros < 32) {
      zeros += 1;
    }

    return 2 ** zeros - 1 + this.bits(zeros);
  }

  signed() {
    const code = this.unsigned();

    return code % 2 === 1 ? (code + 1) / 2 : -code / 2;
  }
}

const unescaped = (nal: Uint8Array) => {
  const out: number[] = [];

  for (const [index, byte] of nal.entries()) {
    const escape =
      byte === 3 && index >= 2 && nal[index - 1] === 0 && nal[index - 2] === 0;

    if (!escape) {
      out.push(byte);
    }
  }

  return Uint8Array.from(out);
};

const skipScalingList = (reader: BitReader, size: number) => {
  let last = 8;
  let next = 8;

  for (let index = 0; index < size && next !== 0; index += 1) {
    next = (last + reader.signed() + 256) % 256;
    last = next === 0 ? last : next;
  }
};

const skipChromaFormat = (reader: BitReader) => {
  const chroma = reader.unsigned();

  if (chroma === 3) {
    reader.bit();
  }

  reader.unsigned();
  reader.unsigned();
  reader.bit();

  if (reader.flag()) {
    for (let index = 0; index < (chroma === 3 ? 12 : 8); index += 1) {
      if (reader.flag()) {
        skipScalingList(reader, index < 6 ? 16 : 64);
      }
    }
  }
};

const skipPictureOrder = (reader: BitReader) => {
  const kind = reader.unsigned();

  if (kind === 0) {
    reader.unsigned();
  } else if (kind === 1) {
    reader.bit();
    reader.signed();
    reader.signed();

    const cycle = reader.unsigned();

    for (let index = 0; index < cycle; index += 1) {
      reader.signed();
    }
  }
};

const colourIn = (reader: BitReader): VideoColour | null => {
  if (reader.flag() && reader.bits(8) === EXTENDED_SAR) {
    reader.bits(32);
  }

  if (reader.flag()) {
    reader.bit();
  }

  if (!reader.flag()) {
    return null;
  }

  reader.bits(3);

  const fullRange = reader.flag();

  if (!reader.flag()) {
    return { fullRange, matrix: 2, primaries: 2, transfer: 2 };
  }

  const primaries = reader.bits(8);
  const transfer = reader.bits(8);
  const matrix = reader.bits(8);

  return { fullRange, matrix, primaries, transfer };
};

export const sequenceOf = (avcC: Uint8Array): Sequence | null => {
  const sets = (avcC[5] ?? 0) % 32;
  const length = (avcC[6] ?? 0) * 256 + (avcC[7] ?? 0);

  if (sets === 0 || avcC.length < 8 + length || length < 4) {
    return null;
  }

  const reader = new BitReader(unescaped(avcC.subarray(9, 8 + length)));
  const profile = reader.bits(8);

  reader.bits(16);
  reader.unsigned();

  if (CHROMA_PROFILES.has(profile)) {
    skipChromaFormat(reader);
  }

  reader.unsigned();
  skipPictureOrder(reader);
  reader.unsigned();
  reader.bit();

  const widthInBlocks = reader.unsigned() + 1;
  const heightInUnits = reader.unsigned() + 1;
  const framesOnly = reader.flag();

  if (!framesOnly) {
    reader.bit();
  }

  reader.bit();

  const cropped = reader.flag();
  const left = cropped ? reader.unsigned() : 0;
  const right = cropped ? reader.unsigned() : 0;
  const top = cropped ? reader.unsigned() : 0;
  const bottom = cropped ? reader.unsigned() : 0;
  const fieldRows = framesOnly ? 1 : 2;
  const width = widthInBlocks * MACROBLOCK - 2 * (left + right);

  const height =
    heightInUnits * MACROBLOCK * fieldRows - 2 * fieldRows * (top + bottom);

  return {
    colour: reader.flag() ? colourIn(reader) : null,
    height,
    profile,
    width,
  };
};
