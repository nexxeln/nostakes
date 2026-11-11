import {
  BombPotStartSchema,
  EventSchema,
  Events,
  PlayerIdSchema,
  SeatIndexSchema,
} from "@nostakes/engine";
import type { Event, SeatIndex } from "@nostakes/engine";
import { Data, Option, Schema } from "effect";

import { RoomEvents, roomEventFields, sealFields } from "./events.js";
import type { Holder, RoomEvent } from "./events.js";
import { MillisSchema } from "./time.js";

export const AudienceSchema = Schema.TaggedUnion({
  Seated: { player: PlayerIdSchema, seat: SeatIndexSchema },
  Spectator: {},
  Unseated: { player: PlayerIdSchema },
});

export type Audience = typeof AudienceSchema.Type;

export const Audiences = Data.taggedEnum<Audience>();

const { cases } = EventSchema;

export const PublicHandStartedSchema = Schema.TaggedStruct("HandStarted", {
  bigBlindSeat: SeatIndexSchema,
  bombPot: Schema.optionalKey(BombPotStartSchema),
  button: SeatIndexSchema,
  dealtIn: Schema.Array(SeatIndexSchema),
  handNumber: Schema.Int,
  smallBlindSeat: SeatIndexSchema,
});

export const SeenTableEventSchema = Schema.Union([
  cases.AntePosted,
  cases.BlindPosted,
  cases.BountyPaid,
  cases.Called,
  cases.CardsShown,
  cases.Checked,
  cases.ChipsAdded,
  cases.Folded,
  cases.HandEnded,
  cases.HandMucked,
  PublicHandStartedSchema,
  cases.HandTabled,
  cases.HandsTabled,
  cases.HoleCardsDealt,
  cases.PlayerSat,
  cases.PlayerStood,
  cases.PotAwarded,
  cases.RabbitHunted,
  cases.RaisedTo,
  cases.RulesChanged,
  cases.RunsAgreed,
  cases.RunsChosen,
  cases.ShowdownReached,
  cases.ShowdownStarted,
  cases.SittingOutChanged,
  cases.StraddlePosted,
  cases.StreetDealt,
  cases.UncalledBetReturned,
]);

export type SeenTableEvent = typeof SeenTableEventSchema.Type;

export const SeenEventSchema = Schema.TaggedUnion({
  ...roomEventFields,
  HandSealed: sealFields,
  KnockAnswered: { at: MillisSchema },
  Knocked: { at: MillisSchema },
  Table: { at: MillisSchema, event: SeenTableEventSchema },
});

export type SeenEvent = typeof SeenEventSchema.Type;

export const SeenEvents = Data.taggedEnum<SeenEvent>();

const holdsSeat = (audience: Audience, seat: SeatIndex) =>
  Audiences.$is("Seated")(audience) && audience.seat === seat;

const seenTableEvent = (event: Event, audience: Audience): SeenTableEvent => {
  if (Events.$is("HandStarted")(event)) {
    const shown = {
      bigBlindSeat: event.bigBlindSeat,
      button: event.button,
      dealtIn: event.dealtIn,
      handNumber: event.handNumber,
      smallBlindSeat: event.smallBlindSeat,
    };

    return PublicHandStartedSchema.make(
      event.bombPot === undefined ? shown : { ...shown, bombPot: event.bombPot }
    );
  }

  if (Events.$is("HoleCardsDealt")(event) && !holdsSeat(audience, event.seat)) {
    return Events.HoleCardsDealt({ cards: [], seat: event.seat });
  }

  return event;
};

const holds = (audience: Audience, holder: Option.Option<Holder>) =>
  Option.match(holder, {
    onNone: () => true,
    onSome: ({ player, seat }) =>
      Audiences.$is("Seated")(audience) &&
      audience.seat === seat &&
      audience.player === player,
  });

export const redact = (event: RoomEvent, audience: Audience): SeenEvent => {
  if (RoomEvents.$is("Table")(event)) {
    return SeenEvents.Table({
      at: event.at,
      event: seenTableEvent(event.event, audience),
    });
  }

  if (RoomEvents.$is("HandSealed")(event)) {
    return SeenEvents.HandSealed({
      at: event.at,
      hand: event.hand,
      roots: event.roots,
      round: event.round,
      seats: event.seats,
    });
  }

  if (RoomEvents.$is("Knocked")(event)) {
    return SeenEvents.Knocked({ at: event.at });
  }

  if (RoomEvents.$is("KnockAnswered")(event)) {
    return SeenEvents.KnockAnswered({ at: event.at });
  }

  return RoomEvents.$is("CardsOpened")(event) && !holds(audience, event.holder)
    ? SeenEvents.CardsOpened({ ...event, openings: [] })
    : event;
};
