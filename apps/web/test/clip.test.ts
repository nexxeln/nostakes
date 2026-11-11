import { describe, expect, it } from "@effect/vitest";

import { partPose } from "../src/features/moments/timeline.js";

const rounded = (value: number) => Math.round(value * 1000) / 1000;

describe("a moment's short clip", () => {
  it("leaves the table's own staging alone, so the table still brings the title in", () => {
    expect(
      (["Celebration", "Groan", "Reveal"] as const).map((family) => {
        const pose = partPose("title", 0, 0, family, 2);

        return { family, opacity: pose.opacity, scale: rounded(pose.scale) };
      })
    ).toStrictEqual([
      { family: "Celebration", opacity: 0, scale: 1.4 },
      { family: "Groan", opacity: 0, scale: 1 },
      { family: "Reveal", opacity: 0, scale: 1.4 },
    ]);
  });
});
