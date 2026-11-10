export const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0)
  );

  let offset = 0;

  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }

  return joined;
};

export const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

export const uint32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setUint32(0, value);

  return bytes;
};

export const uint64 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(8);

  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));

  return bytes;
};

const utf8Encoder = new TextEncoder();

export const utf8 = (text: string): Uint8Array => utf8Encoder.encode(text);
