import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema, SeatIndexSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MillisSchema, RoomViewSchema } from "@nostakes/room";
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

const ms = (amount: number) => MillisSchema.make(amount);

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const roomWith = (
  view: typeof RoomViewSchema.cases.Open.Type,
  live: boolean,
  acting: boolean
): InRoom => ({
  clockSamples: [],
  code: RoomCodeSchema.make("ABC234"),
  connected: true,
  copied: "Nothing",
  drafts: { buyIn: "", chips: "", seat: Option.none() },
  events: [],
  link: Option.some({
    newBuild: Option.none(),
    phase: live ? "Live" : "Waiting",
    presence: [],
    receivedAt: 0,
    refusal: Option.none(),
    retryDelayMs: Option.none(),
  }),
  menu: false,
  notice: Option.none(),
  pending: acting ? [{ acting: true, key: 1, label: "Calling" }] : [],
  picked: Option.none(),
  player: PLAYER,
  settings: Option.none(),
  shown: Option.some({ receivedAt: 0, seq: 1, view }),
  update: Option.none(),
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

const ringOf = ({
  remainingMs,
  seat,
  totalMs,
}: {
  readonly remainingMs: number;
  readonly seat: number;
  readonly totalMs: number;
}) => ({ seat, totalMs: Math.max(remainingMs, totalMs) });

describe("the ring around a face", () => {
  it.prop(
    "runs for the full length the view gives the clock, never a length guessed from the settings",
    { view: views },
    ({ view }) => {
      const { clock } = tableSnapshot(
        roomWith(view, true, false),
        view,
        [],
        []
      );

      const wanted = view.clocks.turn.pipe(
        Option.map(ringOf),
        Option.orElse(() => view.clocks.showdown.pipe(Option.map(ringOf)))
      );

      expect(
        clock === null
          ? Option.none()
          : Option.some({ seat: clock.seat, totalMs: clock.totalMs })
      ).toEqual(wanted);
    },
    { arbitrary: { runs: 200 } }
  );

  it.prop(
    "counts down to the server's deadline, judged by the quickest update the page has had, so a late or repeated copy of the view gives back no time",
    { view: views },
    ({ view }) => {
      const late = {
        ...view,
        clocks: {
          ...view.clocks,
          at: ms(10_000),
          showdown: Option.none(),
          turn: Option.some({
            deadline: ms(40_000),
            inTimeBank: false,
            remainingMs: 30_000,
            seat: SeatIndexSchema.make(0),
            totalMs: 30_000,
          }),
        },
      };

      const arrivedAt = (receivedAt: number): InRoom => ({
        ...roomWith(late, true, false),
        clockSamples: [5000 - 995_000, 10_000 - 1_003_000],
        shown: Option.some({ receivedAt, seq: 2, view: late }),
      });

      const first = tableSnapshot(arrivedAt(1_003_000), late, [], []).clock;
      const again = tableSnapshot(arrivedAt(1_009_000), late, [], []).clock;

      expect(first?.remainingMs).toBe(27_000);
      expect(again?.remainingMs).toBe(21_000);
      expect(again?.key).toBe(first?.key);
      expect(first?.totalMs).toBe(30_000);
    },
    { arbitrary: { runs: 20 } }
  );
});

describe("who you are", () => {
  it.prop(
    "comes from the view, seated or not, and never from the id the page kept from its pass",
    { view: views },
    ({ view }) => {
      const named = PlayerIdSchema.make("player-0000000ef");

      const seatedAs = (you: Option.Option<typeof named>) => ({
        ...view,
        hand: Option.none(),
        seats: Array.from({ length: 9 }, (_, index) => ({
          occupant:
            index === 4
              ? Option.some({
                  away: false,
                  leaving: false,
                  leavingRoom: false,
                  owes: { big: false, entry: false, small: false },
                  player: named,
                  posts: false,
                  sittingOut: false,
                  stack: ChipsSchema.make(100),
                  straddling: false,
                })
              : Option.none(),
          seat: SeatIndexSchema.make(index),
        })),
        settings: { ...view.settings, seats: 9 },
        you,
      });

      const heroOf = (you: Option.Option<typeof named>) => {
        const seen = seatedAs(you);

        return tableSnapshot(roomWith(seen, true, false), seen, [], [])
          .heroSeat;
      };

      expect(heroOf(Option.some(named))).toBe(4);
      expect(heroOf(Option.some(PLAYER))).toBeNull();
    },
    { arbitrary: { runs: 20 } }
  );
});

describe("a player who leaves", () => {
  it.prop(
    "keeps their name at the table while their seat plays out, and the seat says whether they are leaving the room or only standing up",
    { view: views },
    ({ view }) => {
      const gone = PlayerIdSchema.make("player-0000000gh");
      const standing = PlayerIdSchema.make("player-0000000ij");

      const occupant = (player: typeof gone, leavingRoom: boolean) =>
        Option.some({
          away: false,
          leaving: true,
          leavingRoom,
          owes: { big: false, entry: false, small: false },
          player,
          posts: false,
          sittingOut: false,
          stack: ChipsSchema.make(100),
          straddling: false,
        });

      const leaving = {
        ...view,
        departed: [{ avatar: "", name: "Cat", player: gone }],
        members: [{ avatar: "", name: "Bea", player: standing }],
        seats: Array.from({ length: 9 }, (_, index) => {
          const seat = SeatIndexSchema.make(index);

          if (index === 2) {
            return { occupant: occupant(gone, true), seat };
          }

          return index === 3
            ? { occupant: occupant(standing, false), seat }
            : { occupant: Option.none(), seat };
        }),
        settings: { ...view.settings, seats: 9 },
      };

      const { seats } = tableSnapshot(
        roomWith(leaving, true, false),
        leaving,
        [gone, standing],
        []
      );

      expect(
        seats
          .filter(({ status }) => status !== "Empty")
          .map(({ name, note, seat }) => [seat, name, note])
      ).toEqual([
        [2, "Cat", "Leaving"],
        [3, "Bea", "Standing up"],
      ]);
    },
    { arbitrary: { runs: 20 } }
  );
});

describe("after a hand, on a fresh page", () => {
  it.prop(
    "a player who folded the last hand shows as folded and may not hunt the rabbit where only players still in may, with no events remembered",
    { view: views },
    ({ view }) => {
      const hero = SeatIndexSchema.make(0);
      const other = SeatIndexSchema.make(1);
      const stillIn = PlayerIdSchema.make("player-0000000cd");

      const folded = {
        ...view,
        hand: Option.none(),
        lastHand: Option.some({
          awards: [],
          boards: [[]],
          dealtIn: [
            { folded: true, player: PLAYER, seat: hero },
            { folded: false, player: stillIn, seat: other },
          ],
          handNumber: 4,
          mucked: [],
          rabbit: [],
          shown: [],
          yourCards: [],
        }),
        seats: Array.from({ length: 9 }, (_, index) => ({
          seat: SeatIndexSchema.make(index),
        })).map((entry) => ({
          ...entry,
          occupant:
            entry.seat === hero || entry.seat === other
              ? Option.some({
                  away: false,
                  leaving: false,
                  leavingRoom: false,
                  owes: { big: false, entry: false, small: false },
                  player: entry.seat === hero ? PLAYER : stillIn,
                  posts: false,
                  sittingOut: false,
                  stack: ChipsSchema.make(100),
                  straddling: false,
                })
              : Option.none(),
        })),
        settings: {
          ...view.settings,
          seats: 9,
          table: {
            ...view.settings.table,
            rabbitHunt: true,
            rabbitHunters: "StillIn" as const,
          },
        },
        you: Option.some(PLAYER),
      };

      const snapshot = tableSnapshot(
        { ...roomWith(folded, true, false), events: [] },
        folded,
        [PLAYER, stillIn],
        []
      );

      expect(snapshot.seats.map(({ seat, status }) => [seat, status])).toEqual([
        [0, "Folded"],
        [1, "In"],
      ]);
      expect(snapshot.afterHand.rabbit).toBe(false);
    },
    { arbitrary: { runs: 20 } }
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
