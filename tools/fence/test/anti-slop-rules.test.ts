import { describe } from "vitest";

import { fixtureSuite, fromRepo, repoLintConfig } from "./lint-batch.js";

const plugins = [
  {
    name: "anti-slop",
    specifier: fromRepo("tools/oxlint/anti-slop/index.ts"),
  },
  {
    name: "anti-slop-effect",
    specifier: fromRepo("tools/oxlint/anti-slop/effect/index.ts"),
  },
];

interface Case {
  readonly accepted: string;
  readonly file: string;
  readonly rejected: string;
  readonly rule: string;
}

const cases: readonly Case[] = [
  {
    accepted:
      "export const f = (xs: number[]) => xs.flatMap((x) => (x > 1 ? [x * 2] : []));\n",
    file: "fixture.ts",
    rejected:
      "export const f = (xs: number[]) => xs.filter((x) => x > 1).map((x) => x * 2);\n",
    rule: "anti-slop/no-array-filter-map",
  },
  {
    accepted: "declare const v: string;\nexport const n = v as string;\n",
    file: "fixture.ts",
    rejected:
      "declare const v: string;\nexport const n = v as unknown as number;\n",
    rule: "anti-slop/no-chained-type-assertions",
  },
  {
    accepted: "export const f = (on: boolean) => ({ a: 1, b: on ? 2 : 0 });\n",
    file: "fixture.ts",
    rejected:
      "export const f = (on: boolean) => ({ a: 1, ...(on ? { b: 2 } : {}) });\n",
    rule: "anti-slop/no-conditional-empty-object-spread",
  },
  {
    accepted: 'const value = "x";\nexport const out: string = value;\n',
    file: "fixture.ts",
    rejected: 'const value = "x";\nexport const out: unknown = value;\n',
    rule: "anti-slop/no-known-value-widening",
  },
  {
    accepted: 'import { vi } from "vitest";\n\nexport const spy = vi.fn();\n',
    file: "fixture.test.ts",
    rejected: 'import { vi } from "vitest";\n\nvi.mock("./deck.ts");\n',
    rule: "anti-slop/no-module-mocking",
  },
  {
    accepted:
      "interface Seat {\n  readonly chips: number;\n}\n\nexport const chipsOf = (seat: Seat) => seat.chips;\n",
    file: "fixture.ts",
    rejected: "export const chipsOf = (seat: object) => seat;\n",
    rule: "anti-slop/no-object-parameters",
  },
  {
    accepted:
      "export const total = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0);\n",
    file: "fixture.ts",
    rejected:
      "export const all = (xs: number[]) => xs.reduce<number[]>((acc, x) => acc.concat(x), []);\n",
    rule: "anti-slop/no-reduce-accumulator-copy",
  },
  {
    accepted: "export const call = (g: (a: number) => number) => g(1);\n",
    file: "fixture.ts",
    rejected:
      "export const call = (g: (a: number) => number) => Reflect.apply(g, undefined, [1]);\n",
    rule: "anti-slop/no-reflect-apply",
  },
  {
    accepted: "export const read = (o: { a: number }) => o.a;\n",
    file: "fixture.ts",
    rejected:
      'export const read = (o: { a: number }) => Reflect.get(o, "a");\n',
    rule: "anti-slop/no-reflect-get",
  },
  {
    accepted: "export type MathModule = typeof Math;\n",
    file: "fixture.ts",
    rejected:
      'export const isText = (v: string | number) => typeof v === "string";\n',
    rule: "anti-slop/no-runtime-typeof",
  },
  {
    accepted: "export const tableLayout = 1;\n",
    file: "fixture.ts",
    rejected: "export const tableShape = 1;\n",
    rule: "anti-slop/no-shape-in-symbol-names",
  },
  {
    accepted: "export const wrap = (cause: unknown) => cause;\n",
    file: "fixture.ts",
    rejected: "export const echo = (input: unknown) => input;\n",
    rule: "anti-slop/no-unknown-parameters",
  },
  {
    accepted: "export const one = (): number => 1;\n",
    file: "fixture.ts",
    rejected: "export const one = (): unknown => 1;\n",
    rule: "anti-slop/no-unknown-returns",
  },
  {
    accepted: "export type Chips = number;\n",
    file: "fixture.ts",
    rejected: "export type Anything = unknown;\n",
    rule: "anti-slop/no-unknown-type-aliases",
  },
  {
    accepted: "export type Stacks = Record<string, number>;\n",
    file: "fixture.ts",
    rejected: "export type Bag = Record<string, unknown>;\n",
    rule: "anti-slop/no-unsafe-dictionary-type",
  },
  {
    accepted: "const known = 1;\nexport const back: number = known;\n",
    file: "fixture.ts",
    rejected:
      "const known = 1;\nconst wide: unknown = known;\nexport const back = wide as number;\n",
    rule: "anti-slop/no-widen-then-assert",
  },
  {
    accepted:
      "export const f = () => {\n  const a = 1;\n\n  if (a > 0) {\n    return a;\n  }\n\n  return 0;\n};\n",
    file: "fixture.ts",
    rejected:
      "export const f = () => {\n  const a = 1;\n  if (a > 0) {\n    return a;\n  }\n  return 0;\n};\n",
    rule: "anti-slop/require-readable-spacing",
  },
  {
    accepted:
      "declare const wide: string | number;\n// SAFETY: wide holds a number on this path.\nexport const narrow = wide as number;\n",
    file: "fixture.ts",
    rejected:
      "declare const wide: string | number;\nexport const narrow = wide as number;\n",
    rule: "anti-slop/require-safety-comment-for-type-assertion",
  },
  {
    accepted:
      'import { Effect } from "effect";\n\ndeclare const program: Effect.Effect<number, { readonly _tag: "A" }>;\n\nexport const out = program.pipe(Effect.catchTag("A", () => Effect.succeed(1)));\n',
    file: "fixture.ts",
    rejected:
      'import { Effect } from "effect";\n\ndeclare const program: Effect.Effect<number, { readonly _tag: "A" } | { readonly _tag: "B" }>;\n\nexport const out = program.pipe(Effect.catch((error) => (error._tag === "A" ? Effect.succeed(1) : Effect.succeed(2))));\n',
    rule: "anti-slop-effect/no-manual-effect-error-tag",
  },
  {
    accepted:
      'import { Predicate } from "effect";\n\nexport const isFold = Predicate.isTagged("Fold");\n',
    file: "fixture.ts",
    rejected:
      'export const street = (action: { readonly _tag: "Fold" | "Call" }) => {\n  switch (action._tag) {\n    case "Fold":\n      return 0;\n    default:\n      return 1;\n  }\n};\n',
    rule: "anti-slop-effect/no-manual-tag-comparison",
  },
  {
    accepted:
      'import { Data } from "effect";\n\nexport const fold = Data.tagged<{ readonly _tag: "Fold"; readonly seat: number }>("Fold")({ seat: 1 });\n',
    file: "fixture.ts",
    rejected: 'export const fold = { _tag: "Fold", seat: 1 };\n',
    rule: "anti-slop-effect/no-manual-tagged-construction",
  },
  {
    accepted:
      'import { Dealer } from "./dealer.ts";\n\nexport const dealer = Dealer.layer;\n',
    file: "fixture.ts",
    rejected:
      'import { makeDealer } from "./dealer.ts";\n\nexport const dealer = makeDealer;\n',
    rule: "anti-slop-effect/no-service-constructor-imports",
  },
  {
    accepted: 'export const rank = (s: "a" | "b") => (s === "a" ? 1 : 2);\n',
    file: "fixture.ts",
    rejected:
      'export const rank = (s: "a" | "b" | "c") => (s === "a" ? 1 : s === "b" ? 2 : 3);\n',
    rule: "anti-slop-effect/prefer-effect-match",
  },
];

