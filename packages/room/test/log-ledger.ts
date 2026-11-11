import { Seats } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Match, Result } from "effect";

import { RoomStates, settlement } from "../src/index.js";
import type { RoomEvent, RoomState } from "../src/index.js";

export interface LogLedger {
  readonly bounties: number;
  readonly dealt: readonly number[];
  readonly moved: ReadonlyMap<PlayerId, number>;
  readonly players: ReadonlyMap<number, PlayerId>;
  readonly problems: readonly string[];
  readonly stacks: ReadonlyMap<number, number>;
}

export const EMPTY_LEDGER: LogLedger = {
  bounties: 0,
  dealt: [],
  moved: new Map(),
  players: new Map(),
  problems: [],
  stacks: new Map(),
};

const moving = (
  ledger: LogLedger,
  seat: number,
  change: number,
  why: string
): LogLedger => {
  const stack = (ledger.stacks.get(seat) ?? 0) + change;
  const player = ledger.players.get(seat);

  return {
    ...ledger,
    moved:
      player === undefined
        ? ledger.moved
        : new Map([
            ...ledger.moved,
            [player, (ledger.moved.get(player) ?? 0) + change],
          ]),
    problems: [
      ...ledger.problems,
      ...(stack < 0 ? [`${why} takes seat ${seat} to ${stack}`] : []),
      ...(player === undefined ? [`${why} moves an empty seat ${seat}`] : []),
    ],
    stacks: new Map([...ledger.stacks, [seat, stack]]),
  };
};

const leaving = (ledger: LogLedger, seat: number, amount: number) => ({
  ...ledger,
  players: new Map([...ledger.players].filter(([held]) => held !== seat)),
  problems: [
    ...ledger.problems,
    ...((ledger.stacks.get(seat) ?? 0) === amount
      ? []
      : [
          `seat ${seat} cashed out ${amount} holding ${ledger.stacks.get(seat)}`,
        ]),
  ],
  stacks: new Map([...ledger.stacks].filter(([held]) => held !== seat)),
});

const bountyPaid = (
  ledger: LogLedger,
  collector: number,
  payers: readonly { readonly amount: number; readonly seat: number }[]
): LogLedger => {
  let next: LogLedger = { ...ledger, bounties: ledger.bounties + 1 };

  for (const payer of payers) {
    next = moving(
      {
        ...next,
        problems: [
          ...next.problems,
          ...(ledger.dealt.includes(payer.seat) && payer.seat !== collector
            ? []
            : [`seat ${payer.seat} paid a bounty for a hand it was not in`]),
        ],
      },
      payer.seat,
      0 - payer.amount,
      "a bounty"
    );
    next = moving(next, collector, payer.amount, "a bounty");
  }

  return {
    ...next,
    problems: [
      ...next.problems,
      ...(ledger.dealt.includes(collector) && payers.length > 0
        ? []
        : [`seat ${collector} collected a bounty it was not owed`]),
    ],
  };
};

export const followed = (ledger: LogLedger, event: RoomEvent): LogLedger =>
  Match.value(event).pipe(
    Match.tag("BoughtIn", ({ amount, player, seat }) => ({
      ...ledger,
      players: new Map([...ledger.players, [seat, player]]),
      stacks: new Map([
        ...ledger.stacks,
        [seat, (ledger.stacks.get(seat) ?? 0) + amount],
      ]),
    })),
    Match.tag("CashedOut", ({ amount, seat }) => leaving(ledger, seat, amount)),
    Match.tag("HandCancelled", ({ restored }) => {
      let next = ledger;

      for (const { seat, stack } of restored) {
        next = moving(
          next,
          seat,
          stack - (next.stacks.get(seat) ?? 0),
          "a cancelled hand"
        );
      }

      return next;
    }),
    Match.tag("Table", ({ event: table }) =>
      Match.value(table).pipe(
        Match.tag("HandStarted", ({ dealtIn }) => ({
          ...ledger,
          dealt: dealtIn,
        })),
        Match.tag("PlayerStood", ({ seat, stack }) =>
          leaving(ledger, seat, stack)
        ),
        Match.tag(
          "AntePosted",
          "BlindPosted",
          "StraddlePosted",
          "Called",
          ({ amount, seat }) => moving(ledger, seat, 0 - amount, table._tag)
        ),
        Match.tag("RaisedTo", ({ added, seat }) =>
          moving(ledger, seat, 0 - added, table._tag)
        ),
        Match.tag("UncalledBetReturned", ({ amount, seat }) =>
          moving(ledger, seat, amount, table._tag)
        ),
        Match.tag("PotAwarded", ({ winners }) => {
          let next = ledger;

          for (const winner of winners) {
            next = moving(next, winner.seat, winner.amount, table._tag);
          }

          return next;
        }),
        Match.tag("BountyPaid", ({ payers, seat }) =>
          bountyPaid(ledger, seat, payers)
        ),
        Match.orElse(() => ledger)
      )
    ),
    Match.orElse(() => ledger)
  );

export const stackProblems = (
  ledger: LogLedger,
  state: RoomState
): readonly string[] =>
  RoomStates.$match(state, {
    Closed: () => [],
    Open: (open) =>
      open.table.seats.flatMap((seat, index) => {
        const held = Seats.$is("Occupied")(seat) ? seat.stack : 0;
        const logged = ledger.stacks.get(index) ?? 0;

        return held === logged
          ? []
          : [`seat ${index} holds ${held}, the log moved ${logged} there`];
      }),
  });

export const netProblems = (
  ledger: LogLedger,
  state: RoomState
): readonly string[] =>
  Result.match(settlement(state), {
    onFailure: () => [],
    onSuccess: ({ balances }) =>
      balances.flatMap((row) =>
        Number(row.net) === (ledger.moved.get(row.player) ?? 0)
          ? []
          : [
              `${row.player} nets ${row.net}, the hands and bounties moved ${ledger.moved.get(row.player) ?? 0}`,
            ]
      ),
  });
