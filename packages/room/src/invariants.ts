import { TableStates, invariants as tableInvariants } from "@nostakes/engine";
import type { PlayerId, Violation } from "@nostakes/engine";
import { balances } from "@nostakes/ledger";
import { Option } from "effect";

import { bombPotsOn } from "./dealing.js";
import { MOST_KNOCKS, MOST_WAITING } from "./door.js";
import { MOST_PEOPLE } from "./members.js";
import { chipsOnTable, allEntries } from "./money.js";
import { sameName } from "./names.js";
import { sameTableRules } from "./rules.js";
import { seatsTakenFrom } from "./seats.js";
import {
  DecisionClocks,
  RoomStates,
  SEATS,
  isMember,
  isRemoved,
  namedPeople,
  occupantAt,
  seatOf,
  waitingKnocks,
} from "./state.js";
import type { Closed, Entries, Open, RoomState } from "./state.js";

const violation = (invariant: string, detail: string): Violation => ({
  detail,
  invariant,
});

const check = (holds: boolean, invariant: string, detail: () => string) =>
  holds ? [] : [violation(invariant, detail())];

const hasDuplicates = (values: readonly (number | string)[]) =>
  new Set(values).size !== values.length;

const ledgerTotal = (entries: Entries) => {
  let total = 0;

  for (const balance of balances(allEntries(entries))) {
    total += balance.boughtIn - balance.cashedOut;
  }

  return total;
};

const seatedPlayers = (state: Open) =>
  SEATS.flatMap((seat) =>
    Option.match(occupantAt(state.table, seat), {
      onNone: () => [],
      onSome: (occupant) => [occupant.player],
    })
  );

const isSeated = (state: Open, player: PlayerId) =>
  Option.isSome(seatOf(state, player));

const clashingNames = (state: Open) =>
  namedPeople(state)
    .filter(({ name, player }) =>
      namedPeople(state).some(
        (other) => other.player !== player && sameName(other.name, name)
      )
    )
    .map(({ player }) => player);

const peopleViolations = (state: Open) => [
  ...check(
    !hasDuplicates(state.members.map((member) => member.player)),
    "MembersAreDistinct",
    () => state.members.map((member) => member.player).join(",")
  ),
  ...check(
    state.members.length === 0 || isMember(state, state.host),
    "HostIsAMember",
    () => `${state.host} hosts but is not a member`
  ),
  ...seatedPlayers(state).flatMap((player) =>
    check(
      isMember(state, player) || state.queued.leaving.includes(player),
      "SeatedPlayersAreMembers",
      () => `${player} holds a seat without being a member or leaving`
    )
  ),
  ...state.departed.flatMap(({ player }) =>
    check(
      !isMember(state, player),
      "DepartedAreNotMembers",
      () => `${player} is both a member and departed`
    )
  ),
  ...check(
    !hasDuplicates(state.departed.map((member) => member.player)),
    "DepartedAreDistinct",
    () => state.departed.map((member) => member.player).join(",")
  ),
  ...state.removed.flatMap(({ player }) =>
    check(
      !isMember(state, player) &&
        !state.departed.some((member) => member.player === player),
      "RemovedAreGone",
      () => `${player} was removed but is still a member or departed`
    )
  ),
  ...check(
    state.members.length + state.departed.length <= MOST_PEOPLE,
    "PeopleWithinTheRoom",
    () =>
      `${state.members.length} members and ${state.departed.length} who left, more than ${MOST_PEOPLE}`
  ),
  ...check(
    !hasDuplicates(state.removed.map((member) => member.player)),
    "RemovedAreDistinct",
    () => state.removed.map((member) => member.player).join(",")
  ),
  ...check(clashingNames(state).length === 0, "NamesAreDistinct", () =>
    clashingNames(state).join(",")
  ),
];

const cameIn = (state: Open | Closed, player: PlayerId) =>
  isMember(state, player) ||
  isRemoved(state, player) ||
  state.entries.has(player) ||
  state.departed.some((member) => member.player === player);

const knockViolations = (state: Open | Closed) => [
  ...check(
    waitingKnocks(state).length <= MOST_WAITING,
    "KnocksWaitWithinTheDoor",
    () => `${waitingKnocks(state).length} waiting, more than ${MOST_WAITING}`
  ),
  ...check(
    state.knocks.length <= MOST_KNOCKS,
    "KnocksWithinTheNight",
    () => `${state.knocks.length} knocks, more than ${MOST_KNOCKS}`
  ),
  ...check(
    !hasDuplicates(state.knocks.map(({ player }) => player)),
    "KnockersAreDistinct",
    () => state.knocks.map(({ player }) => player).join(",")
  ),
  ...state.knocks.flatMap(({ outcome, player }) =>
    check(
      Option.contains(outcome, "LetIn") || !cameIn(state, player),
      "KnockersWaitOutside",
      () =>
        `${player} came in with a knock ${Option.getOrElse(outcome, () => "still waiting")}`
    )
  ),
];

