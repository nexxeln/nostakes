import {
  CardSchema,
  ChipsSchema,
  Events,
  PlayerIdSchema,
  SeatIndexSchema,
} from "@nostakes/engine";
import type { PlayerId, SeatIndex } from "@nostakes/engine";
import { Effect, Match, Option, Schema } from "effect";

import { HandNumberSchema } from "./events.js";
import { storyOf } from "./hand-story.js";
import type { HandStory } from "./hand-story.js";
import { MOMENT_KINDS, MomentSchema, isPainful, momentsOf } from "./moments.js";
import type { Moment } from "./moments.js";
import type { SeenEvent, SeenTableEvent } from "./redaction.js";
import type { MomentCallouts } from "./settings.js";
import { MillisSchema } from "./time.js";
import type { Millis } from "./time.js";

export const RecapPlayerSchema = Schema.Struct({
  player: PlayerIdSchema,
  seat: SeatIndexSchema,
  shown: Schema.Array(CardSchema),
});

export const RecapMomentSchema = Schema.Struct({
  boards: Schema.Array(Schema.Array(CardSchema)),
  hand: HandNumberSchema,
  moment: MomentSchema,
  players: Schema.Array(RecapPlayerSchema),
});

export type RecapMoment = typeof RecapMomentSchema.Type;

export const BiggestPotSchema = Schema.Struct({
  hand: HandNumberSchema,
  pot: ChipsSchema,
  takers: Schema.Array(PlayerIdSchema),
});

export type BiggestPot = typeof BiggestPotSchema.Type;

export const NightSpanSchema = Schema.Struct({
  from: MillisSchema,
  to: MillisSchema,
});

export type NightSpan = typeof NightSpanSchema.Type;

export const NightRecapSchema = Schema.Struct({
  biggestPot: Schema.Option(BiggestPotSchema),
  hands: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  moments: Schema.Array(RecapMomentSchema).check(Schema.isMaxLength(3)),
  span: Schema.Option(NightSpanSchema),
});

export type NightRecap = typeof NightRecapSchema.Type;

export const RECAP_MOMENTS = 3;

export const NO_RECAP: NightRecap = {
  biggestPot: Option.none(),
  hands: 0,
  moments: [],
  span: Option.none(),
};

const noRecap = Effect.succeed(NO_RECAP);

export const recapField = NightRecapSchema.pipe(
  Schema.withConstructorDefault(noRecap),
  Schema.withDecodingDefaultTypeKey(noRecap)
);

interface OpenHand {
  readonly events: readonly SeenTableEvent[];
  readonly hand: number;
  readonly players: ReadonlyMap<SeatIndex, PlayerId>;
  readonly startedAt: Millis;
}

export interface NightTally {
  readonly biggestPot: Option.Option<BiggestPot>;
  readonly gentle: readonly RecapMoment[];
  readonly hand: Option.Option<OpenHand>;
  readonly hands: number;
  readonly painful: readonly RecapMoment[];
  readonly seats: ReadonlyMap<SeatIndex, PlayerId>;
  readonly span: Option.Option<NightSpan>;
}

export const NO_TALLY: NightTally = {
  biggestPot: Option.none(),
  gentle: [],
  hand: Option.none(),
  hands: 0,
  painful: [],
  seats: new Map(),
  span: Option.none(),
};

const kindOrder = (moment: Moment) => MOMENT_KINDS.indexOf(moment._tag);

export const recapOrder = (left: RecapMoment, right: RecapMoment) =>
  right.moment.tier - left.moment.tier ||
  right.moment.pot - left.moment.pot ||
  left.hand - right.hand ||
  kindOrder(left.moment) - kindOrder(right.moment);

const recapMomentOf = (
  hand: OpenHand,
  story: HandStory,
  moment: Moment
): RecapMoment => ({
  boards: story.boards,
  hand: HandNumberSchema.make(hand.hand),
  moment,
  players: moment.seats.flatMap((seat) =>
    Option.match(Option.fromUndefinedOr(hand.players.get(seat)), {
      onNone: () => [],
      onSome: (player) => [{ player, seat, shown: story.shown[seat] ?? [] }],
    })
  ),
});

const best = (
  pool: readonly RecapMoment[],
  candidate: Option.Option<RecapMoment>
) =>
  Option.match(candidate, {
    onNone: () => pool,
    onSome: (found) =>
      [...pool, found].toSorted(recapOrder).slice(0, RECAP_MOMENTS),
  });

const closed = (tally: NightTally): NightTally =>
  Option.match(tally.hand, {
    onNone: () => tally,
    onSome: (hand) =>
      Option.match(storyOf(hand.events), {
        onNone: () => ({ ...tally, hand: Option.none() }),
        onSome: (story) => {
          const moments = momentsOf(hand.events);

          const pick = (painful: boolean) =>
            Option.fromUndefinedOr(
              moments.find((moment) => isPainful(moment) === painful)
            ).pipe(Option.map((moment) => recapMomentOf(hand, story, moment)));

          return {
            ...tally,
            gentle: best(tally.gentle, pick(false)),
            hand: Option.none(),
            painful: best(tally.painful, pick(true)),
          };
        },
      }),
  });

