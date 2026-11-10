import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { RETRY_POLICY, retryDelay } from "../src/refused-deadline.js";
import { hostRoom, loadRoom, ROOM_RETENTION_MS } from "../src/room-host.js";
import { ana, openToyHost } from "./fixtures/toy-host.js";
import type { RecordingViewer } from "./fixtures/toy-host.js";
import { ToyMemberCommandSchema, toyRoom } from "./fixtures/toy-room.js";

const Commands = ToyMemberCommandSchema.cases;

const REJECTION = '{"_tag":"ToyRefusal","reason":"Jammed"}';

const jammedDeal = () => {
  const room = openToyHost();
  const viewer = room.watch(ana);

  room.send(ana, "jam", 1001, Commands.Jam.make({ on: true }));
  room.send(ana, "deal", 1002, Commands.RequestDeal.make({}));

  return { room, viewer };
};

type Room = ReturnType<typeof openToyHost>;

const refuseUntilStalled = (room: Room, from: number) => {
  const retries: number[] = [];
  let at = from;

  for (let refusal = 0; refusal < 8; refusal += 1) {
    const answer = Option.getOrThrow(room.answerDue(at));
    const next = Option.getOrThrow(room.host.nextDeadline()).at;

    retries.push(next - at);
    expect(room.answerDue(next - 1)).toStrictEqual(Option.none());
    expect(answer.result.note._tag).toBe("Rejected");
    at = next;
  }

  return { at, retries };
};

const lastView = (room: Room, viewer: RecordingViewer) =>
  viewer.frames
    .map((frame) => room.decodeFrame(frame))
    .flatMap((message) =>
      room.host.codec.server.guards.Events(message) ? [message] : []
    )
    .at(-1);

describe("a deadline the room refuses", () => {
  it("doubles the wait between answers from one second up to a minute, and never answers early", () => {
    const { room } = jammedDeal();

    expect(refuseUntilStalled(room, 1002).retries).toStrictEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000,
    ]);
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 20].map((count) =>
        retryDelay(RETRY_POLICY, count)
      )
    ).toStrictEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });

  it("logs each refusal with the room, the deadline, and the rejection, and marks the room stalled once at the fifth", () => {
    const { room, viewer } = jammedDeal();

    const answers = [1002, 2002, 4002, 8002, 16_002, 32_002].map((at) =>
      Option.getOrThrow(room.answerDue(at))
    );

    expect(
      answers.map(({ refused }) =>
        refused.pipe(Option.map(({ message }) => message))
      )
    ).toEqual(
      [1, 2, 3, 4, 5, 6].map((count) =>
        Option.some(
          expect.stringContaining(
            `Room K7P2XZ refused the server's answer to its Deal deadline, ${count} in a row: ${REJECTION}. The server asks again in ${retryDelay(RETRY_POLICY, count)} ms.`
          )
        )
      )
    );
    expect(
      answers.map(({ refused }) =>
        Option.exists(refused, ({ stalled }) => stalled)
      )
    ).toStrictEqual([false, false, false, false, true, true]);
    expect(answers.map(({ stall }) => Option.isSome(stall))).toStrictEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(lastView(room, viewer)?.view.stalled).toStrictEqual(
      Option.some(16_002)
    );
  });

  it("keeps the wait across a restart, and clears it with the stall when the room next accepts the deadline", () => {
    const { room, viewer } = jammedDeal();
    const { at } = refuseUntilStalled(room, 1002);

    const reloaded = hostRoom(
      toyRoom,
      room.memory.storage,
      Option.getOrThrow(loadRoom(toyRoom, room.memory.storage)),
      ROOM_RETENTION_MS
    );

    expect(Option.getOrThrow(reloaded.nextDeadline()).at).toBe(at);

    room.send(ana, "unjam", at - 10, Commands.Jam.make({ on: false }));

    const accepted = Option.getOrThrow(room.answerDue(at));
    const last = lastView(room, viewer);

    expect(accepted.result.note._tag).toBe("Committed");
    expect(accepted.refused).toStrictEqual(Option.none());
    expect(last?.events[0]?._tag).toBe("StallCleared");
    expect(last?.view.stalled).toStrictEqual(Option.none());
    expect(room.memory.tables().refusals).toStrictEqual(Option.none());
    expect(room.host.nextDeadline()).toStrictEqual(Option.none());
  });

  it("does not count an answer that a member's command made stale, and does not delay the deadline that replaced it", () => {
    const room = openToyHost();

    room.send(ana, "jam", 1001, Commands.Jam.make({ on: true }));
    room.send(ana, "turn", 1001, Commands.StartTurn.make({ ms: 1 }));

    const due = Option.getOrThrow(room.host.dueAt(1002));

    room.send(ana, "act", 1002, Commands.Act.make({}));
    room.send(ana, "deal", 1002, Commands.RequestDeal.make({}));

    const late = room.host.answerDeadline(
      due,
      toyRoom.serverCommand(due.due, 1002, new Uint8Array(), Option.none()),
      1002,
      room.connections()
    );

    expect(late.result.note._tag).toBe("Rejected");
    expect(late.refused).toStrictEqual(Option.none());
    expect(room.memory.tables().refusals).toStrictEqual(Option.none());
    expect(room.host.nextDeadline()).toStrictEqual(room.host.dueAt(1002));
  });
});
