import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Option, Result, Schema } from "effect";

import {
  DEAL_ENTROPY_BYTES,
  ToyAudienceSchema,
  ToyEventSchema,
  ToyMemberCommandSchema,
  toyRoom,
} from "./fixtures/toy-room.js";
import type {
  ToyEvent,
  ToyMemberCommand,
  ToyState,
} from "./fixtures/toy-room.js";

const ana = PlayerIdSchema.make("ana-aaaaaaaaaaaa");

const ben = PlayerIdSchema.make("ben-bbbbbbbbbbbb");

const opened = toyRoom.replay(
  toyRoom.open({
    at: 1000,
    code: RoomCodeSchema.make("K7P2XZ"),
    host: ana,
    request: { avatar: "fox", name: "Ana" },
  })
);

const evolveAll = (state: ToyState, events: readonly ToyEvent[]) => {
  let next = state;

  for (const event of events) {
    next = toyRoom.evolve(next, event);
  }

  return next;
};

const run = (
  state: ToyState,
  by: typeof ana,
  at: number,
  command: ToyMemberCommand
) =>
  Result.map(
    toyRoom.decide(state, toyRoom.stamp(by, at, command)),
    (events) => ({ events, state: evolveAll(state, events) })
  );

const withBen = Result.getOrThrow(
  run(opened, ben, 1001, toyRoom.joinCommand({ avatar: "owl", name: "Ben" }))
).state;

const entropy = Uint8Array.from(
  { length: DEAL_ENTROPY_BYTES },
  (_, index) => index % 256
);

describe("toy room", () => {
  it("deals each member the hex of its own eight entropy bytes when the deal is due", () => {
    const requested = Result.getOrThrow(
      run(withBen, ben, 1002, ToyMemberCommandSchema.cases.RequestDeal.make({}))
    ).state;

    const deadline = Option.getOrThrow(toyRoom.nextDeadline(requested));

    expect(deadline.at).toBe(1002);
    expect(toyRoom.entropyFor(deadline.due)).toBe(512);

    const dealt = Result.getOrThrow(
      toyRoom.decide(
        requested,
        toyRoom.serverCommand(deadline.due, 1002, entropy, Option.none())
      )
    );

    expect(dealt).toEqual([
      ToyEventSchema.cases.SecretDealt.make({
        round: 1,
        secret: "0001020304050607",
        to: ana,
      }),
      ToyEventSchema.cases.SecretDealt.make({
        round: 1,
        secret: "08090a0b0c0d0e0f",
        to: ben,
      }),
    ]);

    expect(
      Result.isFailure(
        toyRoom.decide(
          evolveAll(requested, dealt),
          toyRoom.serverCommand(deadline.due, 1003, entropy, Option.none())
        )
      )
    ).toBe(true);
  });

  it("shows a secret only to its owner and still sends everyone the event", () => {
    const event = ToyEventSchema.cases.SecretDealt.make({
      round: 1,
      secret: "0001020304050607",
      to: ana,
    });

    const forAna = toyRoom.redact(event, toyRoom.audienceOf(withBen, ana));

    const forBen = toyRoom.redact(event, toyRoom.audienceOf(withBen, ben));

    const forSpectator = toyRoom.redact(
      event,
      ToyAudienceSchema.cases.Spectator.make({})
    );

    const wire = (redacted: typeof forAna) =>
      JSON.stringify(
        Schema.encodeSync(toyRoom.schemas.redacted)(Option.getOrThrow(redacted))
      );

    expect(wire(forAna)).toBe(
      `{"_tag":"SecretDealt","round":1,"secret":"0001020304050607","to":"${ana}"}`
    );
    expect(wire(forBen)).toBe(
      `{"_tag":"SecretDealt","round":1,"secret":null,"to":"${ana}"}`
    );
    expect(wire(forSpectator)).toBe(wire(forBen));
  });

  it("expires a turn only at its own deadline, and refuses a stale one", () => {
    const started = Result.getOrThrow(
      run(
        withBen,
        ana,
        2000,
        ToyMemberCommandSchema.cases.StartTurn.make({ ms: 300 })
      )
    ).state;

    const { due } = Option.getOrThrow(toyRoom.nextDeadline(started));

    expect(
      Result.isFailure(
        toyRoom.decide(
          started,
          toyRoom.serverCommand(due, 2299, entropy, Option.none())
        )
      )
    ).toBe(true);
    expect(
      Result.isSuccess(
        toyRoom.decide(
          started,
          toyRoom.serverCommand(due, 2300, entropy, Option.none())
        )
      )
    ).toBe(true);

    const acted = Result.getOrThrow(
      run(started, ana, 2100, ToyMemberCommandSchema.cases.Act.make({}))
    ).state;

    expect(toyRoom.nextDeadline(acted)).toEqual(Option.none());
    expect(
      Result.isFailure(
        toyRoom.decide(
          acted,
          toyRoom.serverCommand(due, 2400, entropy, Option.none())
        )
      )
    ).toBe(true);
  });

  it("keeps its invariants under normal play and breaks them on Corrupt", () => {
    const normal = Result.getOrThrow(
      run(
        withBen,
        ben,
        1003,
        ToyMemberCommandSchema.cases.Increment.make({ times: 3 })
      )
    ).state;

    expect(toyRoom.invariants(normal)).toEqual([]);

    const corrupt = Result.getOrThrow(
      run(normal, ben, 1004, ToyMemberCommandSchema.cases.Corrupt.make({}))
    ).state;

    expect(toyRoom.invariants(corrupt)).toEqual([
      "count 5 differs from 4 increments",
    ]);
  });

  it("emits an Explode batch whose third event cannot be encoded", () => {
    const { events } = Result.getOrThrow(
      run(withBen, ben, 1003, ToyMemberCommandSchema.cases.Explode.make({}))
    );

    const encode = Schema.encodeResult(toyRoom.schemas.event);

    expect(events.map((event) => Result.isSuccess(encode(event)))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("refuses commands from someone who has not joined", () => {
    const stranger = PlayerIdSchema.make("zed-zzzzzzzzzzzz");

    expect(
      Result.isFailure(
        run(
          opened,
          stranger,
          1001,
          ToyMemberCommandSchema.cases.Increment.make({ times: 1 })
        )
      )
    ).toBe(true);
  });
});
