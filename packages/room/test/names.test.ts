import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  NameSchema,
  NameTaken,
  RoomCommands,
  RoomStates,
  lookAlikes,
  nameKey,
  nameProblem,
  sameName,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  ms,
  openedBy,
  rejection,
  run,
  runAll,
} from "./fixtures.js";

const names = Arbitrary.schema(NameSchema);

const valid = Schema.is(NameSchema);

const REAL_NAMES = [
  "Ana",
  "Jos\u00E9",
  "Zo\u00EB",
  "O'Brien",
  "Mary-Jane",
  "Nguy\u1EC5n V\u0103n An",
  "Sam K",
  "Sam 2",
  "\u738B\u5C0F\u660E",
  "\u5C71\u7530\u3000\u592A\u90CE",
  "\uAE40\uBBFC\uC900",
  "\u0930\u093E\u092E",
  "\u0938\u0940\u0924\u093E",
  "\u0915\u094D\u0937\u093F\u0924\u093F\u091C",
  "\u0645\u062D\u0645\u062F",
  "\u0645\u0647\u0631\u200C\u0633\u0627",
  "\u05D3\u05D5\u05D3",
  "\u041E\u043B\u044C\u0433\u0430",
  "\u0391\u03BB\u03AD\u03BE\u03B7\u03C2",
  "Ana \u{1F3B2}",
  "\u{1F469}\u200D\u{1F4BB}",
  "\u2764\uFE0F Mia",
  "Sam \u{1F44D}\u{1F3FD}",
  "Dr. Who?",
];

const HIDDEN = [
  "\n",
  "\r",
  "\t",
  "\u0000",
  "\u007F",
  "\u0085",
  "\u2028",
  "\u2029",
  "\u202E",
  "\u202A",
  "\u2066",
  "\u2067",
  "\u2068",
  "\u2069",
  "\u200E",
  "\u200F",
  "\u061C",
  "\u200B",
  "\u2060",
  "\uFEFF",
  "\u00AD",
  "\u3164",
  "\u115F",
  "\uE000",
  "\u0378",
  "\uD800",
  "\u{E0041}",
  "\u0600",
  "\uFFF9",
];

const pickIndex = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 39, minimum: 0 }))
);

const hidden = Arbitrary.schema(Schema.Literals(HIDDEN));

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

const insertedAt = (name: string, at: number, text: string) => {
  const letters = Array.from(GRAPHEMES.segment(name), ({ segment }) => segment);
  const place = at % (letters.length + 1);

  return [...letters.slice(0, place), text, ...letters.slice(place)].join("");
};

