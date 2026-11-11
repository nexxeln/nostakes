import { describe, expect, it } from "@effect/vitest";
import { QUICKNET } from "@nostakes/shuffle";

import {
  AlreadyAMember,
  AlreadyTheHost,
  MembersOnly,
  NotAMember,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  RoomStates,
  openRoom,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  ms,
  player,
  openedBy,
  rejection,
  roomCode,
  run,
  runAll,
  server,
  settings,
} from "./fixtures.js";

const open = (state: RoomState) => {
  if (!RoomStates.$is("Open")(state)) {
    throw new Error("expected an open room");
  }

  return state;
};

const join = (who: typeof ann, at: number) =>
  RoomCommands.Join({ at: ms(at), avatar: "club", by: as(who), name: who });

const transfer = (by: typeof ann, to: typeof ann) =>
  RoomCommands.TransferHost({ at: ms(30), by: as(by), to });

const withThree = runAll(openedBy(ann), [join(bob, 10), join(cat, 20)]);

describe("members", () => {
  it("opens a room with its creator as host and first member", () => {
    const log = openRoom({
      at: ms(5),
      avatar: "spade",
      code: roomCode,
      host: ann,
      name: "Ann",
      settings,
    });

    expect(log).toStrictEqual([
      RoomEvents.RoomOpened({
        at: ms(5),
        chain: QUICKNET,
        code: roomCode,
        host: ann,
        settings,
      }),
      RoomEvents.MemberJoined({
        at: ms(5),
        avatar: "spade",
        name: "Ann",
        player: ann,
      }),
    ]);
  });

  it("adds a joining member with the time they joined, and refuses a second join", () => {
    const joined = run(openedBy(ann), join(bob, 40));

    expect(
      open(joined.state).members.map((member) => member.player)
    ).toStrictEqual([ann, bob]);
    expect(open(joined.state).members[1]?.joinedAt).toBe(40);
    expect(rejection(joined.state, join(bob, 50))).toStrictEqual(
      new AlreadyAMember({ player: bob })
    );
  });

  it("refuses a join from the server and a profile change from a stranger", () => {
    expect(
      rejection(
        openedBy(ann),
        RoomCommands.Join({ at: ms(1), avatar: "", by: server, name: "x" })
      )
    ).toStrictEqual(new MembersOnly({ command: "Join" }));
    expect(
      rejection(
        openedBy(ann),
        RoomCommands.SetProfile({
          at: ms(1),
          avatar: "",
          by: as(bob),
          name: "Bob",
        })
      )
    ).toStrictEqual(new NotAMember({ player: bob }));
  });

  it("lets only the host transfer the role, and only to another member", () => {
    expect(rejection(withThree, transfer(bob, cat))).toStrictEqual(
      new NotTheHost({ host: ann, player: bob })
    );
    expect(rejection(withThree, transfer(ann, ann))).toStrictEqual(
      new AlreadyTheHost({ player: ann })
    );
    expect(rejection(withThree, transfer(ann, player("zed")))).toStrictEqual(
      new NotAMember({ player: player("zed") })
    );
    expect(open(run(withThree, transfer(ann, cat)).state).host).toBe(cat);
  });

  it("passes the host role to the earliest-joined member when nobody is seated", () => {
    const left = run(
      withThree,
      RoomCommands.LeaveRoom({ at: ms(50), by: as(ann) })
    );

    expect(left.events).toStrictEqual([
      RoomEvents.HostChanged({ at: ms(50), host: bob }),
      RoomEvents.MemberLeft({ at: ms(50), player: ann }),
    ]);
  });

  it("keeps an empty room open and hands it to the next member who joins", () => {
    const empty = run(
      openedBy(ann),
      RoomCommands.LeaveRoom({ at: ms(50), by: as(ann) })
    ).state;

    expect(open(empty).members).toStrictEqual([]);
    expect(run(empty, join(bob, 60)).events).toStrictEqual([
      RoomEvents.HostChanged({ at: ms(60), host: bob }),
      RoomEvents.MemberJoined({
        at: ms(60),
        avatar: "club",
        name: bob,
        player: bob,
      }),
    ]);
  });

  it("treats a command from the past as arriving at the latest time the room has seen", () => {
    const late = run(withThree, join(player("dee"), 5));

    expect(late.events).toStrictEqual([
      RoomEvents.MemberJoined({
        at: ms(20),
        avatar: "club",
        name: "dee",
        player: player("dee"),
      }),
    ]);
  });
});
