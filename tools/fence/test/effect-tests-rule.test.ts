// @effect-diagnostics nodeBuiltinImport:off -- These tests write temporary source fixtures and run the real oxlint binary against them.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { fixtureSuite } from "./lint-batch.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

const plugin = path.join(repoRoot, "scripts/oxlint-plugin-effect-tests.ts");

const batch = fixtureSuite();

const lintTests = batch.linter({
  jsPlugins: [plugin],
  rules: { "effect-tests/no-manual-effect-runtime-in-tests": "error" },
});

const lint = (name: string, source: string) => lintTests(name, source);

const manualRunner = "Tests cannot run Effects by hand.";

describe("effect-tests/no-manual-effect-runtime-in-tests", () => {
  batch.each([
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

    batch.expect(result.status).not.toBe(0);
    batch.expect(result.output).toContain(manualRunner);
  });

  batch.it(
    "accepts it.effect in a test file and a runner outside tests",
    () => {
      const test = lint(
        "engine.test.ts",
        'import { it } from "@effect/vitest";\nimport { Effect } from "effect";\n\nit.effect("runs", () => Effect.void);\n'
      );

      const script = lint(
        "verify.ts",
        'import { Effect } from "effect";\n\nexport const ran = Effect.runPromise(Effect.void);\n'
      );

      batch.expect(test.status).toBe(0);
      batch.expect(script.status).toBe(0);
    }
  );
});

const XSTATE_RULE = "xstate-effect/no-inline-effect";

const RootConfig = Schema.Struct({
  default: Schema.Struct({
    jsPlugins: Schema.Array(Schema.Unknown),
    rules: Schema.Record(Schema.String, Schema.Unknown),
  }),
});

const rootConfig = Effect.promise(
  () => import(new URL("../../../oxlint.config.ts", import.meta.url).href)
).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RootConfig)));

const xstatePluginOf = (plugins: readonly unknown[]) =>
  plugins.filter(
    (candidate): candidate is string =>
      Schema.is(Schema.String)(candidate) &&
      candidate.endsWith("xstate-effect-oxlint.js")
  );

const lintWith = (xstatePlugin: string, source: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nostakes-xstate-"));
  const config = path.join(directory, "oxlint.json");
  const file = path.join(directory, "machine.ts");

  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [xstatePlugin],
      rules: { [XSTATE_RULE]: "error" },
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

const inlineAction = [
  'import { Effect } from "effect";',
  "",
  "export const entry = (_: unknown, enq: (run: () => unknown) => void) => {",
  '  enq(() => Effect.logInfo("ping"));',
  "};",
  "",
].join("\n");

const declaredAction = [
  "export const entry = (",
  "  args: { readonly actions: { readonly ping: () => void } },",
  "  enq: (run: () => void) => void",
  ") => {",
  "  enq(args.actions.ping);",
  "};",
  "",
].join("\n");

describe(XSTATE_RULE, () => {
  it.effect(
    "the root config loads the @xstate/effect plugin and fails an inline Effect action",
    () =>
      Effect.gen(function* rejectsInlineEffect() {
        const config = yield* rootConfig;
        const [xstatePlugin] = xstatePluginOf(config.default.jsPlugins);

        expect(config.default.rules[XSTATE_RULE]).toBe("error");
        expect(xstatePlugin).toBeDefined();

        if (xstatePlugin === undefined) {
          return;
        }

        const inline = lintWith(xstatePlugin, inlineAction);
        const declared = lintWith(xstatePlugin, declaredAction);

        expect(inline.status).not.toBe(0);
        expect(inline.output).toContain("Declare it in setupEffect");
        expect(declared.status).toBe(0);
      })
  );
});
