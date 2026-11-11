import { describe, expect, it } from "@effect/vitest";

import { DRAND_RELAYS, SITE_HOSTS } from "../src/features/outside-hosts.js";
import {
  CLIP_WORKER_DIRECTIVES,
  CLIP_WORKER_HEADERS,
  headersFor,
  HEADERS_FILE,
  PAGE_HEADERS,
  POLICY_DIRECTIVES,
} from "../src/features/page-policy.js";

const sourcesOf = (directive: string) =>
  POLICY_DIRECTIVES.find(([name]) => name === directive)?.[1] ?? [];

describe("the page's security policy", () => {
  it("runs only the site's own scripts, never inline or evaluated code", () => {
    expect(
      ["script-src", "worker-src", "default-src"].flatMap((directive) =>
        sourcesOf(directive).filter(
          (source) =>
            source === "'unsafe-inline'" ||
            source === "'unsafe-eval'" ||
            source === "*" ||
            source.endsWith(":")
        )
      )
    ).toStrictEqual([]);
  });

  it("lets nobody frame the page, load a plugin, or move its base", () => {
    expect({
      base: sourcesOf("base-uri"),
      frames: sourcesOf("frame-ancestors"),
      objects: sourcesOf("object-src"),
    }).toStrictEqual({
      base: ["'none'"],
      frames: ["'none'"],
      objects: ["'none'"],
    });
  });

  it("reaches the site's own sockets and every drand relay the deck check asks", () => {
    const allowed = new Set(sourcesOf("connect-src"));

    expect(
      [...SITE_HOSTS.map((host) => `wss://${host}`), ...DRAND_RELAYS].filter(
        (source) => !allowed.has(source)
      )
    ).toStrictEqual([]);
  });

  it("names no other site than its own and the drand relays", () => {
    const ours = new Set<string>([
      ...SITE_HOSTS.map((host) => `wss://${host}`),
      ...DRAND_RELAYS,
    ]);

    expect(
      POLICY_DIRECTIVES.flatMap(([, sources]) => sources).filter(
        (source) =>
          !source.startsWith("'") &&
          source !== "data:" &&
          source !== "blob:" &&
          !ours.has(source)
      )
    ).toStrictEqual([]);
  });

  it("lets only the clip worker start a blob: worker and compile WebAssembly, for the AAC extension", () => {
    const pagePaths = [
      "/",
      "/r/ABCDEF",
      "/privacy",
      "/assets/index-a1b2c3.js",
      "/assets/clipper-a1b2c3.js",
      "/assets/mediabunny-aac-encoder-a1b2c3.js",
      "/src/client/moments/clip.ts",
    ];

    const workerPaths = [
      "/assets/clip-worker-a1b2c3.js",
      "/src/client/moments/clip-worker.ts?worker_file&type=module",
    ];

    expect({
      added: CLIP_WORKER_DIRECTIVES.flatMap(([name, sources]) =>
        sources
          .filter((source) => !sourcesOf(name).includes(source))
          .map((source) => `${name} ${source}`)
      ),
      looserPages: pagePaths.filter(
        (path) => headersFor(path) !== PAGE_HEADERS
      ),
      stricterWorkers: workerPaths.filter(
        (path) => headersFor(path) !== CLIP_WORKER_HEADERS
      ),
      writtenAfterThePage: HEADERS_FILE.endsWith(
        [
          "/assets/clip-worker-*",
          "  ! Content-Security-Policy",
          `  Content-Security-Policy: ${CLIP_WORKER_HEADERS["Content-Security-Policy"]}`,
          "",
        ].join("\n")
      ),
    }).toStrictEqual({
      added: ["script-src 'wasm-unsafe-eval'", "worker-src blob:"],
      looserPages: [],
      stricterWorkers: [],
      writtenAfterThePage: true,
    });
  });

  it("writes every header for every path of the built site", () => {
    expect(
      Object.entries(PAGE_HEADERS).filter(
        ([name, value]) => !HEADERS_FILE.includes(`\n  ${name}: ${value}\n`)
      )
    ).toStrictEqual([]);
    expect(HEADERS_FILE.startsWith("/*\n")).toBe(true);
  });
});
