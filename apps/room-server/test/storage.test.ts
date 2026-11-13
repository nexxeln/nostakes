import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import { SeqSchema } from "@nostakes/protocol";
import { Effect, Option } from "effect";

import { harnessHttp } from "./fixtures/harness-http.js";
import {
  codec,
  command,
  connect,
  isClosing,
  isEvents,
  joinAs,
  openRoomWith,
  post,
  replyTo,
} from "./fixtures/room-client.js";
import type { RoomClient } from "./fixtures/room-client.js";
import {
  inspect,
  loseStoredEvent,
  restart,
  ToyStack,
} from "./fixtures/stack.js";
import { ToyMemberCommandSchema } from "./fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_storage_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const baseUrl = deployed.pipe(
  Effect.flatMap(({ url }) => Effect.fromNullishOr(url)),
  Effect.orDie
);

const Commands = ToyMemberCommandSchema.cases;

const contiguous = (count: number) =>
  Array.from({ length: count }, (_, index) => index + 1);

test(
  "1. atomic: a batch that fails halfway writes no events and no reply row",
  Effect.gen(function* atomic() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const before = yield* inspect(base, anaPass.code);

    yield* ben.client.send(command("boom", Commands.Explode.make({})));

    const failed = yield* ben.client.next("reply boom", replyTo("boom"));
    const after = yield* inspect(base, anaPass.code);

    expect(failed.result).toEqual(
      codec.reply.cases.Unavailable.make({ reason: "StorageFailed" })
    );
    expect(after.seqs).toEqual(before.seqs);
    expect(after.events).toEqual(before.events);
    expect(after.replies).toBe(before.replies);
    expect(after.headSeq).toBe(before.headSeq);
    expect(after.memoryMatchesLog).toBe(true);

    yield* ben.client.send(
      command("next", Commands.Increment.make({ times: 1 }))
    );

    const next = yield* ben.client.next("reply next", replyTo("next"));

    expect(next.result).toEqual(
      codec.reply.cases.Accepted.make({
        seq: SeqSchema.make(before.headSeq + 1),
      })
    );

    yield* ana.client.next("increment", isEvents);

    expect(
      ana.client.messages.filter(isEvents).map(({ from, to }) => [from, to])
    ).toEqual([[before.headSeq + 1, before.headSeq + 1]]);
  }).pipe(Effect.provide(harnessHttp))
);

test(
  "2. recovery: after a forced restart the state equals the replay of the log and numbering continues",
  Effect.gen(function* recovery() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben", "Cy"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");

    yield* ana.client.send(command("deal", Commands.RequestDeal.make({})));
    yield* ana.client.next("deal reply", replyTo("deal"));

    for (const id of ["i1", "i2", "i3"]) {
      yield* ana.client.send(
        command(id, Commands.Increment.make({ times: 2 }))
      );
      yield* ana.client.next(`reply ${id}`, replyTo(id));
    }

    const before = yield* inspect(base, anaPass.code);
    const viewBefore = yield* joinAs(base, benPass, "ben before");

    yield* viewBefore.client.disconnect;
    yield* restart(base, anaPass.code);

    const after = yield* inspect(base, anaPass.code);

    expect(after.instance).not.toBe(before.instance);
    expect(after.headSeq).toBe(before.headSeq);
    expect(after.seqs).toEqual(contiguous(before.headSeq));
    expect(after.events).toEqual(before.events);
    expect(after.memoryMatchesLog).toBe(true);

    const viewAfter = yield* joinAs(base, benPass, "ben after");

    expect(viewAfter.welcome.seq).toBe(viewBefore.welcome.seq);
    expect(viewAfter.welcome.view).toEqual(viewBefore.welcome.view);

    yield* viewAfter.client.send(
      command("after", Commands.Increment.make({ times: 1 }))
    );

    const continued = yield* viewAfter.client.next(
      "reply after",
      replyTo("after")
    );

    expect(continued.result).toEqual(
      codec.reply.cases.Accepted.make({
        seq: SeqSchema.make(before.headSeq + 1),
      })
    );
    expect((yield* inspect(base, anaPass.code)).seqs).toEqual(
      contiguous(before.headSeq + 1)
    );
  }).pipe(Effect.provide(harnessHttp))
);

const replyText = (client: RoomClient, id: string) =>
  Effect.gen(function* replyFrameText() {
    const reply = yield* client.next(`reply ${id}`, replyTo(id));

    return client.frames[client.messages.indexOf(reply)] ?? "";
  });

