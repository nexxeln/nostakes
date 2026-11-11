import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  COMMAND_ALLOWANCE,
  COMMAND_BURST,
  COMMANDS_PER_SECOND,
  FRAME_ALLOWANCE,
  FRAME_BURST,
  FRAMES_PER_SECOND,
  PLAYER_FRAME_ALLOWANCE,
  ROOM_STALL_TOLERANCE_MS,
  SOCKETS_PER_PLAYER,
  fullBucket,
  spendToken,
} from "../src/index.js";
import type { Allowance, Bucket } from "../src/index.js";

const SENDER: Allowance = { burst: FRAME_BURST, perSecond: FRAMES_PER_SECOND };

const COMMANDER: Allowance = {
  burst: COMMAND_BURST,
  perSecond: COMMANDS_PER_SECOND,
};

const ints = (minimum: number, maximum: number) =>
  Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ maximum, minimum }))
    ).check(Schema.isMinLength(1), Schema.isMaxLength(160))
  );

const FRAMES = 150;

const sentAt = (
  wanted: readonly number[],
  sender: Allowance = SENDER
): readonly number[] => {
  const sent: number[] = [];
  let bucket: Bucket = fullBucket(sender, 0);
  let at = 0;

  for (let frame = 0; frame < FRAMES; frame += 1) {
    at += wanted[frame % wanted.length] ?? 0;

    let spent = spendToken(sender, bucket, at);

    while (Option.isNone(spent)) {
      at += 1;
      spent = spendToken(sender, bucket, at);
    }

    bucket = spent.value;
    sent.push(at);
  }

  return sent;
};

const refusedAt = (
  processed: readonly number[],
  allowance: Allowance = FRAME_ALLOWANCE
): Option.Option<number> => {
  let bucket = fullBucket(allowance, processed[0] ?? 0);

  for (const [index, at] of processed.entries()) {
    const spent = spendToken(allowance, bucket, at);

    if (Option.isNone(spent)) {
      return Option.some(index);
    }

    bucket = spent.value;
  }

  return Option.none();
};

const throughStalls = (sent: readonly number[], delays: readonly number[]) => {
  const processed: number[] = [];

  for (const [index, at] of sent.entries()) {
    const delay = delays[index % delays.length] ?? 0;

    processed.push(Math.max(processed.at(-1) ?? 0, at + delay));
  }

  return processed;
};

const held = (sent: readonly number[]) =>
  sent.map((at) => Math.max(at, ROOM_STALL_TOLERANCE_MS));

const atStall = (processed: readonly number[]) =>
  processed.filter((at) => at === ROOM_STALL_TOLERANCE_MS).length;

const merged = (devices: readonly (readonly number[])[]) =>
  devices.flat().toSorted((left, right) => left - right);

describe("the room's frame allowance", () => {
  it.prop(
    "never refuses a sender within the published burst and rate, however the room's own stalls bunch its frames, up to the stall tolerance",
    {
      delays: ints(0, ROOM_STALL_TOLERANCE_MS),
      wanted: ints(0, 120),
    },
    ({ delays, wanted }) => {
      expect(refusedAt(throughStalls(sentAt(wanted), delays))).toStrictEqual(
        Option.none()
      );
    }
  );

  it("admits the worst honest case exactly: a full burst and then the full rate, all held back by one stall as long as the tolerance", () => {
    const sent = sentAt([0]);

    const processed = sent.map((at) => Math.max(at, ROOM_STALL_TOLERANCE_MS));

    const bunched = processed.filter(
      (at) => at === ROOM_STALL_TOLERANCE_MS
    ).length;

    expect([bunched, refusedAt(processed)]).toStrictEqual([
      FRAME_ALLOWANCE.burst,
      Option.none(),
    ]);
  });

  it("still refuses a flood: one frame more than the allowance at once, and a sender that keeps going faster than the rate", () => {
    const flood = Array.from({ length: FRAME_ALLOWANCE.burst + 1 }, () => 5000);

    const tooFast = Array.from(
      { length: 4 * FRAME_ALLOWANCE.burst },
      (_, index) => index * Math.floor(1000 / (2 * FRAMES_PER_SECOND))
    );

    expect([refusedAt(flood), Option.isSome(refusedAt(tooFast))]).toStrictEqual(
      [Option.some(FRAME_ALLOWANCE.burst), true]
    );
  });
});

describe("a player's allowances across all their sockets", () => {
  it.prop(
    "never refuses a player whose devices each stay within the published burst and rate, up to the sockets a player may hold, however the room's stalls bunch their frames",
    {
      delays: ints(0, ROOM_STALL_TOLERANCE_MS),
      devices: Arbitrary.schema(
        Schema.Array(
          Schema.Array(
            Schema.Int.check(Schema.isBetween({ maximum: 120, minimum: 0 }))
          ).check(Schema.isMinLength(1), Schema.isMaxLength(40))
        ).check(Schema.isMinLength(1), Schema.isMaxLength(SOCKETS_PER_PLAYER))
      ),
    },
    ({ delays, devices }) => {
      const processed = throughStalls(
        merged(devices.map((wanted) => sentAt(wanted))),
        delays
      );

      expect(refusedAt(processed, PLAYER_FRAME_ALLOWANCE)).toStrictEqual(
        Option.none()
      );
    }
  );

  it.prop(
    "never refuses a player's commands sent within the published command burst and rate, however the room's stalls bunch them",
    {
      delays: ints(0, ROOM_STALL_TOLERANCE_MS),
      wanted: ints(0, 1000),
    },
    ({ delays, wanted }) => {
      const processed = throughStalls(sentAt(wanted, COMMANDER), delays);

      expect(refusedAt(processed, COMMAND_ALLOWANCE)).toStrictEqual(
        Option.none()
      );
    }
  );

  it("admits a player's worst honest case exactly: every socket a full burst and then the full rate, and the commands a full burst and then their full rate, all held back by one stall as long as the tolerance", () => {
    const frames = held(
      merged(Array.from({ length: SOCKETS_PER_PLAYER }, () => sentAt([0])))
    );

    const commands = held(sentAt([0], COMMANDER));

    expect([
      atStall(frames),
      refusedAt(frames, PLAYER_FRAME_ALLOWANCE),
      atStall(commands),
      refusedAt(commands, COMMAND_ALLOWANCE),
    ]).toStrictEqual([
      PLAYER_FRAME_ALLOWANCE.burst,
      Option.none(),
      COMMAND_ALLOWANCE.burst,
      Option.none(),
    ]);
  });

  it("refuses a player who floods past either allowance, however many sockets the flood is spread over", () => {
    const frames = Array.from(
      { length: PLAYER_FRAME_ALLOWANCE.burst + 1 },
      () => 5000
    );

    const commands = Array.from(
      { length: COMMAND_ALLOWANCE.burst + 1 },
      () => 5000
    );

    const steady = Array.from(
      { length: 4 * COMMAND_ALLOWANCE.burst },
      (_, index) => index * Math.floor(1000 / (2 * COMMANDS_PER_SECOND))
    );

    expect([
      refusedAt(frames, PLAYER_FRAME_ALLOWANCE),
      refusedAt(commands, COMMAND_ALLOWANCE),
      Option.isSome(refusedAt(steady, COMMAND_ALLOWANCE)),
    ]).toStrictEqual([
      Option.some(PLAYER_FRAME_ALLOWANCE.burst),
      Option.some(COMMAND_ALLOWANCE.burst),
      true,
    ]);
  });
});
