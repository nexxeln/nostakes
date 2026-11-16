import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { printed } from "../scripts/feedback-text.ts";

const AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1";

describe("pnpm feedback", () => {
  it.effect(
    "prints as inert text whatever escapes, overrides, or lines it holds",
    () =>
      Effect.sync(() => {
        const shown = printed({
          note: [
            "Fine game.\u001B[2J\u001B[31mred\u001B]8;;https://evil.example\u0007link\u001B]8;;\u0007",
            "abc\u202Edcba\u2066x\u2069",
            "2026-01-01 00:00 UTC  Home  1x1  Chrome 1 on Linux  build fake\r\u0085\u2028tail",
          ].join("\n"),
          agent: AGENT,
          at: 1_794_832_440_000,
          height: 844,
          screen: "Room",
          width: 390,
          build: "b7f3c2\u001B[0m",
          id: 1,
        });

        expect(shown).toBe(
          [
            "2026-11-16 12:34 UTC  Room  390x844  Safari 18 on iOS  build b7f3c2\uFFFD[0m",
            "  | Fine game.\uFFFD[2J\uFFFD[31mred\uFFFD]8;;https://evil.example\uFFFDlink\uFFFD]8;;\uFFFD",
            "  | abc\uFFFDdcba\uFFFDx\uFFFD",
            "  | 2026-01-01 00:00 UTC  Home  1x1  Chrome 1 on Linux  build fake\uFFFD\uFFFD\uFFFDtail",
          ].join("\n")
        );
      })
  );
});
