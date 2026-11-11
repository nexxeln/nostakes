import { describe, expect, it } from "@effect/vitest";

import privacyPage from "../privacy.html?raw";
import { DRAND_RELAYS } from "../src/features/outside-hosts.js";

const readable = (html: string) =>
  html.replaceAll(/<[^>]*>/gu, " ").replaceAll(/\s+/gu, " ");

describe("the privacy page", () => {
  it("names every drand relay the page asks", () => {
    expect(
      DRAND_RELAYS.map((relay) => new URL(relay).host).filter(
        (host) => !readable(privacyPage).includes(host)
      )
    ).toStrictEqual([]);
  });
});
