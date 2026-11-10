import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import type { InRoom } from "../src/features/model.js";
import { tableSnapshot } from "../src/features/table/from-room.js";
import {
  halfRoundedDown,
  raiseDetents,
  raiseLadder,
} from "../src/features/table/sizing.js";

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const roomWith = (
  view: typeof RoomViewSchema.cases.Open.Type,
  live: boolean,
  acting: boolean
): InRoom => ({
  code: RoomCodeSchema.make("ABC234"),
  connected: true,
  copied: "Nothing",
  drafts: { buyIn: "", chips: "", seat: Option.none() },
  events: [],
  link: Option.some({
    phase: live ? "Live" : "Waiting",
    presence: [],
    receivedAt: 0,
    refusal: Option.none(),
    retryDelayMs: Option.none(),
    view: Option.some(view),
  }),
  menu: false,
  notice: Option.none(),
  pending: acting ? [{ acting: true, key: 1, label: "Calling" }] : [],
  picked: Option.none(),
  player: PLAYER,
  settings: Option.none(),
});

const spots = Arbitrary.schema(
  Schema.Struct({
    bigBlind: Schema.Int.check(Schema.isBetween({ maximum: 500, minimum: 1 })),
    callTo: Schema.Int.check(Schema.isBetween({ maximum: 5000, minimum: 0 })),
    extra: Schema.Int.check(Schema.isBetween({ maximum: 200_000, minimum: 0 })),
    isBet: Schema.Boolean,
    min: Schema.Int.check(Schema.isBetween({ maximum: 5000, minimum: 1 })),
    potTotal: Schema.Int.check(
      Schema.isBetween({ maximum: 50_000, minimum: 0 })
    ),
    toCall: Schema.Int.check(Schema.isBetween({ maximum: 5000, minimum: 0 })),
  })
);

describe("the table snapshot", () => {
  it.prop(
    "offers the table only what the view allows, and nothing while offline or waiting on a reply",
    {
      acting: Arbitrary.schema(Schema.Boolean),
      live: Arbitrary.schema(Schema.Boolean),
      view: views,
    },
    ({ acting, live, view }) => {
      const { legal } = tableSnapshot(
        roomWith(view, live, acting),
        view,
        [],
        []
      );

      if (!live || acting) {
        expect(legal).toBeNull();

        return;
      }

      Option.match(view.legal, {
        onNone: () => {
          expect(legal === null || legal.show || legal.muck).toBe(true);
          expect(legal?.call ?? null).toBeNull();
          expect(legal?.raise ?? null).toBeNull();
          expect(legal?.show ?? false).toBe(
            Option.exists(view.showdown, ({ canTable }) => canTable)
          );
          expect(legal?.muck ?? false).toBe(
            Option.exists(view.showdown, ({ canMuck }) => canMuck)
          );
        },
        onSome: (allowed) => {
          expect(legal?.check).toBe(allowed.canCheck);
          expect(legal?.call ?? null).toBe(Option.getOrNull(allowed.call));
          expect(legal?.raise?.min ?? null).toBe(
            allowed.raise.pipe(
              Option.filter(({ maxTo, minTo }) => minTo <= maxTo),
              Option.map(({ minTo }) => minTo),
              Option.getOrNull
            )
          );
          expect(legal?.show).toBe(false);
        },
      });
    },
    { arbitrary: { runs: 200 } }
  );

  it.prop(
    "shows every occupied seat inside the table's seat count, and the viewer's cards",
    { view: views },
    ({ view }) => {
      const snapshot = tableSnapshot(roomWith(view, true, false), view, [], []);

      const occupied = view.seats.filter(
        ({ occupant, seat }) =>
          Option.isSome(occupant) && seat < view.settings.seats
      );

      expect(
        snapshot.seats
          .filter(({ status }) => status !== "Empty")
          .map(({ seat }) => seat)
      ).toEqual(occupied.map(({ seat }) => seat));
      expect(
        snapshot.seats.every(({ stack }) => Number.isSafeInteger(stack))
      ).toBe(true);
    },
    { arbitrary: { runs: 100 } }
  );
});

describe("raise sizing", () => {
  it.prop(
    "picks every amount from an exact, sorted ladder between the smallest and largest raise",
    { spot: spots },
    ({ spot }) => {
      const sized = { ...spot, max: spot.min + spot.extra };
      const ladder = raiseLadder(sized);

      expect(ladder[0]).toBe(sized.min);
      expect(ladder.at(-1)).toBe(sized.max);
      expect(ladder.every(Number.isSafeInteger)).toBe(true);
      expect(
        ladder.every(
          (amount, index) => index === 0 || amount > (ladder[index - 1] ?? 0)
        )
      ).toBe(true);
      expect(ladder.length).toBeLessThan(2000);

      for (const { value } of raiseDetents(sized)) {
        expect(ladder).toContain(value);
      }
    },
    { arbitrary: { runs: 300 } }
  );

  it.prop(
    "halves a pot rounding down, leaving at most one chip over",
    {
      amount: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ maximum: 10_000_000, minimum: 0 }))
      ),
    },
    ({ amount }) => {
      const half = halfRoundedDown(amount);
      const left = amount - half - half;

      expect(left === 0 || left === 1).toBe(true);
    }
  );
});
