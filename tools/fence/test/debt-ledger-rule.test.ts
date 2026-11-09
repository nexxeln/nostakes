// @effect-diagnostics nodeBuiltinImport:off -- These tests write temporary source fixtures and run the real oxlint binary against them.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

const config = path.join(repoRoot, "scripts/oxlint-debt-ledger.config.ts");

const DebtEntry = Schema.Struct({
  directive: Schema.String,
  kind: Schema.Literals(["oxlint", "effect-diagnostics", "typescript"]),
  reason: Schema.optionalKey(Schema.String),
});

const LintOutput = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        message: Schema.fromJsonString(DebtEntry),
      })
    ),
  })
);

const effectDirective = [
  "@effect",
  "diagnostics-next-line floatingEffect:off",
].join("-");

const ledger = (source: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nostakes-debt-"));
  const file = path.join(directory, "sample.ts");

  writeFileSync(file, source);

  try {
    const result = spawnSync(
      oxlint,
      [
        "--config",
        config,
        "-A",
        "all",
        "-D",
        "nostakes-debt/debt-ledger",
        "--format",
        "json",
        "--no-ignore",
        file,
      ],
      { cwd: repoRoot, encoding: "utf-8" }
    );

    return Schema.decodeSync(LintOutput)(result.stdout).diagnostics;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

describe("nostakes-debt/debt-ledger", () => {
  it("records every directive with its kind and reason", () => {
    const entries = ledger(
      [
        "// oxlint-disable-next-line no-debugger -- the debugger is the point",
        "debugger;",
        `// ${effectDirective}`,
        "export const a = 1;",
        "// @ts-expect-error -- the fixture assigns a string",
        'export const b: number = "x";',
        "",
      ].join("\n")
    );

    expect(entries).toEqual([
      {
        code: "nostakes-debt(debt-ledger)",
        message: {
          directive: "oxlint-disable-next-line no-debugger",
          kind: "oxlint",
          reason: "the debugger is the point",
        },
      },
      {
        code: "nostakes-debt(debt-ledger)",
        message: {
          directive: effectDirective,
          kind: "effect-diagnostics",
        },
      },
      {
        code: "nostakes-debt(debt-ledger)",
        message: {
          directive: "@ts-expect-error",
          kind: "typescript",
          reason: "the fixture assigns a string",
        },
      },
    ]);
  });

  it("records nothing for plain code or strings that mention a directive", () => {
    expect(
      ledger(
        'export const quoted = "// oxlint-disable-next-line no-debugger";\n'
      )
    ).toEqual([]);
  });
});