const byName = (left: string, right: string) => left.localeCompare(right);

const reportedAs = (rule: string) => {
  const [plugin, name] = rule.split("/");

  return `${plugin}(${name})`;
};

const { each, expect, it, linter } = fixtureSuite();

const lintAll = linter({
  jsPlugins: plugins,
  rules: Object.fromEntries(cases.map(({ rule }) => [rule, "error"])),
});

const lint = (rule: string, file: string, source: string) =>
  lintAll(file, source, [rule]);

describe("anti-slop rules", () => {
  each(cases)(
    "$rule rejects the slop and accepts the fix",
    ({ accepted, file, rejected, rule }) => {
      const slop = lint(rule, file, rejected);
      const fixed = lint(rule, file, accepted);

      expect(slop.status).not.toBe(0);
      expect(slop.output).toContain(reportedAs(rule));
      expect(fixed.output).not.toContain(reportedAs(rule));
      expect(fixed.status).toBe(0);
    }
  );

  it("has a case for every anti-slop rule the repo config turns on", () => {
    const configSource = repoLintConfig();

    const enabled = [
      ...configSource.matchAll(/"(?<rule>anti-slop[\w-]*\/[\w-]+)": "error"/gu),
    ].map((match) => match.groups?.rule ?? "");

    expect(cases.map(({ rule }) => rule).toSorted(byName)).toEqual(
      enabled.toSorted(byName)
    );
  });
});
