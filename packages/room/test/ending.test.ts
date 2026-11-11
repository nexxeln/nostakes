import { describe, expect, it } from "@effect/vitest";
import {
  Events,
  PendingDecisions,
  PlayerIdSchema,
  Seats,
  TableStates,
  pendingDecisions,
} from "@nostakes/engine";
import type { PlayerId, SeatIndex } from "@nostakes/engine";
import { Option, Result } from "effect";

import {
  Actors,
  Deadlines,
  HOST_CLAIM_AFTER_SECONDS,
  RoomCommands,
  RoomEvents,
  SealedSeatsMoved,
  decide,
  evolveAllWithoutRecap,
  millis,
  nextDeadline,
  replayWithoutRecap,
} from "../src/index.js";
import type {
  Deadline,
  Decision,
  Open,
  RoomCommand,
  RoomEvent,
  RoomEventOf,
  RoomLog,
  RoomSettings,
  RoomState,
} from "../src/index.js";
import { serverAnswer } from "./beacon.js";
import { isOpen } from "./observers.js";
import { playSession, session } from "./sessions.js";
import type { Played } from "./sessions.js";

const ENDING_LIMIT = 400;

const SAMPLED_STATES = 14;

const CHECKED_TIMEOUT_MS = 120_000;

const server = Actors.Server();

const member = (player: PlayerId) => Actors.Member({ player });

const closer = PlayerIdSchema.make("closer");

type Decide = (state: RoomState, command: RoomCommand) => Decision;

interface Night {
  readonly log: RoomLog;
  readonly state: RoomState;
}

interface Ended extends Night {
  readonly problems: readonly string[];
}

const playerAt = (state: Open, seat: SeatIndex) =>
  Option.fromUndefinedOr(state.table.seats[seat]).pipe(
    Option.filter(Seats.$is("Occupied")),
    Option.map(({ player }) => player)
  );

const waitingOn = (state: Open): Option.Option<PlayerId> =>
  PendingDecisions.$match(pendingDecisions(state.table), {
    Bet: ({ legal }) => playerAt(state, legal.seat),
    ChooseRuns: ({ seats }) =>
      Option.flatMap(Option.fromUndefinedOr(seats[0]), (seat) =>
        playerAt(state, seat)
      ),
    Nothing: () => Option.none(),
    Show: ({ choices }) => playerAt(state, choices.seat),
  });

const isStalled = (state: Open) => Option.isSome(state.stalled);

const answer = (deadline: Deadline, now: number, seed: number): RoomCommand => {
  const at = millis(Math.max(now, deadline.at));

  const expire = (clock: Deadline) =>
    RoomCommands.ExpireClock({ at, by: server, deadline: clock.at });

  return Deadlines.$match(deadline, {
    DealDue: () => serverAnswer(Deadlines.DealDue({ at }), seed),
    QueueDue: () => serverAnswer(Deadlines.QueueDue({ at }), seed),
    QuietDue: () => serverAnswer(Deadlines.QuietDue({ at }), seed),
    RunChoiceClock: expire,
    SealDue: () => serverAnswer(Deadlines.SealDue({ at }), seed),
    SealedDealDue: ({ round }) =>
      serverAnswer(Deadlines.SealedDealDue({ at, round }), seed),
    ShowdownClock: expire,
    TurnClock: expire,
  });
};

const returning = (state: Open, without?: PlayerId) =>
  state.settings.locked
    ? state.departed.find(({ player }) => player !== without)
    : undefined;

const nextStep = (state: Open, now: number, seed: number): RoomCommand => {
  const at = millis(now);

  if (state.members.length === 0) {
    const back = returning(state);

    return RoomCommands.Join({
      at,
      avatar: "",
      by: member(back?.player ?? closer),
      name: back?.name ?? "late",
    });
  }

  if (!state.queued.close || isStalled(state)) {
    return RoomCommands.CloseRoom({ at, by: member(state.host) });
  }

  return Option.match(nextDeadline(state), {
    onNone: () =>
      Option.match(waitingOn(state), {
        onNone: () => RoomCommands.RunQueue({ at, by: server }),
        onSome: (player) =>
          RoomCommands.ActForSeat({ at, by: member(state.host), player }),
      }),
    onSome: (deadline) => answer(deadline, now, seed),
  });
};

const endNight = (start: Night, decideWith: Decide): Ended => {
  const log: [RoomLog[0], ...RoomEvent[]] = [...start.log];
  const problems: string[] = [];
  let { state } = start;
  let now = isOpen(state) ? state.now : 0;

  for (let step = 0; step < ENDING_LIMIT && isOpen(state); step += 1) {
    const command = nextStep(state, now, step);
    const decision = decideWith(state, command);

    now = Math.max(now, command.at);

    if (Result.isSuccess(decision)) {
      log.push(...decision.success);
      state = evolveAllWithoutRecap(state, decision.success);
    } else if (
      Actors.$is("Server")(command.by) &&
      !RoomCommands.$is("RunQueue")(command)
    ) {
      const deadline = Option.getOrThrow(nextDeadline(state));

      const noted = decideWith(
        state,
        RoomCommands.NoteStall({ at: millis(now), by: server, deadline })
      );

      log.push(...Result.getOrElse(noted, () => []));
      state = evolveAllWithoutRecap(
        state,
        Result.getOrElse(noted, () => [])
      );
    } else {
      problems.push(
        `${command._tag} was refused with ${decision.failure._tag} while ending the night`
      );
      break;
    }
  }

  if (isOpen(state)) {
    problems.push(`the room was still open after ${ENDING_LIMIT} commands`);
  }

  return { log, problems, state };
};

