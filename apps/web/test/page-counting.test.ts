import { describe, expect, it } from "@effect/vitest";
import { RoomCodeSchema } from "@nostakes/protocol";
import * as Arbitrary from "effect/Arbitrary";

import {
  leavesByLoading,
  pageCounterMayLoad,
} from "../src/features/page-counting.js";
import { roomPath } from "../src/features/wire.js";

const SITE = "https://nostakes.club";

const codes = Arbitrary.schema(RoomCodeSchema);

describe("the page counter and room codes", () => {
  it.prop(
    "never loads on a page or after a page whose address holds a room code",
    { code: codes },
    ({ code }) => {
      const room = roomPath(code);

      expect(
        [
          { path: room, referrer: "" },
          { path: `${room}/`, referrer: "https://example.com/" },
          { path: room.toLowerCase(), referrer: "" },
          { path: "/", referrer: `${SITE}${room}` },
          { path: "/", referrer: `${SITE}${room}?from=chat` },
          { path: "/privacy", referrer: `${SITE}${room}` },
        ].map((page) => pageCounterMayLoad({ ...page, origin: SITE }))
      ).toStrictEqual([false, false, false, false, false, false]);
    }
  );

  it("loads on the home page reached from outside the site", () => {
    expect(
      [
        { path: "/", referrer: "" },
        { path: "/", referrer: "https://www.google.com/" },
        { path: "/", referrer: "not a link" },
      ].map((page) => pageCounterMayLoad({ ...page, origin: SITE }))
    ).toStrictEqual([true, true, true]);
  });

  it.prop(
    "enters a room by loading its page whenever the counter is on this page",
    { code: codes },
    ({ code }) => {
      expect([
        leavesByLoading(roomPath(code), true),
        leavesByLoading(roomPath(code), false),
        leavesByLoading("/", true),
      ]).toStrictEqual([true, false, false]);
    }
  );
});
