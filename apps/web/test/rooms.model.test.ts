import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Option } from "effect";

import { Messages } from "../src/features/message.js";
import type { KnownRoom } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const OTHER_CODE = RoomCodeSchema.make("XYZ789");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const flags = {
  deck: "TwoColour" as const,
  invite: Option.none(),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  saved: Option.none(),
  sound: false,
  systemTheme: "Light" as const,
  theme: Option.none(),
};

const known = (
  code: typeof CODE,
  seenAt: number,
  others: readonly string[]
): KnownRoom => ({
  player: PLAYER,
  record: {
    closed: false,
    code,
    door: "Inside",
    left: false,
    others,
    removed: false,
    seenAt,
  },
});

describe("the rooms this device can go back to", () => {
  it("forgets a room the server no longer has and keeps one it still has", () => {
    const home = init({
      ...flags,
      rooms: [known(CODE, 2000, ["Ben"]), known(OTHER_CODE, 1000, [])],
    }).model;

    const kept = update(
      home,
      Messages.CheckedRoom({ code: CODE, gone: false })
    );

    const gone = update(home, Messages.CheckedRoom({ code: CODE, gone: true }));

    expect(kept).toStrictEqual({ model: home });
    expect(gone.model.rooms).toStrictEqual([known(OTHER_CODE, 1000, [])]);
    expect(
      gone.commands?.map(({ args, name }) => ({ args, name }))
    ).toStrictEqual([{ args: { code: CODE }, name: "ForgetRoom" }]);
  });
});
