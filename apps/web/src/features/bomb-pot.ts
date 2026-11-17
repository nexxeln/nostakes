import { BombPots } from "@nostakes/engine";
import { Option } from "effect";

import type { OpenView } from "./room.js";

export const bombPotName = (view: OpenView) =>
  BombPots.$is("BombPots")(view.settings.table.bombPot) &&
  view.settings.table.bombPot.boardCount === 2
    ? "Double-board bomb pot"
    : "Bomb pot";

export const bombPotLine = (view: OpenView): Option.Option<string> =>
  BombPots.$match(view.settings.table.bombPot, {
    BombPots: ({ ante }) =>
      view.bombPot.next && Option.isNone(view.hand)
        ? Option.some(`${bombPotName(view)} next hand. Everyone antes ${ante}.`)
        : Option.none(),
    NoBombPots: () => Option.none(),
  });

export const mayCallBombPot = (view: OpenView) =>
  BombPots.$is("BombPots")(view.settings.table.bombPot);
