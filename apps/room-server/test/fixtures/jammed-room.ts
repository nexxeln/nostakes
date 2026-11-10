import { RoomCommands, SealedSeatsMoved } from "@nostakes/room";
import { Result } from "effect";

import type { HostedRoom } from "../../src/hosted-room.js";
import type { PokerTypes } from "../../src/poker-room.js";

export const jammable = (
  core: HostedRoom<PokerTypes>,
  jammed: () => boolean
): HostedRoom<PokerTypes> => ({
  ...core,
  decide: (state, command) =>
    jammed() &&
    (RoomCommands.$is("DealSealed")(command) ||
      RoomCommands.$is("Deal")(command))
      ? Result.fail(new SealedSeatsMoved({ dealt: [], sealed: [] }))
      : core.decide(state, command),
});