const requestViolations = (state: Open) => [
  ...check(
    seatsTakenFrom(state, state.settings.seats).length === 0,
    "SeatsWithinTheTable",
    () =>
      `seats ${seatsTakenFrom(state, state.settings.seats).join(",")} are taken or asked for at a table of ${state.settings.seats}`
  ),
  ...check(
    !hasDuplicates(state.requests.seats.map((request) => request.player)) &&
      !hasDuplicates(state.requests.seats.map((request) => request.seat)),
    "OneSeatRequestEach",
    () => JSON.stringify(state.requests.seats)
  ),
  ...state.requests.seats.flatMap((request) =>
    check(
      isMember(state, request.player) &&
        !isSeated(state, request.player) &&
        Option.isNone(occupantAt(state.table, request.seat)),
      "SeatRequestsWaitForAnEmptySeat",
      () => `${request.player} asks for seat ${request.seat}`
    )
  ),
  ...check(
    !hasDuplicates(state.requests.chips.map((request) => request.player)),
    "OneChipRequestEach",
    () => JSON.stringify(state.requests.chips)
  ),
  ...state.requests.chips.flatMap((request) =>
    check(
      isSeated(state, request.player),
      "ChipRequestsComeFromSeats",
      () => `${request.player} asks for chips without a seat`
    )
  ),
];

const queueViolations = (state: Open) => [
  ...[
    ...state.queued.leaving,
    ...state.queued.chips.map((queued) => queued.player),
  ].flatMap((player) =>
    check(
      isSeated(state, player),
      "QueuedForASeat",
      () => `${player} has queued items without a seat`
    )
  ),
  ...check(!hasDuplicates(state.queued.leaving), "LeavesOnce", () =>
    state.queued.leaving.join(",")
  ),
];

const markViolations = (state: Open) => [
  ...state.posters.flatMap((player) =>
    check(
      isSeated(state, player),
      "PostersAreSeated",
      () => `${player} chose to post without a seat`
    )
  ),
  ...state.straddlers.flatMap((player) =>
    check(
      isSeated(state, player),
      "StraddlersAreSeated",
      () => `${player} declared a straddle without a seat`
    )
  ),
  ...check(
    !hasDuplicates(state.straddlers) && !hasDuplicates(state.away),
    "MarksAreDistinct",
    () => `${state.straddlers.join(",")} / ${state.away.join(",")}`
  ),
  ...state.away.flatMap((seat) =>
    check(
      Option.exists(
        occupantAt(state.table, seat),
        (occupant) => occupant.sittingOut
      ),
      "AwaySeatsSitOut",
      () => `seat ${seat} is away but not sitting out`
    )
  ),
];

const clockViolations = (state: Open) => [
  ...check(
    !state.dealCalled || !TableStates.$is("InHand")(state.table),
    "CalledHandsWaitBetweenHands",
    () => "a hand is called while one is in progress"
  ),
  ...check(
    !state.bombCalled || bombPotsOn(state),
    "BombPotsCalledOnlyWhileOn",
    () => "a bomb pot is called while the rules have bomb pots off"
  ),
  ...[...state.clocks.bankSpent.values()].flatMap((spent) =>
    check(
      Number.isSafeInteger(spent) && spent >= 0,
      "BankSpentInWholeSeconds",
      () => `${spent}`
    )
  ),
  ...Option.match(state.clocks.decision, {
    onNone: () => [],
    onSome: (clock) => [
      ...check(
        TableStates.$is("InHand")(state.table),
        "ClocksTimeHands",
        () => "a decision clock runs between hands"
      ),
      ...DecisionClocks.$match(clock, {
        RunChoice: () => [],
        Showdown: ({ seat }) =>
          check(
            TableStates.$is("InHand")(state.table) &&
              state.table.hand.players.some((player) => player.seat === seat),
            "ShowdownClockOnADealtSeat",
            () => `the showdown clock runs on seat ${seat}, which holds no hand`
          ),
        Turn: ({ player, seat }) =>
          check(
            Option.exists(
              occupantAt(state.table, seat),
              (occupant) => occupant.player === player
            ),
            "TurnClockOnItsSeat",
            () => `the clock for ${player} runs on seat ${seat}`
          ),
      }),
    ],
  }),
];

const openViolations = (state: Open): readonly Violation[] => [
  ...tableInvariants(state.table),
  ...check(
    ledgerTotal(state.entries) === chipsOnTable(state),
    "LedgerMatchesTable",
    () =>
      `${ledgerTotal(state.entries)} bought in net of cash-outs, ${chipsOnTable(state)} on the table`
  ),
  ...check(
    sameTableRules(state.settings.table, state.table.config),
    "SettingsMatchTable",
    () => "the room's table rules differ from the engine's"
  ),
  ...peopleViolations(state),
  ...knockViolations(state),
  ...requestViolations(state),
  ...queueViolations(state),
  ...markViolations(state),
  ...clockViolations(state),
];

const closedViolations = (state: Closed): readonly Violation[] => {
  const nets = state.settlement.balances.reduce(
    (total, balance) => total + balance.net,
    0
  );

  const owed = new Map<PlayerId, number>(
    state.settlement.balances.map((balance) => [balance.player, balance.net])
  );

  for (const { amount, from, to } of state.settlement.transfers) {
    owed.set(from, (owed.get(from) ?? 0) + amount);
    owed.set(to, (owed.get(to) ?? 0) - amount);
  }

  return [
    ...knockViolations(state),
    ...check(nets === 0, "SettlementBalances", () => `nets sum to ${nets}`),
    ...check(
      [...owed.values()].every((left) => left === 0),
      "TransfersSettleEveryone",
      () => JSON.stringify([...owed])
    ),
    ...check(
      ledgerTotal(state.entries) === 0,
      "EveryChipCashedOut",
      () => `${ledgerTotal(state.entries)} chips never cashed out`
    ),
  ];
};

export const invariants = (state: RoomState): readonly Violation[] =>
  RoomStates.$match(state, {
    Closed: closedViolations,
    Open: openViolations,
  });
