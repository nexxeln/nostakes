import type { PlayerId } from "@nostakes/protocol";
import { REACTIONS, RoomSignalSchema } from "@nostakes/room";
import type { RoomSignal } from "@nostakes/room";
import { Option } from "effect";

import type { OpenView, Random } from "./bot.js";

export const SIGNAL_PERCENT = 12;

const PEEK_WITH_CARDS_PERCENT = 70;

const PEEK_WITHOUT_CARDS_PERCENT = 20;

const THROW_PERCENT = 60;

const THROW_AT_REFUSED_PERCENT = 30;

export interface SignalTally {
  sent: number;
  peeksWithoutCards: number;
  throws: number;
  throwsTheRoomRefuses: number;
}

export const emptyTally = (): SignalTally => ({
  peeksWithoutCards: 0,
  sent: 0,
  throws: 0,
  throwsTheRoomRefuses: 0,
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

const seatedOthers = (open: OpenView, player: PlayerId) =>
  open.seats.flatMap(({ occupant }) =>
    Option.match(occupant, {
      onNone: () => [],
      onSome: (seated) =>
        seated.player !== player && !seated.leavingRoom ? [seated.player] : [],
    })
  );

const refusedTargets = (open: OpenView, player: PlayerId) => {
  const seated = new Set(
    open.seats.flatMap(({ occupant }) =>
      Option.match(occupant, {
        onNone: () => [],
        onSome: (held) => [held.player],
      })
    )
  );

  return [
    player,
    ...open.departed.map((gone) => gone.player),
    ...open.members
      .map((member) => member.player)
      .filter((member) => !seated.has(member)),
  ];
};

const pickOne = <A>(random: Random, from: readonly A[]): Option.Option<A> =>
  Option.fromUndefinedOr(from[random.below(Math.max(1, from.length))]);

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

      const reaction = REACTIONS[random.below(REACTIONS.length)] ?? "Clap";

      if (!random.chance(THROW_PERCENT)) {
        return RoomSignalSchema.cases.Reaction.make({ reaction });
      }

      const refused = random.chance(THROW_AT_REFUSED_PERCENT);

      const at = pickOne(
        random,
        refused ? refusedTargets(open, player) : seatedOthers(open, player)
      );

      tally.throws += Option.isSome(at) ? 1 : 0;
      tally.throwsTheRoomRefuses += refused && Option.isSome(at) ? 1 : 0;

      return RoomSignalSchema.cases.Reaction.make({ at, reaction });
    },
    tally,
  };
};

export const describeSignal = (from: PlayerId, signal: RoomSignal) =>
  `${from} ${RoomSignalSchema.match(signal, {
    Peeking: ({ looking }) => (looking ? "peeking" : "done peeking"),
    Reaction: ({ at, reaction }) =>
      Option.match(at, {
        onNone: () => `reacting ${reaction}`,
        onSome: (target) => `throwing ${reaction} at ${target}`,
      }),
  })}`;
