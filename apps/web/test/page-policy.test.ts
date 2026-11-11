import { describe, expect, it } from "@effect/vitest";

import { DRAND_RELAYS, SITE_HOSTS } from "../src/features/outside-hosts.js";
import {
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

  it("writes every header for every path of the built site", () => {
    expect(
      Object.entries(PAGE_HEADERS).filter(
        ([name, value]) => !HEADERS_FILE.includes(`\n  ${name}: ${value}\n`)
      )
    ).toStrictEqual([]);
    expect(HEADERS_FILE.startsWith("/*\n")).toBe(true);
  });
});
