import { EpochMillisSchema, roundToSeal } from "@nostakes/shuffle";

import {
  Actors,
  Deadlines,
  RoomCommands,
  SealedDealSources,
  millis,
} from "../src/index.js";
import type { Deadline, RoomCommand } from "../src/index.js";
import { bytesFrom, drand } from "./fixtures.js";

export const sealAt = (at: number, seed: number, round?: number) =>
  RoomCommands.SealHand({
    at: millis(at),
    by: Actors.Server(),
    decks: [bytesFrom(seed), bytesFrom(seed + 1)],
    round: round ?? roundToSeal(drand.chain, EpochMillisSchema.make(at)),
    secret: bytesFrom(seed + 2, 32),
  });

export const dealFromBeacon = (at: number, round: number) =>
  RoomCommands.DealSealed({
    at: millis(at),
    by: Actors.Server(),
    source: SealedDealSources.FromBeacon({
      round,
      signature: drand.sign(round),
    }),
  });

export const serverAnswer = (deadline: Deadline, seed: number): RoomCommand =>
  Deadlines.$match(deadline, {
    DealDue: ({ at }) =>
      RoomCommands.Deal({
        at,
        by: Actors.Server(),
        shuffleBytes: bytesFrom(seed),
      }),
    RunChoiceClock: ({ at }) =>
      RoomCommands.ExpireClock({ at, by: Actors.Server(), deadline: at }),
    SealDue: ({ at }) => sealAt(at, seed),
    SealedDealDue: ({ at, round }) => dealFromBeacon(at, round),
    ShowdownClock: ({ at }) =>
      RoomCommands.ExpireClock({ at, by: Actors.Server(), deadline: at }),
    TurnClock: ({ at }) =>
      RoomCommands.ExpireClock({ at, by: Actors.Server(), deadline: at }),
  });