const withEvent = (tally: NightTally, event: SeenTableEvent): NightTally => ({
  ...tally,
  hand: tally.hand.pipe(
    Option.map((hand) => ({ ...hand, events: [...hand.events, event] }))
  ),
});

const takersOf = (hand: OpenHand) => {
  const won = new Map<PlayerId, number>();

  for (const event of hand.events) {
    if (Events.$is("PotAwarded")(event)) {
      for (const { amount, seat } of event.winners) {
        for (const player of Option.toArray(
          Option.fromUndefinedOr(hand.players.get(seat))
        )) {
          won.set(player, (won.get(player) ?? 0) + amount);
        }
      }
    }
  }

  return [...won]
    .toSorted(([, left], [, right]) => right - left)
    .map(([player]) => player);
};

const potOf = (hand: OpenHand) => {
  let pot = 0;

  for (const event of hand.events) {
    if (Events.$is("PotAwarded")(event)) {
      pot += event.amount;
    }
  }

  return pot;
};

const ended = (tally: NightTally, at: Millis): NightTally =>
  Option.match(tally.hand, {
    onNone: () => tally,
    onSome: (hand) => {
      const pot = potOf(hand);

      const bigger =
        pot > 0 &&
        Option.match(tally.biggestPot, {
          onNone: () => true,
          onSome: (biggest) => pot > biggest.pot,
        });

      return {
        ...tally,
        biggestPot: bigger
          ? Option.some({
              hand: HandNumberSchema.make(hand.hand),
              pot: ChipsSchema.make(pot),
              takers: takersOf(hand),
            })
          : tally.biggestPot,
        hands: tally.hands + 1,
        span: Option.some({
          from: Option.match(tally.span, {
            onNone: () => hand.startedAt,
            onSome: ({ from }) => from,
          }),
          to: at,
        }),
      };
    },
  });

const sat = (
  tally: NightTally,
  seat: SeatIndex,
  player: PlayerId
): NightTally => ({
  ...tally,
  seats: new Map([...tally.seats, [seat, player]]),
});

const stood = (tally: NightTally, seat: SeatIndex): NightTally => ({
  ...tally,
  seats: new Map([...tally.seats].filter(([sitting]) => sitting !== seat)),
});

const onTable = (
  tally: NightTally,
  event: SeenTableEvent,
  at: Millis
): NightTally =>
  Match.value(event).pipe(
    Match.tag("HandStarted", ({ handNumber }) => ({
      ...closed(tally),
      hand: Option.some({
        events: [event],
        hand: handNumber,
        players: tally.seats,
        startedAt: at,
      }),
    })),
    Match.tag("PlayerSat", ({ player, seat }) =>
      withEvent(
        { ...tally, seats: new Map([...tally.seats, [seat, player]]) },
        event
      )
    ),
    Match.tag("PlayerStood", ({ seat }) =>
      withEvent(
        {
          ...tally,
          seats: new Map(
            [...tally.seats].filter(([sitting]) => sitting !== seat)
          ),
        },
        event
      )
    ),
    Match.tag("HandEnded", () => ended(withEvent(tally, event), at)),
    Match.orElse(() => withEvent(tally, event))
  );

export const tallied = (tally: NightTally, event: SeenEvent): NightTally =>
  Match.value(event).pipe(
    Match.tag("Table", ({ at, event: table }) => onTable(tally, table, at)),
    Match.tag("BoughtIn", ({ player, seat }) => sat(tally, seat, player)),
    Match.tag("CashedOut", ({ seat }) => stood(tally, seat)),
    Match.tag("HandCancelled", () => ({ ...tally, hand: Option.none() })),
    Match.tag("RoomClosed", () => closed(tally)),
    Match.orElse(() => tally)
  );

const oneEachHand = (pool: readonly RecapMoment[]) => {
  const chosen: RecapMoment[] = [];

  for (const candidate of pool.toSorted(recapOrder)) {
    if (
      chosen.length < RECAP_MOMENTS &&
      !chosen.some(({ hand }) => hand === candidate.hand)
    ) {
      chosen.push(candidate);
    }
  }

  return chosen;
};

const momentsUnder = (tally: NightTally, callouts: MomentCallouts) =>
  Match.value(callouts).pipe(
    Match.when("Off", () => []),
    Match.when("SkipPainful", () => tally.gentle),
    Match.when("All", () => oneEachHand([...tally.gentle, ...tally.painful])),
    Match.exhaustive
  );

export const recapOf = (
  tally: NightTally,
  callouts: MomentCallouts
): NightRecap => {
  const done = closed(tally);

  return {
    biggestPot: done.biggestPot,
    hands: done.hands,
    moments: momentsUnder(done, callouts),
    span: done.span,
  };
};
