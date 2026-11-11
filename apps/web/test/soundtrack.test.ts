import { describe, expect, it } from "@effect/vitest";

import { TABLE_STAGING, planFor } from "../src/features/moments/timeline.js";

describe("the table's own staging of a moment", () => {
  it("stays as fast as it was, whatever a clip does", () => {
    expect({
      holds: [
        planFor("Celebration", 1),
        planFor("Groan", 3),
        planFor("Reveal", 2),
        planFor("Relief", 1),
      ],
      staging: {
        landed: [...TABLE_STAGING.landed],
        spread: TABLE_STAGING.spread,
      },
    }).toStrictEqual({
      holds: [
        { hold: 1600, leave: 280 },
        { hold: 2800, leave: 280 },
        { hold: 2400, leave: 280 },
        { hold: 1600, leave: 280 },
      ],
      staging: { landed: [], spread: 1 },
    });
  });
});