test(
  "6. idempotent: a repeated command id takes effect once and is answered with the stored reply, byte for byte, across a restart",
  Effect.gen(function* idempotent() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const first = yield* joinAs(base, anaPass, "ana");
    const once = command("same", Commands.Increment.make({ times: 1 }));
    const refused = command("refused", Commands.Act.make({}));

    yield* first.client.send(once);

    const accepted = yield* replyText(first.client, "same");

    yield* first.client.send(refused);

    const rejected = yield* replyText(first.client, "refused");

    yield* first.client.send(
      command("turn", Commands.StartTurn.make({ ms: 600_000 }))
    );
    yield* first.client.next("reply turn", replyTo("turn"));
    yield* first.client.send(once);
    yield* first.client.send(refused);

    const acceptedAgain = yield* replyText(first.client, "same");
    const rejectedAgain = yield* replyText(first.client, "refused");
    const afterRepeats = yield* inspect(base, anaPass.code);

    yield* first.client.disconnect;
    yield* restart(base, anaPass.code);

    const second = yield* joinAs(base, anaPass, "ana again");

    yield* second.client.send(once);
    yield* second.client.send(refused);

    const acceptedAfterRestart = yield* replyText(second.client, "same");
    const rejectedAfterRestart = yield* replyText(second.client, "refused");
    const final = yield* inspect(base, anaPass.code);

    expect(accepted).toBe(
      '{"_tag":"Reply","id":"same","result":{"_tag":"Accepted","seq":3}}'
    );
    expect(rejected).toBe(
      '{"_tag":"Reply","id":"refused","result":{"_tag":"Rejected","rejection":{"_tag":"ToyRefusal","reason":"NotYourTurn"}}}'
    );
    expect([acceptedAgain, acceptedAfterRestart]).toEqual([accepted, accepted]);
    expect([rejectedAgain, rejectedAfterRestart]).toEqual([rejected, rejected]);
    expect(afterRepeats.headSeq).toBe(4);
    expect(final.headSeq).toBe(4);
    expect(final.seqs).toEqual(contiguous(4));
    expect(second.welcome.view.count).toBe(1);
  }).pipe(Effect.provide(harnessHttp))
);

test(
  "12. invariant breach: nothing sent, nothing stored, and the room closes to further commands",
  Effect.gen(function* breach() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const before = yield* inspect(base, anaPass.code);

    yield* ana.client.send(command("bad", Commands.Corrupt.make({})));

    const anaClosed = yield* ana.client.waitClosed;
    const benClosed = yield* ben.client.waitClosed;
    const after = yield* inspect(base, anaPass.code);

    expect(anaClosed.reason).toBe("RoomHalted");
    expect(benClosed.reason).toBe("RoomHalted");
    expect(ana.client.messages.filter(isEvents)).toEqual([]);
    expect(ben.client.messages.filter(isEvents)).toEqual([]);
    expect(ben.client.messages.filter(isClosing)).toEqual([
      codec.server.cases.Closing.make({ reason: "RoomHalted" }),
    ]);
    expect(after.seqs).toEqual(before.seqs);
    expect(after.events).toEqual(before.events);
    expect(after.replies).toBe(before.replies);
    expect(Option.isSome(after.halted)).toBe(true);

    const join = yield* post(new URL(`/rooms/${anaPass.code}/members`, base), {
      avatar: "owl",
      name: "Late",
    });

    expect(join.status).toBe(410);

    const late = yield* connect(base, anaPass.code, "late socket");

    expect(yield* late.waitClosed).toEqual({
      code: 4010,
      reason: "RoomHalted",
    });
    expect(late.messages).toEqual([
      codec.server.cases.Closing.make({ reason: "RoomHalted" }),
    ]);

    yield* restart(base, anaPass.code);

    expect(Option.isSome((yield* inspect(base, anaPass.code)).halted)).toBe(
      true
    );

    const refused = yield* post(
      new URL(`/rooms/${anaPass.code}/members`, base),
      { avatar: "owl", name: "Later" }
    );

    expect(refused.status).toBe(410);
  }).pipe(Effect.provide(harnessHttp))
);

test(
  "lost row: a room whose stored log lost an event halts at the rows before it, and its memory equals the replay of those rows, not of the rows after the gap",
  Effect.gen(function* lostRow() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");

    for (const id of ["i1", "i2", "i3"]) {
      yield* ana.client.send(
        command(id, Commands.Increment.make({ times: 1 }))
      );
      yield* ana.client.next(`reply ${id}`, replyTo(id));
    }

    yield* ana.client.disconnect;

    const before = yield* inspect(base, anaPass.code);

    yield* loseStoredEvent(base, anaPass.code, before.headSeq - 1);

    const after = yield* inspect(base, anaPass.code);

    expect({
      halted: Option.isSome(after.halted),
      headSeq: after.headSeq,
      memoryMatchesLog: after.memoryMatchesLog,
      seqs: after.seqs,
    }).toStrictEqual({
      halted: true,
      headSeq: before.headSeq - 2,
      memoryMatchesLog: true,
      seqs: [...contiguous(before.headSeq - 2), before.headSeq],
    });
  }).pipe(Effect.provide(harnessHttp))
);
