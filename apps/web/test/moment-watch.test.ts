import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema } from "@nostakes/engine";
import {
  Audiences,
  RoomEvents,
  SeenEvents,
  millis,
  redact,
} from "@nostakes/room";
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

const tank: SeenEvent = redact(
  RoomEvents.TimeBankStarted({
    at: millis(0),
    deadline: millis(30_000),
    player: kit,
  }),
  Audiences.Spectator()
);

const numbered = (events: readonly SeenEvent[], from = 0) =>
  events.map((event, index) => ({ event, seq: from + index }));

const MID_HAND = 12;

describe("what the device keeps of a hand for its clip", () => {
  it("notes a player going into the time bank at the point of the hand it happened, and only during a hand", () => {
    const before = watchedMoments(NO_MOMENTS, numbered([tank]));

    const during = watchedMoments(
      NO_MOMENTS,
      numbered([...tabled.slice(0, MID_HAND), tank, ...tabled.slice(MID_HAND)])
    );

    const after = watchedMoments(during, numbered([tank], tabled.length + 1));

    expect({
      after: after.notes,
      before: before.notes,
      during: during.notes,
    }).toStrictEqual({
      after: [{ after: MID_HAND, kind: "Tanked", player: kit }],
      before: [],
      during: [{ after: MID_HAND, kind: "Tanked", player: kit }],
    });
  });

  it("notes a reaction where it was thrown, even after the hand ended, and none with no hand on record", () => {
    const watched = watchedMoments(NO_MOMENTS, numbered(tabled));

    expect({
      none: reactionNoted(NO_MOMENTS, kit, "Laugh").notes,
      thrown: reactionNoted(watched, kit, "Laugh").notes,
    }).toStrictEqual({
      none: [],
      thrown: [
        {
          after: hand.record.length,
          kind: "Reacted",
          player: kit,
          reaction: "Laugh",
        },
      ],
    });
  });

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
