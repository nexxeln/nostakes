import { describe, expect, it } from "@effect/vitest";
import { Actions } from "@nostakes/engine";
import { Option, Result } from "effect";

import {
  Audiences,
  RoomCommands,
  RoomEvents,
  RoomViews,
  ServerOnly,
  decide,
  evolveAll,
  nextDeadline,
  openRoom,
  replay,
  viewFor,
} from "../src/index.js";
import type {
  Actor,
  Deadline,
  RoomCommand,
  RoomEvent,
  RoomLog,
  RoomState,
} from "../src/index.js";
import {
  ann,
  as,
  bob,
  dealAt,
  drand,
  join,
  ms,
  rejection,
  roomCode,
  run,
  server,
  settings,
  sit,
} from "./fixtures.js";

const clocked = { ...settings, turnSeconds: 30 };

const opening = openRoom({
  at: ms(0),
  avatar: "spade",
  chain: drand.chain,
  code: roomCode,
  host: ann,
  name: ann,
  settings: clocked,
});

const played = (commands: readonly RoomCommand[]) => {
  const log: [RoomLog[0], ...RoomEvent[]] = [...opening];
  let state: RoomState = replay(log);

  for (const command of commands) {
    const decision = decide(state, command);

    if (Result.isFailure(decision)) {
      throw decision.failure;
    }

    log.push(...decision.success);
    state = evolveAll(state, decision.success);
  }

  return { log, state };
};

const dealing = [
  join(bob),
  sit(ann, 0),
  sit(bob, 1),
  RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
  dealAt(10),
];

const turnClock = (state: RoomState): Deadline =>
  Option.getOrThrow(nextDeadline(state));

const noteStall = (state: RoomState, at = 20, by: Actor = server) =>
  RoomCommands.NoteStall({ at: ms(at), by, deadline: turnClock(state) });

const stalledFor = (state: RoomState) =>
  [Audiences.Spectator(), Audiences.Unseated({ player: ann })].map(
    (audience) => {
      const view = viewFor(state, audience, ms(25));

      return RoomViews.$is("Open")(view) ? view.stalled : Option.none();
    }
  );

describe("a stalled room", () => {
  it("records the server's stall note, shows it to every viewer, and keeps it through a replay", () => {
    const dealt = played(dealing);
    const deadline = turnClock(dealt.state);
    const noted = played([...dealing, noteStall(dealt.state)]);

    expect(noted.log.at(-1)).toStrictEqual(
      RoomEvents.TableStalled({ at: ms(20), deadline })
    );
    expect(stalledFor(noted.state)).toStrictEqual([
      Option.some({ since: ms(20) }),
      Option.some({ since: ms(20) }),
    ]);
    expect(stalledFor(replay(noted.log))).toStrictEqual(
      stalledFor(noted.state)
    );
    expect(stalledFor(dealt.state)).toStrictEqual([
      Option.none(),
      Option.none(),
    ]);
  });

  it("takes a stall note only from the server, and a second note adds nothing", () => {
    const dealt = played(dealing).state;
    const stalled = run(dealt, noteStall(dealt)).state;

    expect(rejection(dealt, noteStall(dealt, 20, as(ann)))).toStrictEqual(
      new ServerOnly({ command: "NoteStall" })
    );
    expect(run(stalled, noteStall(dealt, 21)).events).toStrictEqual([]);
  });

  it("clears the stall in the batch that next meets a deadline, and not on a member's action or a refused answer", () => {
    const dealt = played(dealing).state;
    const deadline = turnClock(dealt);
    const stalled = run(dealt, noteStall(dealt)).state;

    const early = RoomCommands.ExpireClock({
      at: ms(deadline.at - 1),
      by: server,
      deadline: deadline.at,
    });

    expect(Result.isFailure(decide(stalled, early))).toBe(true);

    const acted = run(
      stalled,
      RoomCommands.Act({ action: Actions.Call(), at: ms(30), by: as(ann) })
    );

    expect(acted.events.some(RoomEvents.$is("StallCleared"))).toStrictEqual(
      false
    );
    expect(stalledFor(acted.state)[0]).toStrictEqual(
      Option.some({ since: ms(20) })
    );

    const next = turnClock(acted.state);

    const answered = run(
      acted.state,
      RoomCommands.ExpireClock({ at: next.at, by: server, deadline: next.at })
    );

    expect(answered.events[0]).toStrictEqual(
      RoomEvents.StallCleared({ at: next.at })
    );
    expect(answered.events.length).toBeGreaterThan(1);
    expect(stalledFor(answered.state)).toStrictEqual([
      Option.none(),
      Option.none(),
    ]);
  });
});
