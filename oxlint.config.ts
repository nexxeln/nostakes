import { createRequire } from "node:module";

import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/dist/**",
    "node_modules/**",
    ".claude/**",
    "scripts/hooks/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    createRequire(
      new URL("packages/client/package.json", import.meta.url)
    ).resolve("@xstate/effect/oxlint"),
    "./scripts/oxlint-plugin-effect-tests.ts",
    "./scripts/oxlint-plugin-no-comments.ts",
    {
      name: "nostakes-boundaries",
      specifier: "./scripts/oxlint-plugin-boundaries.ts",
    },
    {
      name: "nostakes-patterns",
      specifier: "./scripts/oxlint-plugin-patterns.ts",
    },
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    {
      name: "anti-slop-effect",
      specifier: "./tools/oxlint/anti-slop/effect/index.ts",
    },
  ],
  options: {
    typeAware: true,
  },
  overrides: [
    {
      files: [
        "**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        "**/__tests__/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
      ],
      rules: {
        "promise/prefer-await-to-then": "off",
      },
    },
    {
      files: [
        "**/*.{test,spec,test-d,spec-d}.{mts,cts,mjs,cjs}",
        "**/__tests__/**/*.{mts,cts,mjs,cjs}",
      ],
      rules: {
        "no-empty-function": "error",
        "promise/prefer-await-to-then": "error",
      },
    },
  ],
  rules: {
    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/prefer-effect-match": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "effect-tests/no-manual-effect-runtime-in-tests": "error",
    "jsdoc/require-param-description": "off",
    "jsdoc/require-returns-description": "off",
    "no-comments/directive-reason": "error",
    "no-comments/no-comments": "error",
    "nostakes-boundaries/no-browser-globals-on-server": "error",
    "nostakes-boundaries/no-cross-layer-imports": "error",
    "nostakes-patterns/acquire-release-constructs-in-acquire-body": "error",
    "nostakes-patterns/no-hand-rolled-hex": "error",
    "nostakes-patterns/no-markup-outside-builders": "error",
    "nostakes-patterns/no-module-level-mutable-state": "error",
    "nostakes-patterns/no-shared-pending-cache": "error",
    "nostakes-patterns/no-sleep-in-loop": "error",
    "nostakes-patterns/retain-needs-stage-policy": "error",
    "nostakes-patterns/shared-waiters": "error",
    "oxc/no-accumulating-spread": "error",
    "promise/prefer-await-to-then": "error",
    "typescript/promise-function-async": "off",
    "unicorn/no-useless-undefined": ["error", { checkArguments: true }],
    "unicorn/throw-new-error": "off",
    "xstate-effect/no-inline-effect": "error",
  },
});
