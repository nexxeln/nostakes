import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import { Option } from "effect";

import {
  AlreadyTheHost,
  Audiences,
  HOST_CLAIM_AFTER_SECONDS,
  HostStillHere,
  NotAMember,
  RoomCommands,
  RoomEvents,
  RoomViews,
  viewFor,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  join,
  ms,
  openedBy,
  player,
  rejection,
  run,
  runAll,
  server,
} from "./fixtures.js";

const CLAIM_AFTER_MS = HOST_CLAIM_AFTER_SECONDS * 1000;

const LEFT_AT = 5000;

const connected = (at: number, players: readonly PlayerId[]) =>
  RoomCommands.NoteAttendance({ at: ms(at), by: server, connected: players });

const claim = (at: number, who = bob) =>
  RoomCommands.ClaimHost({ at: ms(at), by: as(who) });

const withBob = runAll(openedBy(ann), [join(bob), join(cat)]);

const hostGone = run(withBob, connected(LEFT_AT, [bob, cat]));

const hostAwayIn = (state: RoomState) => {
  const view = viewFor(state, Audiences.Unseated({ player: bob }), ms(6000));

  return RoomViews.$is("Open")(view) ? view.hostAway : Option.none();
};

describe("a host who is gone", () => {
  it("is noted when the host's last connection drops and when the host is back, and every view says since when", () => {
    expect(hostGone.events).toStrictEqual([
      RoomEvents.HostAway({ at: ms(LEFT_AT) }),
    ]);
    expect(hostAwayIn(hostGone.state)).toStrictEqual(
      Option.some({
        claimableAt: ms(LEFT_AT + CLAIM_AFTER_MS),
        since: ms(LEFT_AT),
      })
    );

    const back = run(hostGone.state, connected(6000, [ann, bob]));

    expect(back.events).toStrictEqual([RoomEvents.HostBack({ at: ms(6000) })]);
    expect(hostAwayIn(back.state)).toStrictEqual(Option.none());
    expect(run(back.state, connected(7000, [ann])).events).toStrictEqual([]);
  });

  it("can be replaced by any member two minutes after the host's last connection dropped, and not a moment before", () => {
    const due = LEFT_AT + CLAIM_AFTER_MS;

    expect(rejection(hostGone.state, claim(due - 1))).toStrictEqual(
      new HostStillHere({
        claimableAt: Option.some(ms(due)),
        host: ann,
      })
    );

    const claimed = run(hostGone.state, claim(due));

    expect(claimed.events).toStrictEqual([
      RoomEvents.HostChanged({ at: ms(due), host: bob }),
    ]);
    expect(hostAwayIn(claimed.state)).toStrictEqual(Option.none());
    expect(rejection(claimed.state, claim(due + 1, cat))).toStrictEqual(
      new HostStillHere({ claimableAt: Option.none(), host: bob })
    );
  });

  it("cannot be replaced while connected, by the host, or by someone outside the room", () => {
    expect(rejection(withBob, claim(LEFT_AT + CLAIM_AFTER_MS))).toStrictEqual(
      new HostStillHere({ claimableAt: Option.none(), host: ann })
    );
    expect(
      rejection(hostGone.state, claim(LEFT_AT + CLAIM_AFTER_MS, ann))
    ).toStrictEqual(new AlreadyTheHost({ player: ann }));
    expect(
      rejection(hostGone.state, claim(LEFT_AT + CLAIM_AFTER_MS, player("eve")))
    ).toStrictEqual(new NotAMember({ player: player("eve") }));
  });
});
