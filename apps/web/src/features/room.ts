import type { LegalActions, Action } from "@nostakes/engine";
import { Actions } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
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

export const isYou = (view: RoomView, player: PlayerId) =>
  Option.contains(view.you, player);

export const viewOf = (room: InRoom): Option.Option<RoomView> =>
  room.shown.pipe(Option.map(({ view }) => view));

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

export const clockRunning = (room: InRoom) =>
  Option.exists(
    openViewOf(room),
    ({ clocks }) =>
      Option.isSome(clocks.turn) ||
      Option.isSome(clocks.showdown) ||
      Option.isSome(clocks.runChoice) ||
      Option.isSome(clocks.nextDeal)
  );

export const settlementText = (view: ClosedView) => {
  const name = (player: string) =>
    view.members.find((member) => member.player === player)?.name ?? "Someone";

  const nets = view.settlement.balances
    .toSorted((left, right) => right.net - left.net)
    .map(({ net, player }) => `${name(player)} ${net > 0 ? "+" : ""}${net}`);

  const transfers = view.settlement.transfers.map(
    ({ amount, from, to }) => `${name(from)} pays ${name(to)} ${amount}`
  );

  return [
    `nostakes ${view.code}`,
    ...nets,
    "",
    ...(transfers.length === 0 ? ["Everyone is square."] : transfers),
  ].join("\n");
};
