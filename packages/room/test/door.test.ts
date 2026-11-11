import { describe, expect, it } from "@effect/vitest";

import {
  Actors,
  HOST_CLAIM_AFTER_SECONDS,
  MOST_PEOPLE,
  RoomCommands,
  RoomEvents,
  RoomLocked,
  RoomStates,
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
  sit,
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

  it("never traps a locked night: when everyone has left, someone who left comes back with their pass, hosts the empty room, and ends it with their chips settled", () => {
    const emptied = runAll(openedBy(ann), [
      joining(bob, 10),
      sit(bob, 2, 150, 11),
      lock(true),
      RoomCommands.LeaveRoom({ at: ms(25), by: as(bob) }),
      RoomCommands.LeaveRoom({ at: ms(26), by: as(ann) }),
    ]);

    const back = run(emptied, joining(bob, 30)).state;

    const closed = run(
      back,
      RoomCommands.CloseRoom({ at: ms(31), by: as(bob) })
    ).state;

    expect({
      host: openOf(back).host,
      newcomer: rejection(emptied, joining(cat, 30)),
      settled: RoomStates.$is("Closed")(closed)
        ? closed.settlement.balances.map(({ net, player: who }) => [who, net])
        : [],
    }).toStrictEqual({
      host: bob,
      newcomer: new RoomLocked({ code: roomCode }),
      settled: [[bob, 0]],
    });
  });

  it("never traps a locked night whose host vanished: someone who left comes back with their pass, takes over two minutes later, and ends it", () => {
    const away = runAll(openedBy(ann), [
      joining(bob, 10),
      lock(true),
      RoomCommands.LeaveRoom({ at: ms(25), by: as(bob) }),
      RoomCommands.NoteAttendance({
        at: ms(26),
        by: Actors.Server(),
        connected: [],
      }),
      joining(bob, 30),
    ]);

    const claimed = run(
      away,
      RoomCommands.ClaimHost({
        at: ms(26 + HOST_CLAIM_AFTER_SECONDS * 1000),
        by: as(bob),
      })
    );

    expect({
      claimed: claimed.events.filter(RoomEvents.$is("HostChanged")),
      closed: RoomStates.$is("Closed")(
        run(
          claimed.state,
          RoomCommands.CloseRoom({
            at: ms(27 + HOST_CLAIM_AFTER_SECONDS * 1000),
            by: as(bob),
          })
        ).state
      ),
    }).toStrictEqual({
      claimed: [
        RoomEvents.HostChanged({
          at: ms(26 + HOST_CLAIM_AFTER_SECONDS * 1000),
          host: bob,
        }),
      ],
      closed: true,
    });
  });
});
