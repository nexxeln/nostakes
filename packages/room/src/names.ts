import { Option, Schema } from "effect";

export const NAME_MAX_LENGTH = 40;

export const MOST_MARKS_ON_ONE_LETTER = 4;

export const NameProblemSchema = Schema.Literals([
  "HiddenCharacter",
  "Empty",
  "SpaceAtEnd",
  "NotNormalised",
  "StrayMark",
  "StackedMarks",
  "MixedAlphabets",
  "NoLetter",
  "TooLong",
]);

export type NameProblem = typeof NameProblemSchema.Type;

const SHOWN_OR_JOINER = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}\p{Join_Control}]*$/u;

const INVISIBLE =
  /(?![\p{Join_Control}\p{Variation_Selector}])\p{Default_Ignorable_Code_Point}/u;

const JOINER_AT_END = /^\p{Join_Control}|\p{Join_Control}$/u;

const SPACE_AT_END = /^\p{Zs}|\p{Zs}$/u;

const MARK_FIRST = /^\p{M}/u;

const STACKED_MARKS = new RegExp(
  `\\p{M}{${MOST_MARKS_ON_ONE_LETTER + 1}}`,
  "u"
);

const LETTER_OR_PICTURE = /[\p{L}\p{Extended_Pictographic}]/u;

const LOOK_ALIKE_ALPHABETS = [
  /(?=\p{L})\p{Script=Latin}/u,
  /(?=\p{L})\p{Script=Greek}/u,
  /(?=\p{L})\p{Script=Cyrillic}/u,
];

const plainCharacters = (text: string) =>
  SHOWN_OR_JOINER.test(text) && !INVISIBLE.test(text);

const alphabetsIn = (name: string) =>
  LOOK_ALIKE_ALPHABETS.filter((alphabet) => alphabet.test(name)).length;

const firstProblem = (
  checks: readonly (readonly [NameProblem, boolean])[]
): Option.Option<NameProblem> =>
  Option.fromUndefinedOr(checks.find(([, broken]) => broken)?.[0]);

export const nameProblem = (name: string): Option.Option<NameProblem> =>
  firstProblem([
    ["HiddenCharacter", !plainCharacters(name) || JOINER_AT_END.test(name)],
    ["Empty", name.length === 0],
    ["SpaceAtEnd", SPACE_AT_END.test(name)],
    ["NotNormalised", name.normalize("NFC") !== name],
    ["StrayMark", MARK_FIRST.test(name)],
    ["StackedMarks", STACKED_MARKS.test(name)],
    ["MixedAlphabets", alphabetsIn(name) > 1],
    ["NoLetter", !LETTER_OR_PICTURE.test(name)],
    ["TooLong", name.length > NAME_MAX_LENGTH],
  ]);

const LATIN_WORD = String.raw`[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF'\u2019\-]{0,7}`;

const NEXT_TO_A_NAME = String.raw`pays|to|\+\d{1,3}|\u2212\d{1,3}|\d{1,4}|:|\u2192|"|<b>|&amp;|\(\d\)`;

const NAME_SAMPLES = [
  String.raw`${LATIN_WORD}(?: (?:${LATIN_WORD}|${NEXT_TO_A_NAME})){0,3}`,
  String.raw`[\u0410-\u042F][\u0430-\u044F]{1,6}(?: [\u0410-\u042F][\u0430-\u044F]{1,6})?`,
  String.raw`[\u0628-\u063A\u0641-\u064A]{2,6}(?: (?:[\u0628-\u063A\u0641-\u064A]{2,6}|\d{1,3}))?`,
  String.raw`[\u05D0-\u05EA]{2,6}(?: (?:[\u05D0-\u05EA]{2,6}|\d{1,3}))?`,
  String.raw`(?:[\u0915-\u0939][\u093E-\u094C]?){1,4}(?: (?:[\u0915-\u0939][\u093E-\u094C]?){1,4})?`,
  String.raw`[\u4E00-\u9FA5]{1,3}(?:\u3000[\u4E00-\u9FA5]{1,3})?|[\u3042-\u3093]{1,4}|[\uAC00-\uD7A3]{1,3}`,
  String.raw`(?:${LATIN_WORD} )?(?:[\u{1F600}-\u{1F64F}]|\u2764\uFE0F|\u{1F469}\u200D\u{1F4BB}|\u{1F44D}[\u{1F3FB}-\u{1F3FF}]|\u{1F3F3}\uFE0F\u200D\u{1F308})`,
];

export const nameExpected =
  "a name of 1 to 40 characters in Unicode normal form C: letters, marks, numbers, punctuation, symbols, spaces between words, and joiners inside emoji or words, with no control, format, or invisible characters, at most four marks on one letter, at least one letter or emoji, and no mix of Latin, Greek, and Cyrillic letters";

export const isPlainName = Schema.makeFilter(
  (name: string) =>
    nameProblem(name).pipe(
      Option.map((problem) => `the name breaks the rule ${problem}`),
      Option.getOrUndefined
    ),
  {
    arbitraryConstraint: {
      patterns: [{ flags: "u", source: `^(?:${NAME_SAMPLES.join("|")})$` }],
    },
    expected: nameExpected,
    toJsonSchema: () => [
      {
        format: "nostakes-name",
        maxLength: NAME_MAX_LENGTH,
        minLength: 1,
      },
      true,
    ],
  }
);

export const isPlainText = Schema.makeFilter(
  (text: string) =>
    plainCharacters(text)
      ? undefined
      : "the text holds a control, format, or invisible character",
  {
    arbitraryConstraint: {
      patterns: [
        {
          flags: "u",
          source: String.raw`^(?:h1[0-9a-z]{11}|[ -~]{0,24}|[\u{1F600}-\u{1F64F}]\uFE0F?)$`,
        },
      ],
    },
    expected: "text with no control, format, or invisible characters",
    toJsonSchema: () => [{ format: "nostakes-plain-text" }, true],
  }
);

export const nameKey = (name: string) =>
  name
    .normalize("NFKC")
    .replaceAll(/\p{Default_Ignorable_Code_Point}/gu, "")
    .toUpperCase()
    .toLowerCase()
    .normalize("NFKC")
    .replaceAll(/\p{Zs}+/gu, " ");

export const sameName = (one: string, other: string) =>
  nameKey(one) === nameKey(other);
