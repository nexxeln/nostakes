// @effect-diagnostics nodeBuiltinImport:off -- These tests create temporary source fixtures and run the real oxlint binary against them.
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

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

const plugin = path.join(repoRoot, "scripts/oxlint-plugin-patterns.ts");

const rules = [
  "nostakes-patterns/acquire-release-constructs-in-acquire-body",
  "nostakes-patterns/no-hand-rolled-hex",
  "nostakes-patterns/no-markup-outside-builders",
  "nostakes-patterns/no-module-level-mutable-state",
  "nostakes-patterns/no-shared-pending-cache",
  "nostakes-patterns/retain-needs-stage-policy",
  "nostakes-patterns/shared-waiters",
  "nostakes-patterns/no-sleep-in-loop",
];

interface LintResult {
  readonly output: string;
  readonly status: number;
}

const lintFixture = (
  area: string,
  source: string,
  name = "fixture.ts"
): LintResult => {
  const directory = mkdtempSync(path.join(tmpdir(), "nostakes-patterns-"));
  const fixtureDirectory = path.join(directory, area, "pattern-fixtures");
  const config = path.join(directory, "oxlint.json");
  const file = path.join(fixtureDirectory, name);

  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [{ name: "nostakes-patterns", specifier: plugin }],
      rules: Object.fromEntries(rules.map((rule) => [rule, "error"])),
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

const expectRule = (result: LintResult, message: string) => {
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
};

const expectRuleSoft = (result: LintResult, message: string) => {
  expect.soft(result.status).not.toBe(0);
  expect.soft(result.output).toContain(message);
};

const eagerAcquire =
  "This acquire returns a resource built before acquire runs";

const moduleState =
  "Module-level let and var hold state that outlives one request";

describe("nostakes pattern rules", () => {
  it("requires a retention policy through direct, renamed and namespace imports", () => {
    for (const source of [
      'import { retain } from "alchemy/RemovalPolicy"; resource.pipe(retain());',
      'import { retain as keep } from "alchemy/RemovalPolicy"; resource.pipe(keep());',
      'import * as Policy from "alchemy/RemovalPolicy"; resource.pipe(Policy.retain());',
      'import { retain } from "alchemy"; resource.pipe(retain());',
    ]) {
      expectRule(
        lintFixture("packages/ledger/src", source),
        "This retain call has no stage policy"
      );
    }

    for (const source of [
      'import { retain } from "alchemy/RemovalPolicy"; resource.pipe(retain(Stage.pipe(Effect.map((stage) => stage === "prod"))));',
      'import { retainInProd } from "./retention"; resource.pipe(retainInProd);',
      'import { retain } from "other"; retain();',
      "const retain = () => {}; retain();",
      'import { retain } from "alchemy/RemovalPolicy"; function work(retain) { retain(); }',
      'import { retain } from "alchemy/RemovalPolicy";\n// oxlint-disable-next-line nostakes-patterns/retain-needs-stage-policy -- This adopted zone belongs to production in every stage.\nresource.pipe(retain());',
    ]) {
      expect(lintFixture("apps/infra", source).status).toBe(0);
    }
  });
  it("keeps sleeping loops in machines without flagging unrelated sleep functions", () => {
    const message = "This loop yields Effect.sleep";

    for (const area of ["apps/server/src", "packages/engine/src"]) {
      for (const loop of [
        "while (true)",
        "for (;;)",
        "for (const item of items)",
        "for (const key in items)",
      ]) {
        for (const [binding, sleep] of [
          ['import { Effect } from "effect";', "Effect.sleep"],
          ['import { Effect as E } from "effect";', "E.sleep"],
          ['import { sleep as wait } from "effect/Effect";', "wait"],
        ]) {
          expectRule(
            lintFixture(
              area,
              `${binding} function* work() { ${loop} { yield* ${sleep}(1).pipe(identity); } }`
            ),
            message
          );
        }
      }

      expectRule(
        lintFixture(
          area,
          'import { Effect } from "effect"; function* work() { do { yield* Effect.sleep(1); } while (true); }'
        ),
        message
      );

      for (const source of [
        'import { Effect } from "effect"; function* work() { for (;;) { Effect.sleep(1); } }',
        "const Effect = { sleep: () => [] }; function* work() { while (true) { yield* Effect.sleep(1); } }",
        'import { Effect } from "other"; function* work() { for (;;) { yield* Effect.sleep(1); } }',
        'import { Effect } from "effect"; function* work() { yield* Effect.sleep(1); for (;;) { break; } }',
        'import { Effect } from "effect"; for (;;) { const work = function* () { yield* Effect.sleep(1); }; break; }',
      ]) {
        expect(lintFixture(area, source).status).toBe(0);
      }
    }

    expect(
      lintFixture(
        "packages/engine/test",
        'import { Effect } from "effect"; function* work() { for (;;) { yield* Effect.sleep(1); } }'
      ).status
    ).toBe(0);
  });
  it("sends byte hex encoding to Hex.encode and leaves other radix formatting alone", () => {
    const message = "This map hand-rolls hex encoding";

    for (const area of ["apps/server/src", "packages/engine/src"]) {
      for (const source of [
        'export const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");',
        'export const hex = (bytes: number[]) => bytes.map(function (byte) { return (byte).toString(16).padStart(2, "0"); }).join("");',
      ]) {
        expectRule(lintFixture(area, source), message);
      }

      for (const source of [
        "export const hex = (bytes: Uint8Array) => Hex.encode(bytes);",
        'export const channel = (unit: number) => Math.round(unit * 255).toString(16).padStart(2, "0");',
        'export const escape = (points: number[]) => points.map((point) => point.toString(16).padStart(4, "0"));',
        'export const octal = (bytes: number[]) => bytes.map((byte) => byte.toString(8).padStart(2, "0"));',
      ]) {
        expect(lintFixture(area, source).status).toBe(0);
      }
    }

    expect(
      lintFixture(
        "packages/engine/test",
        'export const hex = (bytes: number[]) => bytes.map((byte) => byte.toString(16).padStart(2, "0"));'
      ).status
    ).toBe(0);
  });
  it("keeps markup to the builders in markup.ts modules", () => {
    const message = "This puts a string into the page as markup";

    for (const source of [
      'export const paint = (node: HTMLElement, name: string) => { node.innerHTML = "<b>" + name + "</b>"; };',
      'export const paint = (node: HTMLElement) => { node.innerHTML = "<b>constant</b>"; };',
      "export const paint = (node: Element, name: string) => { node.outerHTML = name; };",
      'export const paint = (node: HTMLElement, name: string) => { node["innerHTML"] = name; };',
      "export const paint = (frame: HTMLIFrameElement, name: string) => { frame.srcdoc = name; };",
      'export const paint = (node: Element, name: string) => node.insertAdjacentHTML("beforeend", name);',
      "export const paint = (range: Range, name: string) => range.createContextualFragment(name);",
      "export const paint = (node: Element, name: string) => node.setHTMLUnsafe(name);",
      "export const paint = (name: string) => globalThis.document.write(name);",
      "export const paint = (name: string) => document.writeln(name);",
      "export const view = (h: { InnerHTML: (html: string) => unknown }, name: string) => h.InnerHTML(name);",
    ]) {
      expectRuleSoft(lintFixture("apps/web/src/features", source), message);
    }

    for (const source of [
      "export const paint = (node: HTMLElement, name: string) => { node.textContent = name; };",
      'export const paint = (node: HTMLElement, name: string) => { const bold = document.createElement("b"); bold.textContent = name; node.replaceChildren(bold); };',
      "export const write = (stream: { write: (text: string) => void }, name: string) => stream.write(name);",
      'export const read = (text: string) => new DOMParser().parseFromString(text, "image/svg+xml");',
    ]) {
      expect.soft(lintFixture("apps/web/src/features", source).status).toBe(0);
    }

    const painter =
      "export const paint = (node: HTMLElement, art: string) => { node.innerHTML = art; };";

    expect(
      lintFixture("apps/web/src/client", painter, "markup.ts").status
    ).toBe(0);
    expect(lintFixture("apps/web/scripts", painter).status).toBe(0);
    expect(lintFixture("apps/web/test", painter).status).toBe(0);
  });
  it("rejects a module-owned waiter even through an Effect runner", () => {
    expectRule(
      lintFixture(
        "apps/server/src",
        'import { Deferred, Effect } from "effect"; export const pending = Effect.runSync(Deferred.make());'
      ),
      "This waiting primitive lives at module level"
    );
  });
  it("defers Layer construction instead of sharing an eager or already-run value", () => {
    for (const initializer of [
      "Layer.succeed(Tag, Ref.makeUnsafe(0))",
      "Layer.effect(Tag, Effect.runSync(Ref.make(0)))",
    ]) {
      expectRule(
        lintFixture(
          "apps/server/src",
          `import { Effect, Layer, Ref } from "effect"; export const layer = ${initializer};`
        ),
        "This waiting primitive lives at module level"
      );
    }

    expect(
      lintFixture(
        "apps/server/src",
        'import { Layer, Ref } from "effect"; export const layer = Layer.effect(Tag, Ref.make(0));'
      ).status
    ).toBe(0);
  });

  it("allows only DurableObject instance fields, not static fields or unrelated subclasses", () => {
    for (const declaration of [
      "class Other extends Base { pending = Deferred.makeUnsafe(); }",
      "class Owner extends DurableObject { static pending = Deferred.makeUnsafe(); }",
      "class Other { pending = Deferred.makeUnsafe(); }",
    ]) {
      expectRule(
        lintFixture(
          "apps/server/src",
          `import { Deferred } from "effect"; import { DurableObject } from "cloudflare:workers"; ${declaration}`
        ),
        "This waiting primitive lives at module level"
      );
    }

    expect(
      lintFixture(
        "apps/server/src",
        'import { Deferred } from "effect"; import { DurableObject as Owner } from "cloudflare:workers"; class State extends Owner { pending = Deferred.makeUnsafe(); }'
      ).status
    ).toBe(0);
  });

  it.each([
    ["Deferred", "make"],
    ["Deferred", "makeUnsafe"],
    ["Cache", "make"],
    ["Cache", "makeWith"],
    ["Ref", "make"],
    ["Ref", "makeUnsafe"],
    ["Semaphore", "make"],
    ["Semaphore", "makeUnsafe"],
    ["Queue", "make"],
    ["Queue", "bounded"],
    ["Queue", "unbounded"],
    ["Queue", "dropping"],
    ["Queue", "sliding"],
    ["Latch", "make"],
    ["Latch", "makeUnsafe"],
    ["PubSub", "make"],
    ["PubSub", "bounded"],
    ["PubSub", "unbounded"],
    ["PubSub", "dropping"],
    ["PubSub", "sliding"],
    ["PartitionedSemaphore", "make"],
    ["PartitionedSemaphore", "makeUnsafe"],
    ["TxSemaphore", "make"],
  ])(
    "keeps %s.%s construction with its invocation owner",
    (primitive, make) => {
      for (const area of ["apps/server/src", "packages/engine/src"]) {
        for (const source of [
          `import { ${primitive} as P } from "effect"; export const shared = P.${make}(1);`,
          `import * as P from "effect/${primitive}"; export const shared = P["${make}"](1);`,
          `import { ${make} as construct } from "effect/${primitive}"; export const shared = construct(1);`,
          `import { ${primitive}, Effect } from "effect"; export const shared = await Effect.runPromise(${primitive}.${make}(1));`,
        ]) {
          expectRule(
            lintFixture(area, source),
            "This waiting primitive lives at module level"
          );
        }

        for (const source of [
          `import { ${primitive} as P, Effect, Layer } from "effect"; export const layer = Layer.effect(Tag, Effect.gen(function* () { const local = yield* P.${make}(1); return local; }));`,
          `import { ${primitive} as P } from "effect"; export const fetch = () => { const local = P.${make}(1); return local; };`,
          `import { ${primitive} as P } from "effect"; import { DurableObject } from "cloudflare:workers"; export class Owner extends DurableObject { pending = P.${make}(1); }`,
          `const ${primitive} = { ${make}: () => 1 }; export const ordinary = ${primitive}.${make}(1);`,
          `import { ${primitive} as P } from "other-library"; export const ordinary = P.${make}(1);`,
        ]) {
          const result = lintFixture(area, source);

          expect(result.output).not.toContain("shared-waiters");
          expect(result.status).toBe(0);
        }
      }

      expect(
        lintFixture(
          "packages/engine/test",
          `import { ${primitive} as P } from "effect"; const testState = P.${make}(1);`
        ).status
      ).toBe(0);
    }
  );

  it("turns every pattern rule on in the repo config", () => {
    const configSource = readFileSync(
      path.join(repoRoot, "oxlint.config.ts"),
      "utf-8"
    );

    for (const rule of rules) {
      expect(configSource).toContain(`"${rule}": "error"`);
    }
  });

  it("flags an acquire that succeeds with an eager or captured handle", () => {
    const eager = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nexport const pool = Effect.acquireRelease(Effect.succeed(new Pool()), (opened) => Effect.sync(() => opened.close()));\n'
    );

    const captured = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nconst shared = new Pool();\n\nexport const pool = Effect.acquireRelease(Effect.sync(() => shared), (opened) => Effect.sync(() => opened.close()));\n'
    );

    const required = lintFixture(
      "packages/ledger/src",
      'const { Effect } = require("effect");\n\nclass Pool { close() {} }\n\nconst shared = new Pool();\nexport const pool = Effect.acquireRelease(Effect.succeed(shared), (opened) => Effect.sync(() => opened.close()));\n'
    );

    expectRule(eager, eagerAcquire);
    expectRule(captured, eagerAcquire);
    expectRule(required, eagerAcquire);
  });

  it("unwraps asserted acquires without flagging handles built inside the thunk", () => {
    const asserted = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nconst shared = new Pool();\nexport const pool = Effect.acquireRelease(Effect.sync(() => shared) as Effect.Effect<Pool>, (opened) => Effect.sync(() => opened.close()));\n'
    );

    const defaultedParameter = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nexport const pool = Effect.acquireRelease(Effect.sync((handle = new Pool()) => handle), (opened) => Effect.sync(() => opened.close()));\n'
    );

    const localHandle = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nexport const pool = Effect.acquireRelease(Effect.sync(() => { const handle = new Pool(); return handle; }), (opened) => Effect.sync(() => opened.close()));\n'
    );

    expectRuleSoft(asserted, eagerAcquire);
    expect.soft(defaultedParameter.status).toBe(0);
    expect.soft(localHandle.status).toBe(0);
  });

  it("allows an acquire that constructs the resource", () => {
    const result = lintFixture(
      "packages/ledger/src",
      'import { Effect } from "effect";\n\nclass Pool { close() {} }\n\nexport const pool = Effect.acquireRelease(Effect.sync(() => new Pool()), (opened) => Effect.sync(() => opened.close()));\n'
    );

    expect(result.status).toBe(0);
  });

  it.each(["cached", "cachedWithTTL", "cachedInvalidateWithTTL"])(
    "rejects %s in shared initialization and permits request-local work",
    (name) => {
      const message = "Effect.cached* at this scope shares pending work";

      const module = lintFixture(
        "apps/server/src",
        `import { Effect as E } from "effect"; export const shared = E.${name}(E.succeed(1), "Infinity");`
      );

      const service = lintFixture(
        "packages/engine/src",
        `import { Effect, Layer } from "effect"; export const layer = Layer.effect(Tag, Effect.gen(function* () { return yield* Effect.${name}(loadAsset, "Infinity"); }));`
      );

      const contentStorePlant = lintFixture(
        "apps/server/src",
        `import { Effect, Exit } from "effect"; const cacheData = (effect) => Effect.${name}(effect, (exit) => Exit.isSuccess(exit) ? "Infinity" : 0); const makeStore = Effect.fn("ContentStore.make")(function* () { const catalog = yield* cacheData(readData(assets)); return { catalog }; });`
      );

      const request = lintFixture(
        "apps/server/src",
        `import { Effect } from "effect"; export const fetch = (request) => Effect.gen(function* () { return yield* Effect.${name}(read(request), "Infinity"); });`
      );

      const exception = lintFixture(
        "packages/engine/src",
        `import { Effect } from "effect";\n// oxlint-disable-next-line nostakes-patterns/no-shared-pending-cache -- This cache imports a CryptoKey from a fixed secret without request I/O.\nexport const shared = Effect.${name}(importKey(secret), "Infinity");`
      );

      const serviceMethod = lintFixture(
        "packages/engine/src",
        `import { Effect, Layer } from "effect"; export const layer = Layer.effect(Tag, Effect.gen(function* () { return Tag.of({ read: Effect.fn("Tag.read")(function* read(input) { return yield* Effect.${name}(load(input), "Infinity"); }) }); }));`
      );

      const boundFn = lintFixture(
        "packages/engine/src",
        `import { Effect } from "effect"; export const read = Effect.fn("read")(function* read(input) { return yield* Effect.${name}(load(input), "Infinity"); });`
      );

      expectRule(module, message);
      expectRule(service, message);
      expectRule(contentStorePlant, message);
      expectRule(boundFn, message);
      expect(serviceMethod.status).toBe(0);
      expect(request.status).toBe(0);
      expect(exception.status).toBe(0);
    }
  );

  it("flags module-level let and var in runtime source", () => {
    const counter = lintFixture(
      "apps/web/src",
      "let count = 0;\n\nexport const next = () => ++count;\n"
    );

    const exported = lintFixture(
      "packages/engine/src",
      "export var cache = new Map();\n"
    );

    expectRule(counter, moduleState);
    expectRule(exported, moduleState);
  });

  it("catches nested module var and allows immutable using bindings", () => {
    const nestedVar = lintFixture(
      "packages/engine/src",
      "if (Math.random() > 0.5) { var _shared = new Map(); }\n"
    );

    const usingBinding = lintFixture(
      "packages/engine/src",
      "export {};\nusing resource = { [Symbol.dispose]() {} };\nvoid resource;\n"
    );

    expectRuleSoft(nestedVar, moduleState);
    expect.soft(usingBinding.status).toBe(0);
  });

  it("allows const at module level, let inside functions, and tests", () => {
    const constant = lintFixture(
      "packages/engine/src",
      "export const limit = 10;\n"
    );

    const local = lintFixture(
      "packages/engine/src",
      "export const sum = (values: readonly number[]) => {\n  let total = 0;\n\n  for (const value of values) {\n    total += value;\n  }\n\n  return total;\n};\n"
    );

    const test = lintFixture(
      "packages/engine/test",
      "let calls = 0;\n\nexport const call = () => ++calls;\n"
    );

    expect(constant.status).toBe(0);
    expect(local.status).toBe(0);
    expect(test.status).toBe(0);
  });
});