const applied = (night: Night, command: RoomCommand): Night => {
  const events = Result.getOrElse(decide(night.state, command), () => []);

  return {
    log: [...night.log, ...events],
    state: evolveAllWithoutRecap(night.state, events),
  };
};

interface TakenOver {
  readonly night: Night;
  readonly standIn: PlayerId;
}

const hostVanishes = (night: Night): Option.Option<TakenOver> => {
  const { state } = night;

  if (!isOpen(state)) {
    return Option.none();
  }

  const at = state.now;
  const others = state.members.filter(({ player }) => player !== state.host);
  const back = returning(state, state.host);
  const standIn = others[0]?.player ?? back?.player ?? closer;

  if (others.length === 0 && state.settings.locked && back === undefined) {
    return Option.none();
  }

  const joined =
    others.length === 0
      ? applied(
          night,
          RoomCommands.Join({
            at,
            avatar: "",
            by: member(standIn),
            name: back?.name ?? "stand-in",
          })
        )
      : night;

  const stayed = joined.log
    .filter(RoomEvents.$is("MemberJoined"))
    .map(({ player }) => player)
    .filter((player) => player !== state.host);

  const away = applied(
    joined,
    RoomCommands.NoteAttendance({ at, by: server, connected: stayed })
  );

  return Option.some({
    night:
      isOpen(away.state) && away.state.host !== standIn
        ? applied(
            away,
            RoomCommands.ClaimHost({
              at: millis(at + HOST_CLAIM_AFTER_SECONDS * 1000),
              by: member(standIn),
            })
          )
        : away,
    standIn,
  });
};

const sumBy = <A>(items: readonly A[], amount: (item: A) => number) => {
  let total = 0;

  for (const item of items) {
    total += amount(item);
  }

  return total;
};

const ledgerProblems = (ended: Ended): readonly string[] => {
  const closed = ended.log.findLast(RoomEvents.$is("RoomClosed"));

  if (closed === undefined) {
    return ["the night ended without RoomClosed"];
  }

  const { balances, transfers } = closed.settlement;
  const boughtIn = ended.log.filter(RoomEvents.$is("BoughtIn"));
  const cashedOut = ended.log.filter(RoomEvents.$is("CashedOut"));

  const players = new Set([
    ...boughtIn.map(({ player }) => player),
    ...cashedOut.map(({ player }) => player),
  ]);

  const rows = [...players].flatMap((player) => {
    const row = balances.find((balance) => balance.player === player);

    const paidIn = sumBy(boughtIn, (entry) =>
      entry.player === player ? entry.amount : 0
    );

    const paidOut = sumBy(cashedOut, (entry) =>
      entry.player === player ? entry.amount : 0
    );

    const owed =
      Number(row?.net ?? 0) +
      sumBy(transfers, (transfer) =>
        transfer.from === player ? transfer.amount : 0
      ) -
      sumBy(transfers, (transfer) =>
        transfer.to === player ? transfer.amount : 0
      );

    return row?.boughtIn === paidIn &&
      row.cashedOut === paidOut &&
      Number(row.net) === paidOut - paidIn &&
      owed === 0
      ? []
      : [
          `${player} bought in ${paidIn} and cashed out ${paidOut}, and the settlement says ${JSON.stringify(row)} with ${owed} left to pay`,
        ];
  });

  const net = sumBy(balances, ({ net: owed }) => Number(owed));

  return [
    ...rows,
    ...(balances.length === players.size
      ? []
      : ["the settlement lists someone with no chips"]),
    ...(net === 0 ? [] : [`the settlement nets ${net}, not zero`]),
  ];
};

const cashOutProblems = (
  log: readonly RoomEvent[],
  cancelled: RoomEventOf<"HandCancelled">
): readonly string[] =>
  cancelled.restored.flatMap(({ player, stack }) => {
    const out = log.findLast(
      (event): event is RoomEventOf<"CashedOut"> =>
        RoomEvents.$is("CashedOut")(event) && event.player === player
    );

    return out?.amount === stack
      ? []
      : [
          `${player} got ${stack} back from the cancelled hand and cashed out ${out?.amount ?? 0}`,
        ];
  });

