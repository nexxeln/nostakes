import { describe, expect, it } from "@effect/vitest";
import { FRAME_BURST, FRAMES_PER_SECOND } from "@nostakes/protocol";

import { CLIENT_BURST_REFILL_MS, CLIENT_FRAME_BURST } from "../src/index.js";

describe("frame budget", () => {
  it("bursts and refills below the server's limit, so a flood close never comes from this client", () => {
    expect(CLIENT_FRAME_BURST).toBeLessThan(FRAME_BURST);
    expect(CLIENT_FRAME_BURST * 1000).toBeLessThan(
      FRAMES_PER_SECOND * CLIENT_BURST_REFILL_MS
    );
  });
});
