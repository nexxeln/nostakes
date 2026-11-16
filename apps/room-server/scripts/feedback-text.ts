import { DateTime } from "effect";

import type { KeptNote } from "../src/feedback-wire.ts";

const CONTROL =
  /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/gu;

export const NOTE_MARGIN = "  | ";

export const inert = (text: string) =>
  text.replaceAll(CONTROL, "\uFFFD").trim();

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:A|iOS)?\/(?<version>\d+)/u, "Edge"],
  [/OPR\/(?<version>\d+)/u, "Opera"],
  [/SamsungBrowser\/(?<version>\d+)/u, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(?<version>\d+)/u, "Firefox"],
  [/(?:Chrome|CriOS)\/(?<version>\d+)/u, "Chrome"],
  [/Version\/(?<version>\d+)[.\d]* (?:Mobile\/\S+ )?Safari\//u, "Safari"],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone|iPad|iPod/u, "iOS"],
  [/Android/u, "Android"],
  [/CrOS/u, "ChromeOS"],
  [/Mac OS X|Macintosh/u, "macOS"],
  [/Windows/u, "Windows"],
  [/Linux/u, "Linux"],
];

export const browserOf = (agent: string) => {
  const [browser] = BROWSERS.flatMap(([pattern, name]) => {
    const version = pattern.exec(agent)?.groups?.version;

    return version === undefined ? [] : [`${name} ${version}`];
  });

  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];

  return `${browser ?? "unknown browser"} on ${system ?? "unknown system"}`;
};

const when = (at: number) =>
  `${DateTime.formatIso(DateTime.makeUnsafe(at)).slice(0, 16).replace("T", " ")} UTC`;

export const printed = (note: KeptNote) =>
  [
    [
      when(note.at),
      inert(note.screen),
      `${note.width}x${note.height}`,
      inert(browserOf(note.agent)),
      `build ${inert(note.build)}`,
    ].join("  "),
    ...note.note.split("\n").map((line) => `${NOTE_MARGIN}${inert(line)}`),
  ].join("\n");
