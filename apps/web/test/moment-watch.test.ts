import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema } from "@nostakes/engine";
import { SeenEvents, millis } from "@nostakes/room";
import type { SeenEvent } from "@nostakes/room";

import { replayHand } from "../scripts/moments/replay-hands.js";
import {
  MOST_NOTES,
  NO_MOMENTS,
  reactionNoted,
  watchedMoments,
} from "../src/features/moments/watch.js";

const kit = PlayerIdSchema.make("p2");

const hand = replayHand("AllInBluff", { deck: "TwoColour", theme: "Light" });

const tabled = hand.record.map((event): SeenEvent =>
  SeenEvents.Table({ at: millis(0), event })
);

const numbered = (events: readonly SeenEvent[], from = 0) =>
  events.map((event, index) => ({ event, seq: from + index }));

describe("what the device keeps of a hand for its clip", () => {
  it("keeps at most a fixed number of notes and forgets them all when the next hand starts", () => {
    let watched = watchedMoments(NO_MOMENTS, numbered(tabled));

    for (let thrown = 0; thrown < MOST_NOTES * 2; thrown += 1) {
      watched = reactionNoted(watched, kit, "Fire");
    }

    const [started] = tabled;

    const next = watchedMoments(
      watched,
      numbered(started === undefined ? [] : [started], tabled.length)
    );

    expect({ kept: watched.notes.length, next: next.notes }).toStrictEqual({
      kept: MOST_NOTES,
      next: [],
    });
  });
});
