import type { LegalActions, Action, Chips } from "@nostakes/engine";
import { Actions, ChipsSchema } from "@nostakes/engine";
import { RoomViews } from "@nostakes/room";
import type { RoomView } from "@nostakes/room";
import { Option } from "effect";

import { Screens } from "./model.js";
import type { InRoom, Model, SavedPass } from "./model.js";

export type OpenView = Extract<RoomView, { readonly _tag: "Open" }>;

export type ClosedView = Extract<RoomView, { readonly _tag: "Closed" }>;

export const roomOf = (model: Model): Option.Option<InRoom> =>
  Screens.guards.Room(model.screen)
    ? Option.some(model.screen.room)
    : Option.none();

export const connectionTarget = (model: Model): Option.Option<SavedPass> =>
  roomOf(model).pipe(Option.map(({ code, player }) => ({ code, player })));

export const viewOf = (room: InRoom): Option.Option<RoomView> =>
  room.link.pipe(Option.flatMap(({ view }) => view));

export const openViewOf = (room: InRoom): Option.Option<OpenView> =>
  viewOf(room).pipe(Option.filter(RoomViews.$is("Open")));

export const isLive = (room: InRoom) =>
  Option.exists(room.link, ({ phase }) => phase === "Live");

export const isActing = (room: InRoom) =>
  room.pending.some(({ acting }) => acting);

export const legalOf = (room: InRoom): Option.Option<LegalActions> =>
  openViewOf(room).pipe(Option.flatMap(({ legal }) => legal));

export const isLegal = (legal: LegalActions, action: Action) =>
  Actions.$match(action, {
    Call: () => Option.isSome(legal.call),
    Check: () => legal.canCheck,
    Fold: () => true,
    RaiseTo: ({ to }) =>
      Option.exists(
        legal.raise,
        ({ maxTo, minTo }) => to >= minTo && to <= maxTo
      ),
  });

export interface RaiseControl {
  readonly minTo: Chips;
  readonly maxTo: Chips;
  readonly to: Chips;
  readonly opens: boolean;
}

export interface BettingControls {
  readonly fold: boolean;
  readonly check: boolean;
  readonly call: Option.Option<Chips>;
  readonly raise: Option.Option<RaiseControl>;
}

const draftedRaise = (draft: string, minTo: Chips, maxTo: Chips) => {
  const typed = Number(draft);

  return draft.trim().length > 0 &&
    Number.isSafeInteger(typed) &&
    typed >= minTo &&
    typed <= maxTo
    ? ChipsSchema.make(typed)
    : minTo;
};

export const bettingControls = (room: InRoom): Option.Option<BettingControls> =>
  legalOf(room).pipe(
    Option.filter(() => isLive(room) && !isActing(room)),
    Option.map((legal) => ({
      call: legal.call,
      check: legal.canCheck,
      fold: true,
      raise: legal.raise.pipe(
        Option.filter(({ maxTo, minTo }) => minTo <= maxTo),
        Option.map(({ maxTo, minTo }) => ({
          maxTo,
          minTo,
          opens: Option.isNone(legal.call),
          to: draftedRaise(room.drafts.raiseTo, minTo, maxTo),
        }))
      ),
    }))
  );

export const clockRunning = (room: InRoom) =>
  Option.exists(
    openViewOf(room),
    ({ clocks }) =>
      Option.isSome(clocks.turn) ||
      Option.isSome(clocks.showdown) ||
      Option.isSome(clocks.runChoice) ||
      Option.isSome(clocks.nextDeal)
  );

export const secondsLeft = (room: InRoom, now: number, remainingMs: number) => {
  const elapsed = Option.match(room.link, {
    onNone: () => 0,
    onSome: ({ receivedAt }) => Math.max(0, now - receivedAt),
  });

  return Math.ceil(Math.max(0, remainingMs - elapsed) / 1000);
};
