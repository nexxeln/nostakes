import { describe } from "vitest";

import { fixtureSuite, fromRepo, repoLintConfig } from "./lint-batch.js";
import type { LintResult } from "./lint-batch.js";

const plugin = fromRepo("scripts/oxlint-plugin-boundaries.ts");

const { expect, it, linter } = fixtureSuite();

const lintBoundaries = linter({
  jsPlugins: [{ name: "nostakes-boundaries", specifier: plugin }],
  rules: {
    "nostakes-boundaries/no-browser-globals-on-server": "error",
    "nostakes-boundaries/no-cross-layer-imports": "error",
    "nostakes-boundaries/no-media-library-outside-bindings": "error",
  },
});

const lintFixture = (area: string, source: string): LintResult =>
  lintBoundaries(`${area}/boundary-fixtures/fixture.ts`, source);

const expectRule = (result: LintResult, message: string) => {
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
};

const expectRuleSoft = (result: LintResult, message: string) => {
  expect.soft(result.status).not.toBe(0);
  expect.soft(result.output).toContain(message);
};

describe("architecture boundary rules", () => {
  it("turns every boundary rule on in the repo config", () => {
    const configSource = repoLintConfig();

    for (const rule of [
      "nostakes-boundaries/no-browser-globals-on-server",
      "nostakes-boundaries/no-cross-layer-imports",
      "nostakes-boundaries/no-media-library-outside-bindings",
    ]) {
      expect(configSource).toContain(`"${rule}": "error"`);
    }
  });

  it("keeps Mediabunny behind its bindings, whichever way it is imported", () => {
    const message =
      "Only `apps/web/src/client/moments/mediabunny/` may import Mediabunny.";

    const outside = [
      'import { Output } from "mediabunny";\nexport { Output };\n',
      'export { BufferTarget } from "mediabunny";\n',
      'export const extension = () => import("@mediabunny/aac-encoder");\n',
      'import type { VideoSample } from "mediabunny";\nexport type Sample = VideoSample;\n',
    ].map((source) => lintFixture("apps/web/src/client/moments", source));

    const inside = lintFixture(
      "apps/web/src/client/moments/mediabunny",
      'import { Output } from "mediabunny";\nexport { Output };\n'
    );

    for (const result of outside) {
      expectRuleSoft(result, message);
    }

    expect(inside.output).not.toContain(message);
  });

  it("blocks package imports from application code", () => {
    const result = lintFixture(
      "packages/engine/test",
      'import * as application from "../../../../apps/server/src/main.ts";\n\nexport const source = application;\n'
    );

    expectRule(result, "Packages cannot import application code.");
  });
  it("blocks aliased require, module.require, import-equals, and asserted module strings", () => {
    const aliased = lintFixture(
      "packages/engine/src",
      'const load = require;\n\nload("../../../../apps/server/src/main.ts");\n'
    );

    const moduleRequire = lintFixture(
      "packages/engine/src",
      'module.require("../../../../apps/server/src/main.ts");\n'
    );

    const destructuredRequire = lintFixture(
      "packages/engine/src",
      'const { require: load } = module;\nload("../../../../apps/server/src/main.ts");\n'
    );

    const importEquals = lintFixture(
      "packages/engine/src",
      'import cli = require("../../../../apps/server/src/main.ts");\nexport { cli };\n'
    );

    const asserted = lintFixture(
      "packages/engine/src",
      'import("../../../../apps/server/src/main.ts" as string);\n'
    );

    const createRequire = lintFixture(
      "packages/engine/src",
      'import { createRequire } from "node:module";\n\nconst load = createRequire(import.meta.url);\nload("../../../../apps/server/src/main.ts");\n'
    );

    expectRuleSoft(aliased, "Packages cannot import application code.");
    expectRuleSoft(moduleRequire, "Packages cannot import application code.");
    expectRuleSoft(
      destructuredRequire,
      "Packages cannot import application code."
    );
    expectRuleSoft(importEquals, "Packages cannot import application code.");
    expectRuleSoft(asserted, "Packages cannot import application code.");
    expectRuleSoft(createRequire, "Packages cannot import application code.");
  });
  it("keeps browser globals out of server and package code", () => {
    const route = lintFixture(
      "apps/web/src/routes",
      "export const here = () => window.location.href;\n"
    );

    const core = lintFixture(
      "packages/engine/src",
      "export const title = () => document.title;\n"
    );

    const throughGlobal = lintFixture(
      "apps/web/src/server",
      'export const here = () => globalThis.window.location.href;\nexport const title = () => self["document"].title;\n'
    );

    const serverGlobal = lintFixture(
      "apps/web/src/server",
      "export const send = (request: Request) => globalThis.fetch(request);\n"
    );

    expectRule(route, "window exists only in a browser.");
    expectRule(core, "document exists only in a browser.");
    expectRule(throughGlobal, "window exists only in a browser.");
    expectRule(throughGlobal, "document exists only in a browser.");
    expect(serverGlobal.status).toBe(0);
  });
  it("blocks bare browser globals and aliases on the server", () => {
    const bare = lintFixture(
      "apps/web/src/server",
      "consume(window);\nexport let target: unknown;\ntarget = document;\nexport const here = navigator;\nexport const keyed = values[window];\n"
    );

    const aliases = lintFixture(
      "apps/web/src/server",
      'const root = globalThis;\nexport const here = root["window"].location.href;\nconst { document: documentTitle } = self;\nexport const title = documentTitle;\n'
    );

    const templateKey = lintFixture(
      "apps/web/src/server",
      "export const title = globalThis[`document`].title;\n"
    );

    const typeOnlyShadow = lintFixture(
      "apps/web/src/server",
      "interface document { readonly title: string }\n\nexport const title: document = document;\n"
    );

    expectRuleSoft(bare, "exists only in a browser.");
    expectRuleSoft(aliases, "exists only in a browser.");
    expectRuleSoft(templateKey, "exists only in a browser.");
    expectRuleSoft(typeOnlyShadow, "exists only in a browser.");
  });
  it("allows browser globals in client and feature modules", () => {
    const client = lintFixture(
      "apps/web/src/client",
      'export const saved = () => localStorage.getItem("rat");\n'
    );

    const guard = lintFixture(
      "apps/web/src/routes",
      'export const inBrowser = () => typeof window !== "undefined";\n'
    );

    expect(client.status).toBe(0);
    expect(guard.status).toBe(0);
  });
  it("ignores local bindings that share a browser global's name", () => {
    const parameter = lintFixture(
      "packages/engine/src",
      "export const width = (window: { readonly size: number }) => window.size;\n"
    );

    const binding = lintFixture(
      "apps/web/src/server",
      'const document = { title: "rat" };\n\nexport const title = () => document.title;\n'
    );

    expect(parameter.status).toBe(0);
    expect(binding.status).toBe(0);
  });
});