const cancelProblems = (ended: Ended): readonly string[] =>
  ended.log.filter(RoomEvents.$is("HandCancelled")).flatMap((cancelled) => {
    const startedAt = ended.log.findLastIndex(
      (event) =>
        RoomEvents.$is("Table")(event) &&
        Events.$is("HandStarted")(event.event) &&
        event.event.handNumber === cancelled.hand
    );

    const started = ended.log[startedAt];
    const [opening, ...rest] = ended.log;

    const before = replayWithoutRecap([
      opening,
      ...rest.slice(0, startedAt - 1),
    ]);

    if (
      started === undefined ||
      !RoomEvents.$is("Table")(started) ||
      !Events.$is("HandStarted")(started.event) ||
      !isOpen(before)
    ) {
      return [`hand ${cancelled.hand} was cancelled and never started`];
    }

    const expected = started.event.dealtIn.map((seat) => ({
      player: Option.getOrUndefined(playerAt(before, seat)),
      seat,
      stack: Option.getOrUndefined(
        Option.fromUndefinedOr(before.table.seats[seat]).pipe(
          Option.filter(Seats.$is("Occupied")),
          Option.map((occupant) => occupant.stack)
        )
      ),
    }));

    return JSON.stringify(expected) === JSON.stringify(cancelled.restored)
      ? cashOutProblems(ended.log, cancelled)
      : [
          `hand ${cancelled.hand} gave back ${JSON.stringify(cancelled.restored)}, and the seats held ${JSON.stringify(expected)} when it was dealt`,
        ];
  });

const sampledNights = (played: Played): readonly Night[] => {
  const every = Math.max(1, Math.floor(played.steps.length / SAMPLED_STATES));
  const nights: Night[] = [];

  let logged =
    played.log.length -
    played.steps.reduce((total, step) => total + step.events.length, 0);

  for (const [index, step] of played.steps.entries()) {
    logged += step.events.length;

    if (index % every === every - 1 || index === played.steps.length - 1) {
      const [opening, ...rest] = played.log.slice(0, logged);

      if (opening !== undefined && RoomEvents.$is("RoomOpened")(opening)) {
        nights.push({ log: [opening, ...rest], state: step.after });
      }
    }
  }

  return nights;
};

const endingProblems = (nights: readonly Night[], decideWith: Decide) =>
  nights.flatMap((night) => {
    const ended = endNight(night, decideWith);

    return [
      ...ended.problems,
      ...ledgerProblems(ended),
      ...cancelProblems(ended),
    ];
  });

const misSealed = (night: Night): Night =>
  isOpen(night.state) && Option.isSome(night.state.sealed)
    ? {
        ...night,
        state: {
          ...night.state,
          sealed: night.state.sealed.pipe(
            Option.map((seal) => ({ ...seal, seats: seal.seats.toReversed() }))
          ),
        },
      }
    : night;

const ANSWERS = new Set<RoomCommand["_tag"]>([
  "Deal",
  "DealSealed",
  "ExpireClock",
  "QuietTable",
  "RunQueue",
  "SealHand",
]);

const refusingInHand: Decide = (state, command) =>
  isOpen(state) &&
  TableStates.$is("InHand")(state.table) &&
  ANSWERS.has(command._tag)
    ? Result.fail(new SealedSeatsMoved({ dealt: [], sealed: [] }))
    : decide(state, command);

const checkedCasino = (settings: RoomSettings): RoomSettings => ({
  ...settings,
  shuffle: "Checked",
  table: { ...settings.table, blindPosting: "Casino" },
});

describe("ending the night from any state a night reaches", () => {
  it.prop(
    "the host, or whoever joins an empty room, ends the night in a bounded number of commands, and the settlement sums to zero and matches the buy-ins and cash-outs in the log",
    { source: session },
    ({ source }) => {
      expect(
        endingProblems(sampledNights(playSession(source)), decide)
      ).toStrictEqual([]);
    }
  );

  it.prop(
    "when the host has vanished, another member takes over as host two minutes later and ends the night the same way",
    { source: session },
    ({ source }) => {
      const takeovers = sampledNights(playSession(source)).flatMap((night) =>
        Option.toArray(hostVanishes(night))
      );

      expect(
        takeovers.flatMap(({ night, standIn }) =>
          isOpen(night.state) && night.state.host !== standIn
            ? [`${standIn} could not take over from ${night.state.host}`]
            : []
        )
      ).toStrictEqual([]);
      expect(
        endingProblems(
          takeovers.map(({ night }) => night),
          decide
        )
      ).toStrictEqual([]);
    }
  );

  it.prop(
    "a checked room whose sealed hand can never be dealt still ends, once the server marks it stalled",
    { source: session },
    ({ source }) => {
      const nights = sampledNights(
        playSession(source, undefined, checkedCasino)
      ).map(misSealed);

      expect(endingProblems(nights, decide)).toStrictEqual([]);
    },
    { timeout: CHECKED_TIMEOUT_MS }
  );

  it.prop(
    "a hand whose deadlines the room refuses is cancelled when the night ends, and every chip goes back to the seat that put it in",
    { source: session },
    ({ source }) => {
      expect(
        endingProblems(sampledNights(playSession(source)), refusingInHand)
      ).toStrictEqual([]);
    }
  );
});
