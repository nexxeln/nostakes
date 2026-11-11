import { describe, expect, it } from "@effect/vitest";
import {
  CommandIdSchema,
  MAX_MISSED_EVENTS,
  SeqSchema,
} from "@nostakes/protocol";
import { Equal, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { CommitNotes, loadRoom, ROOM_RETENTION_MS } from "../src/room-host.js";
import { REPLIES_KEPT_PER_PLAYER } from "../src/room-storage.js";
import { describeCatchUp, missedIn } from "./fixtures/room-client.js";
import { ana, ben, cy, openToyHost } from "./fixtures/toy-host.js";
import type { RecordingViewer } from "./fixtures/toy-host.js";
import {
  ToyEventSchema,
  ToyMemberCommandSchema,
  ToyRedactedSchema,
  toyRoom,
} from "./fixtures/toy-room.js";

const Commands = ToyMemberCommandSchema.cases;

const withMembers = () => {
  const room = openToyHost();

  room.join(ben, 1001, "Ben");
  room.join(cy, 1002, "Cy");

  return room;
};

const seqsOf = (
  room: ReturnType<typeof openToyHost>,
  viewer: RecordingViewer
) =>
  viewer.frames.flatMap((frame) => {
    const message = room.decodeFrame(frame);

    return room.host.codec.server.guards.Events(message)
      ? message.events.map((_, index) => message.from + index)
      : [];
  });

describe("commit", () => {
  it("writes nothing and sends nothing when a batch fails halfway", () => {
    const room = withMembers();
    const viewer = room.watch(ben);
    const before = room.memory.tables();

    const result = room.send(ben, "b1", 1003, Commands.Explode.make({}));

    expect(result.reply).toEqual(
      room.host.codec.reply.cases.Unavailable.make({ reason: "StorageFailed" })
    );
    expect(room.memory.tables()).toBe(before);
    expect(viewer.frames).toEqual([]);
    expect(room.host.snapshot().headSeq).toBe(4);

    const next = room.send(
      ben,
      "b1",
      1004,
      Commands.Increment.make({ times: 1 })
    );

    expect(next.reply).toEqual(
      room.host.codec.reply.cases.Accepted.make({ seq: SeqSchema.make(5) })
    );
    expect(seqsOf(room, viewer)).toEqual([5]);
  });

  it("takes a repeated command id once and answers it with the stored reply", () => {
    const room = withMembers();
    const viewer = room.watch(cy);

    const first = room.send(
      ben,
      "b1",
      1003,
      Commands.Increment.make({ times: 2 })
    );

    const again = room.send(
      ben,
      "b1",
      1004,
      Commands.Increment.make({ times: 2 })
    );

    const otherPlayer = room.send(
      cy,
      "b1",
      1005,
      Commands.Increment.make({ times: 1 })
    );

    expect(again.reply).toEqual(first.reply);
    expect(CommitNotes.$is("Replayed")(again.note)).toBe(true);
    expect(room.host.snapshot().state.count).toBe(3);
    expect(seqsOf(room, viewer)).toEqual([5, 6, 7]);
    expect(CommitNotes.$is("Committed")(otherPlayer.note)).toBe(true);
  });

  it("writes nothing for a rejection, and once its socket keeps the reply, repeats it even after the state would accept the command", () => {
    const room = withMembers();
    const before = room.memory.storage.rowsWritten();

    const early = room.send(ben, "act", 1003, Commands.Act.make({}));
    const afterRejection = room.memory.storage.rowsWritten();

    const kept = CommitNotes.$is("Rejected")(early.note)
      ? room.host.keepReplies(ben, [
          { id: CommandIdSchema.make("act"), reply: early.note.reply },
        ])
      : Result.fail("the rejection gave no reply to keep");

    room.send(ben, "start", 1004, Commands.StartTurn.make({ ms: 500 }));

    const retried = room.send(ben, "act", 1005, Commands.Act.make({}));

    expect(room.host.codec.reply.guards.Rejected(early.reply)).toBe(true);
    expect(afterRejection).toBe(before);
    expect(Result.isSuccess(kept)).toBe(true);
    expect(retried.reply).toEqual(early.reply);
    expect(Option.isSome(room.host.snapshot().state.turn)).toBe(true);
  });

  it("keeps the last 64 replies per player", () => {
    const room = withMembers();

    for (let index = 0; index < REPLIES_KEPT_PER_PLAYER + 6; index += 1) {
      room.send(
        ben,
        `b${index}`,
        1003 + index,
        Commands.Increment.make({ times: 1 })
      );
    }

    room.send(cy, "c0", 2000, Commands.Increment.make({ times: 1 }));

    expect(room.memory.storage.countReplies()).toBe(
      REPLIES_KEPT_PER_PLAYER + 1
    );
    expect(
      Option.isNone(
        room.memory.storage.findReply(ben, CommandIdSchema.make("b5"))
      )
    ).toBe(true);
    expect(
      Option.isSome(
        room.memory.storage.findReply(ben, CommandIdSchema.make("b6"))
      )
    ).toBe(true);
  });

  it("halts on an invariant breach: nothing stored, nothing sent, every socket closed", () => {
    const room = withMembers();
    const viewer = room.watch(ben);
    const before = room.memory.tables();

    const breach = room.send(ben, "bad", 1003, Commands.Corrupt.make({}));

    expect(breach.reply).toEqual(
      room.host.codec.reply.cases.Unavailable.make({ reason: "RoomHalted" })
    );
    expect(room.memory.tables().events).toBe(before.events);
    expect(room.memory.tables().replies).toBe(before.replies);
    expect(viewer.frames).toEqual([]);
    expect(room.closings.map((frame) => room.decodeFrame(frame))).toEqual([
      room.host.codec.server.cases.Closing.make({ reason: "RoomHalted" }),
    ]);

    const later = room.send(
      cy,
      "fine",
      1004,
      Commands.Increment.make({ times: 1 })
    );

    expect(CommitNotes.$is("RoomHalted")(later.note)).toBe(true);
    expect(room.memory.tables().events).toBe(before.events);

    const restarted = Option.getOrThrow(loadRoom(toyRoom, room.memory.storage));

    expect(Option.isSome(restarted.halted)).toBe(true);
  });

  it("halts at once when a committed event never reaches storage: the batch is not sent and every socket is told", () => {
    const room = openToyHost(toyRoom, (storage) => ({
      ...storage,
      appendEvent: (row) => {
        if (row.seq !== 6) {
          storage.appendEvent(row);
        }
      },
    }));

    room.join(ben, 1001, "Ben");

    const viewer = room.watch(ben);

    room.send(ben, "b1", 1002, Commands.Increment.make({ times: 1 }));

    const lost = room.send(
      ben,
      "b2",
      1003,
      Commands.Increment.make({ times: 2 })
    );

    const later = room.send(
      ben,
      "b3",
      1004,
      Commands.Increment.make({ times: 1 })
    );

    expect(lost.reply).toEqual(
      room.host.codec.reply.cases.Unavailable.make({ reason: "RoomHalted" })
    );
    expect(CommitNotes.$is("Halted")(lost.note)).toBe(true);
    expect(seqsOf(room, viewer)).toEqual([4]);
    expect(room.closings.map((frame) => room.decodeFrame(frame))).toEqual([
      room.host.codec.server.cases.Closing.make({ reason: "RoomHalted" }),
    ]);
    expect(room.host.snapshot().headSeq).toBe(4);
    expect(CommitNotes.$is("RoomHalted")(later.note)).toBe(true);
    expect(
      Option.isSome(
        Option.getOrThrow(loadRoom(toyRoom, room.memory.storage)).halted
      )
    ).toBe(true);
  });

  it("halts when the core drops an event for an audience", () => {
    const room = openToyHost({
      ...toyRoom,
      redact: (event, audience) =>
        ToyEventSchema.guards.SecretDealt(event)
          ? Option.none()
          : toyRoom.redact(event, audience),
    });

    room.join(ben, 1001, "Ben");
    room.watch(ben);
    room.send(ben, "deal", 1002, Commands.RequestDeal.make({}));

    const before = room.memory.tables();
    const dealt = room.runDue(1002);

    expect(
      dealt.pipe(Option.exists(({ note }) => CommitNotes.$is("Halted")(note)))
    ).toBe(true);
    expect(room.memory.tables().events).toBe(before.events);
  });

  it("arms the alarm for the earliest deadline, and once none is left for the room's expiry, which each new event pushes back", () => {
    const room = withMembers();

    room.send(ben, "start", 2000, Commands.StartTurn.make({ ms: 300 }));

    expect(room.memory.alarm()).toEqual(Option.some(2300));

    room.send(ben, "act", 2100, Commands.Act.make({}));

    expect(room.memory.alarm()).toEqual(Option.some(2100 + ROOM_RETENTION_MS));

    room.send(ben, "noise", 2200, Commands.Act.make({}));

    expect(room.memory.alarm()).toEqual(Option.some(2100 + ROOM_RETENTION_MS));

    room.send(ben, "again", 2400, Commands.StartTurn.make({ ms: 300 }));
    room.send(ben, "done", 2500, Commands.Act.make({}));

    expect(room.memory.alarm()).toEqual(Option.some(2500 + ROOM_RETENTION_MS));

    room.host.armAlarm(Option.some(9000));

    expect(room.memory.alarm()).toEqual(Option.some(9000));
  });

  it("sends missed events from the first one after the client's last when at most 200 are behind, and otherwise names the skipped range", () => {
    const room = withMembers();
    const batches = Math.ceil(MAX_MISSED_EVENTS / 8) + 1;

    for (let index = 0; index < batches; index += 1) {
      room.send(
        ben,
        `b${index}`,
        2000 + index,
        Commands.Increment.make({ times: 8 })
      );
    }

    const head = room.host.snapshot().headSeq;

    const missedAfter = (after: number) => {
      const frame = room.host.welcome(
        cy,
        Option.some(after),
        3000,
        room.connections()
      );

      const message = room.decodeFrame(
        Option.getOrThrow(Result.getSuccess(frame))
      );

      return room.host.codec.server.guards.Welcome(message)
        ? describeCatchUp(message)
        : message._tag;
    };

    expect(missedAfter(head - MAX_MISSED_EVENTS)).toBe(
      `Missed ${head - MAX_MISSED_EVENTS + 1}..${head}`
    );
    expect(missedAfter(head - MAX_MISSED_EVENTS - 1)).toBe(
      `Skipped ${head - MAX_MISSED_EVENTS}..${head}`
    );
    expect(missedAfter(head)).toBe("UpToDate");
    expect(missedAfter(head + 3)).toBe("UpToDate");
  });

  it("welcomes a returning viewer with its own redacted view of what it missed", () => {
    const room = withMembers();

    room.send(ben, "deal", 1003, Commands.RequestDeal.make({}));
    room.runDue(1003);

    const welcome = room.host.welcome(
      cy,
      Option.some(4),
      1004,
      room.connections()
    );

    const message = room.decodeFrame(
      Option.getOrThrow(Result.getSuccess(welcome))
    );

    expect(room.host.codec.server.guards.Welcome(message)).toBe(true);

    if (!room.host.codec.server.guards.Welcome(message)) {
      return;
    }

    expect(message.seq).toBe(8);
    expect(describeCatchUp(message)).toBe("Missed 5..8");
    expect(missedIn(message).map(({ _tag }) => _tag)).toEqual([
      "DealRequested",
      "SecretDealt",
      "SecretDealt",
      "SecretDealt",
    ]);

    const secrets = missedIn(message).flatMap((event) =>
      ToyRedactedSchema.guards.SecretDealt(event) ? [event] : []
    );

    expect(
      secrets.map(({ secret, to }) => [to, Option.isSome(secret)])
    ).toEqual([
      [ana, false],
      [ben, false],
      [cy, true],
    ]);
    expect(message.view.secret).toEqual(
      Option.fromUndefinedOr(secrets[2]).pipe(
        Option.flatMap(({ secret }) => secret)
      )
    );
  });
});

const Step = Schema.Struct({
  action: Schema.Literals([
    "Increment",
    "StartTurn",
    "Act",
    "RequestDeal",
    "Retry",
    "Tick",
    "Rejoin",
  ]),
  actor: Schema.Literals([0, 1, 2]),
  amount: Schema.Int.check(Schema.isBetween({ maximum: 4, minimum: 1 })),
});

describe("commit over generated sessions", () => {
  it.prop(
    "numbers every event once, delivers each to every viewer in order, and stores a log that replays to the state",
    { steps: Arbitrary.schema(Schema.Array(Step)) },
    ({ steps }) => {
      const room = withMembers();
      const players = [ana, ben, cy];
      const watchers = players.map((player) => room.watch(player));
      const replies = new Map<string, unknown>();
      let now = 2000;
      let lastId = "none";

      for (const [index, { action, actor, amount }] of steps.entries()) {
        const player = players[actor] ?? ana;

        now += amount * 50;

        const command = {
          Act: Commands.Act.make({}),
          Increment: Commands.Increment.make({ times: amount }),
          RequestDeal: Commands.RequestDeal.make({}),
          StartTurn: Commands.StartTurn.make({ ms: amount * 60 }),
        };

        if (action === "Tick") {
          room.runDue(now);
        } else if (action === "Rejoin") {
          watchers.push(room.watch(player));
        } else if (action === "Retry") {
          const again = room.send(player, lastId, now, command.Act);

          if (replies.has(`${player}:${lastId}`)) {
            expect(again.reply).toEqual(replies.get(`${player}:${lastId}`));
          }
        } else {
          lastId = `c${index}`;

          const result = room.send(player, lastId, now, command[action]);

          if (CommitNotes.$is("Rejected")(result.note)) {
            room.host.keepReplies(player, [
              { id: CommandIdSchema.make(lastId), reply: result.note.reply },
            ]);
          }

          replies.set(`${player}:${lastId}`, result.reply);
        }
      }

      const head = room.host.snapshot().headSeq;
      const stored = room.memory.storage.eventsAfter(0);

      expect(stored.map(({ seq }) => seq)).toEqual(
        Array.from({ length: head }, (_, index) => index + 1)
      );
      expect(
        Equal.equals(
          toyRoom.replay(
            stored.map((row) => room.host.codec.decodeEvent(row.event))
          ),
          room.host.snapshot().state
        )
      ).toBe(true);

      for (const watcher of watchers) {
        const seqs = seqsOf(room, watcher);
        const first = seqs[0] ?? head + 1;

        expect(seqs).toEqual(
          Array.from({ length: head - first + 1 }, (_, index) => first + index)
        );
      }
    }
  );
});
