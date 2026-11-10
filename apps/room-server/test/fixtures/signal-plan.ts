import type { PlayerId } from "@nostakes/protocol";
import { REACTIONS, RoomSignalSchema } from "@nostakes/room";
import type { RoomSignal } from "@nostakes/room";
import { Option } from "effect";

import type { OpenView, Random } from "./bot.js";

export const SIGNAL_PERCENT = 12;

const PEEK_WITH_CARDS_PERCENT = 70;

const PEEK_WITHOUT_CARDS_PERCENT = 20;

export interface SignalTally {
  sent: number;
  peeksWithoutCards: number;
}

export const emptyTally = (): SignalTally => ({
  peeksWithoutCards: 0,
  sent: 0,
});

export const signalSeedFor = (index: number, code: string) =>
  1_000_003 * (index + 1) + (code.codePointAt(0) ?? 0);

const holdsCards = (open: OpenView, player: PlayerId) =>
  open.holeCards.length > 0 &&
  open.hand.pipe(
    Option.exists((hand) =>
      hand.players.some(
        (dealt) =>
          dealt.player === player && dealt.status !== "Folded" && !dealt.mucked
      )
    )
  );

export interface SignalPlanner {
  readonly tally: SignalTally;
  readonly due: () => boolean;
  readonly next: (open: OpenView) => RoomSignal;
}

export const signalPlanner = (
  random: Random,
  player: PlayerId
): SignalPlanner => {
  const tally = emptyTally();
  let peeking = false;

  const peek = (looking: boolean, holding: boolean) => {
    peeking = looking;
    tally.peeksWithoutCards += holding ? 0 : 1;

    return RoomSignalSchema.cases.Peeking.make({ looking });
  };

  return {
    due: () => random.chance(SIGNAL_PERCENT),
    next: (open) => {
      const holding = holdsCards(open, player);

      tally.sent += 1;

      if (holding && random.chance(PEEK_WITH_CARDS_PERCENT)) {
        return peek(!peeking, holding);
      }

      if (random.chance(PEEK_WITHOUT_CARDS_PERCENT)) {
        return peek(true, holding);
      }

      return RoomSignalSchema.cases.Reaction.make({
        reaction: REACTIONS[random.below(REACTIONS.length)] ?? "Clap",
      });
    },
    tally,
  };
};

export const describeSignal = (from: PlayerId, signal: RoomSignal) =>
  `${from} ${RoomSignalSchema.match(signal, {
    Peeking: ({ looking }) => (looking ? "peeking" : "done peeking"),
    Reaction: ({ reaction }) => `reacting ${reaction}`,
  })}`;
