import { Result } from "effect";

import { inSequence } from "./batch.js";
import { cancelling, closingSteps } from "./closing.js";
import { evolveAll } from "./evolve.js";
import { RoomStates } from "./state.js";
import type { RoomState } from "./state.js";
import { latest } from "./time.js";
import type { Millis } from "./time.js";
import { viewFor } from "./views.js";
import type { Audience, RoomView } from "./views.js";

export const standingsOf = (state: RoomState, at: Millis): RoomState =>
  RoomStates.$match(state, {
    Closed: (closed): RoomState => closed,
    Open: (open): RoomState => {
      const when = latest(at, open.now);

      return Result.match(
        inSequence(open, [cancelling(when), ...closingSteps(open, when)]),
        {
          onFailure: (): RoomState => open,
          onSuccess: (events) => evolveAll(open, events),
        }
      );
    },
  });

export const standingsView = (
  state: RoomState,
  audience: Audience,
  at: Millis
): RoomView => viewFor(standingsOf(state, at), audience, at);
