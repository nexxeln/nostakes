// @effect-diagnostics nodeBuiltinImport:off -- These tests write temporary source fixtures and run the real oxlint binary against them.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

const plugin = path.join(repoRoot, "scripts/oxlint-plugin-effect-tests.ts");

const lint = (name: string, source: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nostakes-effect-tests-"));
  const config = path.join(directory, "oxlint.json");
  const file = path.join(directory, name);

  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [plugin],
      rules: { "effect-tests/no-manual-effect-runtime-in-tests": "error" },
    })
  );
  writeFileSync(file, source);

  try {
    const result = spawnSync(oxlint, ["-c", config, "--no-ignore", file], {
      cwd: repoRoot,
      encoding: "utf-8",
    });

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status ?? -1,
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

const manualRunner = "Tests cannot run Effects by hand.";

describe("effect-tests/no-manual-effect-runtime-in-tests", () => {
  it.each([
    "Effect.runPromise(Effect.void)",
    "Effect.runPromiseExit(Effect.void)",
    "Effect.runSync(Effect.void)",
    "Effect.runSyncExit(Effect.void)",
    "Effect.runFork(Effect.void)",
    "Effect.runCallback(Effect.void)",
    "ManagedRuntime.make(Layer.empty)",
  ])("rejects %s in a test file", (call) => {
    const result = lint(
      "engine.test.ts",
      `import { Effect, Layer, ManagedRuntime } from "effect";\n\nexport const ran = ${call};\n`
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(manualRunner);
  });

  it("accepts it.effect in a test file and a runner outside tests", () => {
    const test = lint(
      "engine.test.ts",
      'import { it } from "@effect/vitest";\nimport { Effect } from "effect";\n\nit.effect("runs", () => Effect.void);\n'
    );

    const script = lint(
      "verify.ts",
      'import { Effect } from "effect";\n\nexport const ran = Effect.runPromise(Effect.void);\n'
    );

    expect(test.status).toBe(0);
    expect(script.status).toBe(0);
  });
});
