// @effect-diagnostics nodeBuiltinImport:off -- The batch writes every fixture to a temporary directory and runs the real oxlint binary over it once.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { beforeAll, it as vitestIt, expect as vitestExpect } from "vitest";
import type { ExpectStatic } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

export const fromRepo = (file: string) => path.join(repoRoot, file);

export const repoLintConfig = () =>
  readFileSync(fromRepo("oxlint.config.ts"), "utf-8");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

export interface LintConfig {
  readonly jsPlugins: readonly (
    | string
    | { readonly name: string; readonly specifier: string }
  )[];
  readonly rules: Readonly<Record<string, string>>;
}

export interface LintResult {
  readonly output: string;
  readonly status: number;
}

interface Fixture {
  readonly file: string;
  readonly linter: number;
  readonly onlyRules: readonly string[];
  readonly source: string;
}

const LintReport = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        filename: Schema.String,
        help: Schema.optionalKey(Schema.String),
        message: Schema.String,
        severity: Schema.String,
      })
    ),
    number_of_files: Schema.Int,
  })
);

const decodeReport = Schema.decodeUnknownSync(LintReport);

const codeOf = (rule: string) => {
  const slash = rule.indexOf("/");

  return slash === -1
    ? rule
    : `${rule.slice(0, slash)}(${rule.slice(slash + 1)})`;
};

const keyOf = (fixture: Fixture) =>
  JSON.stringify([
    fixture.linter,
    fixture.file,
    fixture.source,
    fixture.onlyRules,
  ]);

const swallowing = (): (() => null) =>
  new Proxy(() => null, { apply: swallowing, get: swallowing });

const ignoredExpect = swallowing();

export const fixtureSuite = () => {
  const collecting = { now: false };
  const linters: LintConfig[] = [];
  const fixtures = new Map<string, Fixture>();
  const results = new Map<string, LintResult>();

  const lintAll = () => {
    const directory = mkdtempSync(path.join(tmpdir(), "nostakes-fence-"));
    const listed = [...fixtures.values()];

    try {
      for (const [linter, config] of linters.entries()) {
        const mine = listed.filter((fixture) => fixture.linter === linter);

        if (mine.length === 0) {
          continue;
        }

        const root = path.join(directory, `linter-${linter}`);
        const configFile = path.join(directory, `oxlint-${linter}.json`);
        const fileOf = new Map<string, Fixture>();

        writeFileSync(configFile, JSON.stringify(config));

        for (const [index, fixture] of mine.entries()) {
          const file = path.join(root, `case-${index}`, fixture.file);

          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, fixture.source);
          fileOf.set(file, fixture);
        }

        const run = spawnSync(
          oxlint,
          ["-c", configFile, "--no-ignore", "-f", "json", root],
          { cwd: repoRoot, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 }
        );

        if (run.status !== 0 && run.status !== 1) {
          throw new Error(
            `oxlint ended with ${String(run.status)} on the batch: ${run.stderr}`
          );
        }

        const report = decodeReport(run.stdout);

        if (report.number_of_files !== mine.length) {
          throw new Error(
            `oxlint linted ${report.number_of_files} of the ${mine.length} fixtures in the batch`
          );
        }

        for (const [file, fixture] of fileOf) {
          const codes = new Set(fixture.onlyRules.map(codeOf));

          const found = report.diagnostics.filter(
            (diagnostic) =>
              diagnostic.filename === file &&
              (codes.size === 0 || codes.has(diagnostic.code))
          );

          results.set(keyOf(fixture), {
            output: found
              .map(
                ({ code, help, message }) =>
                  `${code}: ${message}\n${help ?? ""}\n`
              )
              .join(""),
            status: found.some(({ severity }) => severity === "error") ? 1 : 0,
          });
        }
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  };

  beforeAll(lintAll);

  const linter = (config: LintConfig) => {
    const index = linters.push(config) - 1;

    return (
      file: string,
      source: string,
      onlyRules: readonly string[] = []
    ): LintResult => {
      const fixture: Fixture = { file, linter: index, onlyRules, source };
      const key = keyOf(fixture);

      if (collecting.now) {
        fixtures.set(key, fixture);

        return { output: "", status: 0 };
      }

      const result = results.get(key);

      if (result === undefined) {
        throw new Error(
          `The fixture ${file} was not seen when the file was collected, so a test body linted different sources on its second run`
        );
      }

      return result;
    };
  };

  const collect = (body: () => void) => {
    collecting.now = true;

    try {
      body();
    } finally {
      collecting.now = false;
    }
  };

  const expect: ExpectStatic = new Proxy(vitestExpect, {
    apply: (_target, _self, [actual]: readonly unknown[]) =>
      collecting.now ? ignoredExpect : vitestExpect(actual),
    get: (_target, property) => {
      if (property !== "soft") {
        throw new Error(
          `The fence's batched expect forwards expect() and expect.soft() only, not expect.${String(property)}`
        );
      }

      return collecting.now ? ignoredExpect : vitestExpect.soft;
    },
  });

  const it = (name: string, body: () => void) => {
    collect(body);
    vitestIt(name, body);
  };

  const each =
    <A>(cases: readonly A[]) =>
    (name: string, body: (value: A) => void) => {
      for (const value of cases) {
        collect(() => {
          body(value);
        });
      }

      vitestIt.for(cases)(name, (value) => {
        body(value);
      });
    };

  return { each, expect, it, linter };
};
