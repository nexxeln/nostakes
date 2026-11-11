const NARROW = new Set("iljtfrI.,:;'!|() ");

const WIDE = new Set("mwMW@%");

const glyphWidth = (glyph: string) => {
  if (NARROW.has(glyph)) {
    return 0.34;
  }

  if (WIDE.has(glyph)) {
    return 1;
  }

  return glyph.toUpperCase() === glyph && glyph.toLowerCase() !== glyph
    ? 0.7
    : 0.6;
};

export const textWidth = (text: string, size: number) => {
  let total = 0;

  for (const glyph of text) {
    total += glyphWidth(glyph);
  }

  return total * size;
};

const ELLIPSIS = "\u2026";

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

export interface Fitted {
  readonly size: number;
  readonly text: string;
}

export const fitted = (text: string, size: number, room: number): Fitted => {
  if (textWidth(text, size) <= room) {
    return { size, text };
  }

  const letters = Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
  let kept = letters.length;

  while (
    kept > 1 &&
    textWidth(`${letters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`, size) >
      room
  ) {
    kept -= 1;
  }

  return {
    size,
    text: `${letters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`,
  };
};

const graphemesOf = (text: string) =>
  Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);

const brokenWord = (word: string, size: number, room: number) => {
  const pieces: string[] = [];
  let rest = graphemesOf(word);

  while (rest.length > 0) {
    let take = rest.length;

    while (take > 1 && textWidth(rest.slice(0, take).join(""), size) > room) {
      take -= 1;
    }

    pieces.push(rest.slice(0, take).join(""));
    rest = rest.slice(take);
  }

  return pieces;
};

export const wrapped = (
  text: string,
  size: number,
  room: number,
  most: number
): readonly string[] => {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    const tried = line.length === 0 ? word : `${line} ${word}`;

    if (textWidth(tried, size) <= room) {
      line = tried;
    } else {
      if (line.length > 0) {
        lines.push(line);
      }

      const pieces = brokenWord(word, size, room);

      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) ?? "";
    }
  }

  if (line.length > 0) {
    lines.push(line);
  }

  if (lines.length <= most) {
    return lines;
  }

  const kept = lines.slice(0, most - 1);
  const last = lines.slice(most - 1).join(" ");

  return [...kept, fitted(last, size, room).text];
};

export const wrapsWhole = (
  text: string,
  size: number,
  room: number,
  most: number
) =>
  wrapped(text, size, room, most).join("").replaceAll(" ", "") ===
  text.replaceAll(" ", "");

export const firstFitting = (
  candidates: readonly string[],
  size: number,
  room: number
): Fitted => {
  const fits = candidates.find((text) => textWidth(text, size) <= room);

  return fits === undefined
    ? fitted(candidates.at(-1) ?? "", size, room)
    : { size, text: fits };
};

export const nameForms = (name: string): readonly string[] => {
  const [first = name] = name.split(" ");

  return first === name ? [name] : [name, first];
};

export const firstWrapping = (
  candidates: readonly string[],
  size: number,
  room: number,
  most: number
): readonly string[] => {
  const whole = candidates.find((text) => wrapsWhole(text, size, room, most));

  return whole === undefined
    ? wrapped(candidates.at(-1) ?? "", size, room, most)
    : wrapped(whole, size, room, most);
};
