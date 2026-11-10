import { Option } from "effect";

import { isYou, nameOf } from "./room.js";
import type { OpenView } from "./room.js";

export const STUCK_LINE =
  "The table is stuck and cannot go on. Anyone here can end the night and settle up.";

export const stuckLine = (view: OpenView): Option.Option<string> =>
  Option.isSome(view.stalled) ? Option.some(STUCK_LINE) : Option.none();

export const serverNowOf = (
  clockSamples: readonly number[],
  now: number
): number =>
  clockSamples.length === 0 ? now : now + Math.max(...clockSamples);

export const takeOverLine = (
  view: OpenView,
  serverNow: number
): Option.Option<string> =>
  view.hostAway.pipe(
    Option.filter(
      ({ claimableAt }) =>
        serverNow >= claimableAt &&
        Option.isSome(view.you) &&
        !isYou(view, view.host)
    ),
    Option.map(
      () =>
        `${nameOf(view, view.host)} has been gone for two minutes. Anyone here can take over as host.`
    )
  );
