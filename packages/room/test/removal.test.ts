import { describe, expect, it } from "@effect/vitest";
import { NetSchema } from "@nostakes/ledger";
import { Option } from "effect";

import {
  AlreadyRemoved,
  Audiences,
  NobodyToClear,
  NameTaken,
  NotAMember,
  NotTheHost,
  RemovedFromRoom,
  RemovingYourself,
  RoomCommands,
  RoomEvents,
  RoomViews,
  clearableOf,
  removedView,
  viewFor,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  chipCount,
  dan,
  join,
  ms,
  openOf,
  openedBy,
  player,
  rejection,
  run,
  runAll,
  seat,
  settings,
  sit,
} from "./fixtures.js";

const remove = (by: typeof ann, who: typeof ann, at = 20) =>
  RoomCommands.RemoveMember({ at: ms(at), by: as(by), player: who });

const withSeats = runAll(openedBy(ann), [
  join(bob),
  join(cat),
  sit(ann, 0, 200),
  sit(bob, 3, 150),
]);

const named = (who: typeof ann, name: string, at = 30) =>
  RoomCommands.Join({ at: ms(at), avatar: "", by: as(who), name });

const listedRemoved = (state: RoomState) =>
  viewFor(state, Audiences.Unseated({ player: ann }), ms(40)).removed.map(
    ({ name }) => name
  );

describe("removing someone from the room", () => {
  it("is the host's alone, never of themselves, never twice, and only of someone the room knows", () => {
    const removed = run(withSeats, remove(ann, cat)).state;

    expect([
      rejection(withSeats, remove(bob, cat)),
      rejection(withSeats, remove(ann, ann)),
      rejection(removed, remove(ann, cat, 30)),
      rejection(withSeats, remove(ann, dan)),
    ]).toStrictEqual([
      new NotTheHost({ host: ann, player: bob }),
      new RemovingYourself({ player: ann }),
      new AlreadyRemoved({ player: cat }),
      new NotAMember({ player: dan }),
    ]);
  });

  it("cashes a seated player out between hands as leaving would, keeps their line and their name, and refuses their pass a way back in", () => {
    const removed = run(withSeats, remove(ann, bob));

    expect(removed.events).toStrictEqual([
      RoomEvents.CashedOut({
        amount: chipCount(150),
        at: ms(20),
        player: bob,
        seat: seat(3),
      }),
      RoomEvents.MemberRemoved({ at: ms(20), player: bob }),
    ]);
    expect(
      openOf(removed.state).members.map(({ player: who }) => who)
    ).toStrictEqual([ann, cat]);
    expect(listedRemoved(removed.state)).toStrictEqual([bob]);
    expect([
      rejection(removed.state, named(bob, "Bob again")),
      rejection(removed.state, named(dan, bob)),
    ]).toStrictEqual([
      new RemovedFromRoom({ player: bob }),
      new NameTaken({ wanted: bob }),
    ]);
  });

  it("gives back the name of someone removed before they ever bought in, since no settle-up names them", () => {
    const removed = run(withSeats, remove(ann, cat)).state;

    expect(listedRemoved(removed)).toStrictEqual([]);
    expect(
      openOf(run(removed, named(dan, cat)).state).members.map(
        ({ name }) => name
      )
    ).toStrictEqual([ann, bob, cat]);
  });

  it("removes someone who already left, so their pass can no longer bring them back", () => {
    const left = run(
      withSeats,
      RoomCommands.LeaveRoom({ at: ms(10), by: as(bob) })
    ).state;

    const removed = run(left, remove(ann, bob));

    expect(removed.events).toStrictEqual([
      RoomEvents.MemberRemoved({ at: ms(20), player: bob }),
    ]);
    expect(rejection(removed.state, named(bob, bob))).toStrictEqual(
      new RemovedFromRoom({ player: bob })
    );
  });
});

describe("what a removed person can read", () => {
  it("is their own line and, once the night is over, only the transfers that involve them", () => {
    const removed = run(withSeats, remove(ann, bob)).state;

    const closed = run(
      removed,
      RoomCommands.CloseRoom({ at: ms(50), by: as(ann) })
    ).state;

    const line = {
      boughtIn: 150,
      cashedOut: 150,
      net: NetSchema.make(0),
      player: bob,
    };

    expect([removedView(removed, bob), removedView(closed, bob)]).toStrictEqual(
      [
        {
          balance: line,
          code: openOf(removed).code,
          finishing: false,
          people: [{ avatar: "", name: bob, player: bob }],
          player: bob,
          transfers: Option.none(),
        },
        {
          balance: line,
          code: openOf(removed).code,
          finishing: false,
          people: [{ avatar: "", name: bob, player: bob }],
          player: bob,
          transfers: Option.some([]),
        },
      ]
    );
    expect(listedRemoved(closed)).toStrictEqual([bob]);
  });
});

const clear = (by: typeof ann, players: readonly (typeof ann)[], at = 20) =>
  RoomCommands.ClearRoom({ at: ms(at), by: as(by), players });

const shownToClear = (state: RoomState) => {
  const view = viewFor(state, Audiences.Unseated({ player: ann }), ms(19));

  return RoomViews.$is("Open")(view) ? clearableOf(view) : [];
};

describe("clearing the room", () => {
  const eve = player("eve");
  const fay = player("fay");

  const crowded = runAll(withSeats, [
    join(dan),
    join(eve),
    join(fay),
    sit(fay, 5, 150),
    RoomCommands.LeaveRoom({ at: ms(12), by: as(eve) }),
    RoomCommands.LeaveRoom({ at: ms(13), by: as(fay) }),
  ]);

  it("removes everyone in the room without a seat, and everyone who left without buying in, one removal each, and locks the door in the same batch", () => {
    const cleared = run(crowded, clear(ann, shownToClear(crowded)));

    expect(cleared.events).toStrictEqual([
      RoomEvents.MemberRemoved({ at: ms(20), player: cat }),
      RoomEvents.MemberRemoved({ at: ms(20), player: dan }),
      RoomEvents.MemberRemoved({ at: ms(20), player: eve }),
      RoomEvents.SettingsChanged({
        at: ms(20),
        settings: { ...settings, locked: true },
      }),
    ]);
    expect(
      openOf(cleared.state).members.map(({ player: who }) => who)
    ).toStrictEqual([ann, bob]);
    expect(
      openOf(cleared.state).departed.map(({ player: who }) => who)
    ).toStrictEqual([fay]);
  });

  it("names on the host's view exactly the people it removes", () => {
    expect(shownToClear(crowded)).toStrictEqual([cat, dan, eve]);
  });

  it("is the host's alone, and refuses when nobody would go", () => {
    const seatedOnly = runAll(openedBy(ann), [join(bob), sit(bob, 3, 150)]);
    const lockedOnly = run(seatedOnly, clear(ann, [bob])).state;

    expect([
      rejection(crowded, clear(bob, [cat])),
      rejection(lockedOnly, clear(ann, [bob], 30)),
    ]).toStrictEqual([
      new NotTheHost({ host: ann, player: bob }),
      new NobodyToClear({ members: 2 }),
    ]);
  });
});
