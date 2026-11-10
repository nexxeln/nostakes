// @effect-diagnostics nodeBuiltinImport:off -- These tests write temporary source fixtures and run the real oxlint binary against them.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

const RULE = "xstate-effect/no-inline-effect";

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
    (plugin): plugin is string =>
      Schema.is(Schema.String)(plugin) &&
      plugin.endsWith("xstate-effect-oxlint.js")
  );

const lint = (plugin: string, source: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nostakes-xstate-"));
  const config = path.join(directory, "oxlint.json");
  const file = path.join(directory, "machine.ts");

  writeFileSync(
    config,
    JSON.stringify({ jsPlugins: [plugin], rules: { [RULE]: "error" } })
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

describe(RULE, () => {
  it.effect(
    "the root config loads the @xstate/effect plugin and fails an inline Effect action",
    () =>
      Effect.gen(function* rejectsInlineEffect() {
        const config = yield* rootConfig;
        const [plugin] = xstatePluginOf(config.default.jsPlugins);

        expect(config.default.rules[RULE]).toBe("error");
        expect(plugin).toBeDefined();

        if (plugin === undefined) {
          return;
        }

        const inline = lint(plugin, inlineAction);
        const declared = lint(plugin, declaredAction);

        expect(inline.status).not.toBe(0);
        expect(inline.output).toContain("Declare it in setupEffect");
        expect(declared.status).toBe(0);
      })
  );
});
