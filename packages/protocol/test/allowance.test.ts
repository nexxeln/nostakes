import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  FRAME_ALLOWANCE,
  FRAME_BURST,
  FRAMES_PER_SECOND,
  ROOM_STALL_TOLERANCE_MS,
  fullBucket,
  spendToken,
} from "../src/index.js";
import type { Allowance, Bucket } from "../src/index.js";

const SENDER: Allowance = { burst: FRAME_BURST, perSecond: FRAMES_PER_SECOND };

const ints = (minimum: number, maximum: number) =>
  Arbitrary.schema(
    Schema.Array(
      Schema.Int.check(Schema.isBetween({ maximum, minimum }))
    ).check(Schema.isMinLength(1), Schema.isMaxLength(160))
  );

const FRAMES = 150;

const sentAt = (wanted: readonly number[]): readonly number[] => {
  const sent: number[] = [];
  let bucket: Bucket = fullBucket(SENDER, 0);
  let at = 0;

  for (let frame = 0; frame < FRAMES; frame += 1) {
    at += wanted[frame % wanted.length] ?? 0;

    let spent = spendToken(SENDER, bucket, at);

    while (Option.isNone(spent)) {
      at += 1;
      spent = spendToken(SENDER, bucket, at);
    }

    bucket = spent.value;
    sent.push(at);
  }

  return sent;
};

const refusedAt = (processed: readonly number[]): Option.Option<number> => {
  let bucket = fullBucket(FRAME_ALLOWANCE, processed[0] ?? 0);

  for (const [index, at] of processed.entries()) {
    const spent = spendToken(FRAME_ALLOWANCE, bucket, at);

    if (Option.isNone(spent)) {
      return Option.some(index);
    }

    bucket = spent.value;
  }

  return Option.none();
};

describe("the room's frame allowance", () => {
  it.prop(
    "never refuses a sender within the published burst and rate, however the room's own stalls bunch its frames, up to the stall tolerance",
    {
      delays: ints(0, ROOM_STALL_TOLERANCE_MS),
      wanted: ints(0, 120),
    },
    ({ delays, wanted }) => {
      const sent = sentAt(wanted);
      const processed: number[] = [];

      for (const [index, at] of sent.entries()) {
        const delay = delays[index % delays.length] ?? 0;

        processed.push(Math.max(processed.at(-1) ?? 0, at + delay));
      }

      expect(refusedAt(processed)).toStrictEqual(Option.none());
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
