import { describe, expect, it } from "@effect/vitest";

import {
  MOST_PEOPLE,
  RoomCommands,
  RoomLocked,
  TooManyPeople,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  ms,
  openOf,
  openedBy,
  player,
  rejection,
  roomCode,
  run,
  runAll,
  settings,
} from "./fixtures.js";

const joining = (who: ReturnType<typeof player>, at = 30) =>
  RoomCommands.Join({ at: ms(at), avatar: "", by: as(who), name: who });

const lock = (locked: boolean, at = 20) =>
  RoomCommands.ChangeSettings({
    at: ms(at),
    by: as(ann),
    settings: { ...settings, locked },
  });

const names = (state: RoomState) =>
  openOf(state).members.map(({ name }) => name);

describe("the door", () => {
  it("keeps out someone new while the host has it locked, lets someone who left come back with their pass, and opens again when unlocked", () => {
    const locked = runAll(openedBy(ann), [
      joining(bob, 10),
      RoomCommands.LeaveRoom({ at: ms(15), by: as(bob) }),
      lock(true),
    ]);

    expect(rejection(locked, joining(cat))).toStrictEqual(
      new RoomLocked({ code: roomCode })
    );
    expect(names(run(locked, joining(bob)).state)).toStrictEqual([ann, bob]);
    expect(
      names(runAll(locked, [lock(false, 25), joining(cat)]))
    ).toStrictEqual([ann, cat]);
  });

  it(`takes at most ${MOST_PEOPLE} people, counting those who left, and a removal frees a place`, () => {
    const crowd = Array.from({ length: MOST_PEOPLE - 1 }, (_, index) =>
      player(`p${index}`)
    );

    const full = runAll(
      openedBy(ann),
      crowd.map((who, index) => joining(who, 10 + index))
    );

    const left = run(
      full,
      RoomCommands.LeaveRoom({ at: ms(40), by: as(crowd[0] ?? bob) })
    ).state;

    expect(rejection(left, joining(cat, 50))).toStrictEqual(
      new TooManyPeople({ most: MOST_PEOPLE, people: MOST_PEOPLE })
    );
    expect(names(run(left, joining(crowd[0] ?? bob, 50)).state)).toHaveLength(
      MOST_PEOPLE
    );

    const freed = run(
      left,
      RoomCommands.RemoveMember({
        at: ms(60),
        by: as(ann),
        player: crowd[1] ?? bob,
      })
    ).state;

    expect(names(run(freed, joining(cat, 70)).state)).toContain(cat);
  });
});