describe("a player's name", () => {
  it("accepts real names in any script, with accents, joiners inside emoji and words, and numbers", () => {
    expect(REAL_NAMES.filter((name) => !valid(name))).toStrictEqual([]);
  });

  it.prop(
    "refuses a control, line break, bidirectional, zero-width, invisible, private-use, unassigned, or lone surrogate character anywhere in a name",
    { at: pickIndex, character: hidden, name: names },
    ({ at, character, name }) => {
      const broken = insertedAt(name, at, character);

      expect(valid(broken)).toBe(false);
      expect(nameProblem(broken)).toStrictEqual(Option.some("HiddenCharacter"));
    }
  );

  it.prop(
    "refuses spaces at either end instead of trimming them",
    {
      name: names,
      space: Arbitrary.schema(Schema.Literals([" ", "\u00A0", "\u3000"])),
    },
    ({ name, space }) => {
      expect(
        [`${space}${name}`, `${name}${space}`].map(nameProblem)
      ).toStrictEqual([Option.some("SpaceAtEnd"), Option.some("SpaceAtEnd")]);
    }
  );

  it("refuses a name that is empty, longer than 40, decomposed, starts with a loose accent, stacks five accents, mixes look-alike alphabets, or has no letter", () => {
    expect(
      [
        "",
        "W".repeat(41),
        "Jose\u0301",
        "\u0301Ana",
        "Zq\u0301\u0302\u0303\u0304\u0305",
        "B\u0435n",
        "\u0391na",
        "300",
        "+0",
        "!!",
      ].map(nameProblem)
    ).toStrictEqual(
      [
        "Empty",
        "TooLong",
        "NotNormalised",
        "StrayMark",
        "StackedMarks",
        "MixedAlphabets",
        "MixedAlphabets",
        "NoLetter",
        "NoLetter",
        "NoLetter",
      ].map(Option.some)
    );
  });

  it("compares names without case, after compatibility normalisation, without invisible joiners, and with any run of spaces as one", () => {
    expect(
      [
        ["Sam", "sAM"],
        ["Sam", "\uFF33\uFF41\uFF4D"],
        ["Sam", "Sa\u200Dm"],
        ["Sam K", "Sam\u00A0K"],
        ["Sam K", "Sam  K"],
        ["Stra\u00DFe", "STRASSE"],
        ["\uFB01ona", "Fiona"],
        ["Jos\u00E9", "Jose\u0301"],
        ["\u2764\uFE0F Mia", "\u2764 mia"],
      ].map(([one = "", other = ""]) => sameName(one, other))
    ).toStrictEqual(Array.from({ length: 9 }, () => true));
    expect(
      [
        ["Sam", "Sam K"],
        ["Jos\u00E9", "Jose"],
        ["Ana", "Anna"],
      ].map(([one = "", other = ""]) => sameName(one, other))
    ).toStrictEqual([false, false, false]);
  });

  it("compares names as they read in the app's fonts, so Latin, Greek, and Cyrillic look-alikes and a capital I against a small l clash, while names that read differently do not", () => {
    expect(
      [
        ["\u0410\u0412\u0421", "ABC"],
        ["\u0391\u0392\u0395", "ABE"],
        ["\u041E\u0441\u0430", "Oca"],
        ["\u0420\u0430\u0445", "Pax"],
        ["Bill", "BiII"],
        ["Ian", "lan"],
        ["\u0415\u0441\u0445\u0435\u0440", "Ecxep"],
      ].map(([one = "", other = ""]) => sameName(one, other))
    ).toStrictEqual(Array.from({ length: 7 }, () => true));
    expect(
      [
        ["Ian", "Lan"],
        ["Ana", "Anna"],
        ["Jos\u00E9", "Jose"],
        ["\u0412\u0430\u0441\u044F", "Bob"],
      ].map(([one = "", other = ""]) => sameName(one, other))
    ).toStrictEqual(Array.from({ length: 4 }, () => false));
  });

  it("maps only Greek and Cyrillic letters and the capital I, each to one plain Latin letter, and only letters that are whole before decomposition", () => {
    expect(
      [...lookAlikes].filter(
        ([from, to]) =>
          !/^[A-Za-z]$/u.test(to) ||
          from.normalize("NFKD") !== from ||
          !/^(?:\p{Script=Greek}|\p{Script=Cyrillic}|I)$/u.test(from)
      )
    ).toStrictEqual([]);
  });

  it.prop(
    "gives every name the same key however its case is written",
    { name: names },
    ({ name }) => {
      expect(nameKey(name.toUpperCase())).toBe(nameKey(name.toLowerCase()));
    }
  );
});

const open = (state: RoomState) => {
  if (!RoomStates.$is("Open")(state)) {
    throw new Error("expected an open room");
  }

  return state;
};

const join = (who: PlayerId, name: string, at: number) =>
  RoomCommands.Join({ at: ms(at), avatar: "club", by: as(who), name });

const rename = (who: PlayerId, name: string) =>
  RoomCommands.SetProfile({ at: ms(50), avatar: "club", by: as(who), name });

const sams = runAll(openedBy(ann), [join(bob, "Sam", 10)]);

describe("names in a room", () => {
  it("refuses a join or a rename to a name another person already holds, however it is written", () => {
    expect([
      rejection(sams, join(cat, "sam", 20)),
      rejection(sams, join(cat, "\uFF33\uFF41\uFF4D", 20)),
      rejection(sams, join(cat, "Sa\u200Dm", 20)),
      rejection(sams, rename(ann, "SAM")),
    ]).toStrictEqual([
      new NameTaken({ wanted: "sam" }),
      new NameTaken({ wanted: "\uFF33\uFF41\uFF4D" }),
      new NameTaken({ wanted: "Sa\u200Dm" }),
      new NameTaken({ wanted: "SAM" }),
    ]);
  });

  it("refuses a name in another script that reads the same as one already here", () => {
    const abc = run(sams, join(cat, "ABC", 20)).state;

    expect(rejection(abc, join(dan, "\u0410\u0412\u0421", 30))).toStrictEqual(
      new NameTaken({ wanted: "\u0410\u0412\u0421" })
    );
  });

  it("lets two Sams in as Sam and Sam K, and lets a player rename to their own name in another case", () => {
    const both = run(sams, join(cat, "Sam K", 20)).state;

    expect(open(both).members.map(({ name }) => name)).toStrictEqual([
      ann,
      "Sam",
      "Sam K",
    ]);
    expect(open(run(both, rename(bob, "SAM")).state).members[1]?.name).toBe(
      "SAM"
    );
  });

  it("keeps the name of someone who left, because they stay in the settle-up and may come back, and gives it back to them when they do", () => {
    const left = run(
      sams,
      RoomCommands.LeaveRoom({ at: ms(30), by: as(bob) })
    ).state;

    expect(rejection(left, join(cat, "Sam", 40))).toStrictEqual(
      new NameTaken({ wanted: "Sam" })
    );
    expect(
      open(run(left, join(bob, "Sam", 40)).state).members.map(
        ({ name }) => name
      )
    ).toStrictEqual([ann, "Sam"]);
  });
});
