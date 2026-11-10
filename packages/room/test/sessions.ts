import {
  Actions,
  Antes,
  CardSchema,
  ChipsSchema,
  PendingDecisions,
  pendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
} from "@nostakes/engine";
import type {
  Action,
  Ante,
  LegalActions,
  PlayerId,
  TableConfig,
} from "@nostakes/engine";
import { Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Actors,
  Deadlines,
  RoomCodeSchema,
  RoomCommands,
  RoomStates,
  TimeBankRefills,
  SEATS,
  SealedDealSources,
  decide,
  evolve,
  millis,
  nextDeadline,
  openRoom,
  replay,
  seatOf,
} from "../src/index.js";
import type {
  Actor,
  Decision,
  Open,
  RoomCommand,
  RoomEvent,
  RoomLog,
  RoomSettings,
  RoomState,
  TopUpRule,
} from "../src/index.js";
import { dealFromBeacon, sealAt } from "./beacon.js";
import { bytesFrom, drand } from "./fixtures.js";
import { seededRandom } from "./random.js";
import type { SeededRandom } from "./random.js";

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

export const IntentSchema = Schema.Struct({
  pick: between(0, 1_000_000_000),
  roll: between(0, 99),
  wait: between(0, 99),
});

export type Intent = typeof IntentSchema.Type;

export const SessionSchema = Schema.Struct({
  intents: Schema.Array(IntentSchema).check(
    Schema.isMinLength(150),
    Schema.isMaxLength(400)
  ),
  setup: between(0, 1_000_000_000),
});

export type Session = typeof SessionSchema.Type;

export const session = Arbitrary.schema(SessionSchema);

export const POOL: readonly PlayerId[] = Array.from(
  { length: 10 },
  (_, index) => PlayerIdSchema.make(`p${index}`)
);

const chips = (amount: number) => ChipsSchema.make(amount);

const pickFrom = <A>(random: SeededRandom, values: readonly A[]) =>
  Option.fromUndefinedOr(values[random.below(Math.max(1, values.length))]);

const anteOf = (kind: number, amount: number): Ante => {
  if (kind === 1) {
    return Antes.EveryPlayer({ amount: chips(amount) });
  }

  return kind === 2
    ? Antes.BigBlindPays({ amount: chips(amount) })
    : Antes.NoAnte();
};

export const tableConfigFrom = (random: SeededRandom): TableConfig => {
  const small = 1 + random.below(5);

  return TableConfigSchema.make({
    allInHands: random.chance(1, 2) ? "Hidden" : "FaceUp",
    ante: anteOf(random.below(3), 1 + random.below(small * 2)),
    bigBlind: chips(small * (1 + random.below(2))),
    blindPosting: random.chance(1, 2) ? "Casino" : "HomeGame",
    maxRuns: RunCountSchema.make(1 + random.below(3)),
    rabbitHunt: random.chance(1, 2),
    rabbitHunters: random.chance(1, 3) ? "StillIn" : "DealtIn",
    runCount: random.chance(1, 4) ? "Fixed" : "Vote",
    showdown: random.chance(1, 2) ? "Interactive" : "Automatic",
    showdownOrder: random.chance(1, 3) ? "LastAggressor" : "RiverAggressor",
    smallBlind: chips(small),
    straddle: { button: random.chance(1, 2), underTheGun: random.below(3) },
    straddleSize: random.chance(1, 3) ? "TwoBigBlinds" : "Doubling",
    voluntaryShows: random.chance(1, 3) ? "BothCards" : "EitherCard",
  });
};

const CLOCK_SECONDS = [0, 5, 30];

const BANK_SECONDS = [0, 3, 20];

const TOP_UPS: readonly TopUpRule[] = [
  "UpToMax",
  "UpToMax",
  "BelowMin",
  "WhenBust",
];

const AWAY_SECONDS = [0, 1, 30, 120];

export const settingsFrom = (random: SeededRandom): RoomSettings => ({
  approval: { chips: random.chance(1, 2), seats: random.chance(1, 2) },
  betweenHandsSeconds: random.below(3),
  buyIn: {
    max: chips(400 + random.below(400)),
    min: chips(20 + random.below(60)),
  },
  dealing: random.chance(1, 3) ? "Host" : "Automatic",
  leavingMidHand: random.chance(1, 2) ? "PlaysOn" : "ActedFor",
  pauseWhenAwaySeconds: AWAY_SECONDS[random.below(AWAY_SECONDS.length)] ?? 0,
  peeking: random.chance(3, 4),
  runChoiceSeconds: 1 + random.below(10),
  seats: random.chance(1, 2) ? 9 : 2 + random.below(8),
  showdownSeconds: 1 + random.below(20),
  shuffle: random.chance(1, 20) ? "Checked" : "Plain",
  sitOutAfterTimeouts: [1, 1, 0, 2, 3][random.below(5)] ?? 1,
  table: tableConfigFrom(random),
  timeBankRefill: random.chance(1, 2)
    ? TimeBankRefills.NoRefill()
    : TimeBankRefills.Refill({
        everyHands: 1 + random.below(3),
        seconds: 1 + random.below(10),
        upTo: 1 + random.below(30),
      }),
  timeBankSeconds: BANK_SECONDS[random.below(3)] ?? 0,
  topUps: TOP_UPS[random.below(TOP_UPS.length)] ?? "UpToMax",
  turnSeconds: CLOCK_SECONDS[random.below(3)] ?? 0,
});

const member = (player: PlayerId) => Actors.Member({ player });

const server = Actors.Server();

const members = (state: Open) => state.members.map((each) => each.player);

const seated = (state: Open) =>
  SEATS.flatMap((seat) => {
    const occupant = state.table.seats[seat];

    return occupant !== undefined && Seats.$is("Occupied")(occupant)
      ? [{ occupant, seat }]
      : [];
  });

const someMember = (state: Open, random: SeededRandom) =>
  Option.getOrElse(pickFrom(random, members(state)), () => state.host);

const someone = (state: Open, random: SeededRandom): Actor => {
  const roll = random.below(10);

  if (roll === 0) {
    return server;
  }

  return member(
    roll === 1
      ? Option.getOrElse(pickFrom(random, POOL), () => state.host)
      : someMember(state, random)
  );
};

const hostOrNot = (state: Open, random: SeededRandom): Actor =>
  random.chance(4, 5) ? member(state.host) : someone(state, random);

const legalAnswer = (legal: LegalActions, random: SeededRandom): Action => {
  const roll = random.below(100);

  if (roll < 12) {
    return Actions.Fold();
  }

  if (roll < 60 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 78 && Option.isSome(legal.call)) {
    return Actions.Call();
  }

  return Option.match(legal.raise, {
    onNone: () => (legal.canCheck ? Actions.Check() : Actions.Call()),
    onSome: ({ maxTo, minTo }) =>
      Actions.RaiseTo({
        to: random.chance(1, 2)
          ? minTo
          : chips(minTo + random.below(maxTo - minTo + 1)),
      }),
  });
};

const illegalAnswer = (legal: LegalActions, random: SeededRandom): Action =>
  random.chance(1, 2)
    ? Actions.RaiseTo({
        to: chips(
          Option.match(legal.raise, {
            onNone: () => 1 + random.below(50),
            onSome: ({ maxTo }) => maxTo + 1,
          })
        ),
      })
    : Actions.Check();

const playerAt = (state: Open, seat: number) =>
  Option.fromUndefinedOr(
    seated(state).find((entry) => entry.seat === seat)?.occupant.player
  );

const answerPending = (
  state: Open,
  random: SeededRandom,
  at: number
): Option.Option<RoomCommand> =>
  PendingDecisions.$match(pendingDecisions(state.table), {
    Bet: ({ legal }) =>
      Option.map(playerAt(state, legal.seat), (owner) => {
        const roll = random.below(100);

        if (roll < 8) {
          return RoomCommands.Act({
            action: legalAnswer(legal, random),
            at: millis(at),
            by: member(someMember(state, random)),
          });
        }

        return RoomCommands.Act({
          action:
            roll < 16
              ? illegalAnswer(legal, random)
              : legalAnswer(legal, random),
          at: millis(at),
          by: member(owner),
        });
      }),
    ChooseRuns: ({ maxRuns, seats }) =>
      Option.flatMap(pickFrom(random, seats), (seat) =>
        Option.map(playerAt(state, seat), (owner) =>
          RoomCommands.ChooseRuns({
            at: millis(at),
            by: member(owner),
            runs: RunCountSchema.make(
              1 + random.below(maxRuns + (random.chance(1, 10) ? 1 : 0))
            ),
          })
        )
      ),
    Nothing: () => Option.none(),
    Show: ({ choices }) =>
      random.chance(1, 5)
        ? Option.none()
        : Option.map(playerAt(state, choices.seat), (owner) => {
            const roll = random.below(100);
            const when = millis(at);

            if (roll < 8) {
              return RoomCommands.MuckHand({
                at: when,
                by: member(someMember(state, random)),
              });
            }

            if (roll < 16 && !choices.canMuck) {
              return RoomCommands.MuckHand({ at: when, by: member(owner) });
            }

            return choices.canMuck && roll < 60
              ? RoomCommands.MuckHand({ at: when, by: member(owner) })
              : RoomCommands.TableHand({ at: when, by: member(owner) });
          }),
  });

const requestSeat = (
  state: Open,
  random: SeededRandom,
  at: number,
  standing: readonly PlayerId[]
) => {
  const empty = SEATS.filter((seat) => Option.isNone(playerAt(state, seat)));

  const { max, min } = state.settings.buyIn;

  return RoomCommands.RequestSeat({
    at: millis(at),
    buyIn: chips(
      random.chance(9, 10)
        ? min + random.below(max - min + 1)
        : max + 1 + random.below(50)
    ),
    by: member(
      Option.getOrElse(pickFrom(random, standing), () =>
        someMember(state, random)
      )
    ),
    seat: Option.getOrElse(pickFrom(random, empty), () =>
      SeatIndexSchema.make(random.below(9))
    ),
  });
};

const toDealIn = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const out = seated(state).filter(({ occupant }) => occupant.sittingOut);
  const broke = seated(state).filter(({ occupant }) => occupant.stack === 0);

  const standing = members(state).filter((player) =>
    Option.isNone(seatOf(state, player))
  );

  const [request] = state.requests.seats;
  const roll = random.below(4);

  if (request !== undefined && roll === 0) {
    return RoomCommands.ApproveSeat({
      at: millis(at),
      by: member(state.host),
      player: request.player,
    });
  }

  if (out.length > 0 && roll === 1) {
    return RoomCommands.SitIn({
      at: millis(at),
      by: member(out[random.below(out.length)]?.occupant.player ?? state.host),
    });
  }

  if (broke.length > 0 && roll === 2) {
    return RoomCommands.RequestChips({
      amount: state.settings.buyIn.min,
      at: millis(at),
      by: member(broke[0]?.occupant.player ?? state.host),
    });
  }

  return requestSeat(state, random, at, standing);
};

const playOrDeal = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand =>
  Option.getOrElse(answerPending(state, random, at), () =>
    Option.match(nextDeadline(state), {
      onNone: () => {
        if (state.game === "Waiting") {
          return RoomCommands.StartGame({
            at: millis(at),
            by: member(state.host),
          });
        }

        return state.settings.dealing === "Host" &&
          !state.dealCalled &&
          !TableStates.$is("InHand")(state.table)
          ? RoomCommands.DealNextHand({
              at: millis(at),
              by: member(state.host),
            })
          : toDealIn(state, random, at);
      },
      onSome: (deadline) => {
        const when = Math.max(at, deadline.at);
        const seed = random.below(1_000_000_000);

        if (Deadlines.$is("SealDue")(deadline)) {
          return sealAt(when, seed);
        }

        if (Deadlines.$is("SealedDealDue")(deadline)) {
          return dealFromBeacon(when, deadline.round);
        }

        if (Deadlines.$is("QueueDue")(deadline)) {
          return RoomCommands.RunQueue({ at: millis(when), by: server });
        }

        return Deadlines.$is("DealDue")(deadline)
          ? RoomCommands.Deal({
              at: millis(when),
              by: server,
              shuffleBytes: bytesFrom(seed),
            })
          : toDealIn(state, random, at);
      },
    })
  );

const attendanceNote = (
  state: Open,
  random: SeededRandom,
  at: number,
  by: Actor
): RoomCommand =>
  RoomCommands.NoteAttendance({
    at: millis(at),
    by,
    connected: random.chance(1, 3)
      ? []
      : members(state).filter(() => random.chance(1, 2)),
  });

const serverCommand = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const by = random.chance(1, 12) ? someone(state, random) : server;

  if (random.chance(1, 5)) {
    return attendanceNote(state, random, at, by);
  }

  return Option.match(nextDeadline(state), {
    onNone: () =>
      random.chance(1, 2)
        ? RoomCommands.Deal({
            at: millis(at),
            by,
            shuffleBytes: bytesFrom(random.below(1000)),
          })
        : RoomCommands.ExpireClock({
            at: millis(at),
            by,
            deadline: millis(at),
          }),
    onSome: (deadline) => {
      const style = random.below(10);

      const when =
        style < 3
          ? deadline.at - 1 - random.below(3000)
          : deadline.at + (style < 7 ? 0 : random.below(5000));

      const sent = millis(Math.max(0, when));

      if (Deadlines.$is("QueueDue")(deadline)) {
        return RoomCommands.RunQueue({ at: sent, by });
      }

      if (Deadlines.$is("QuietDue")(deadline)) {
        return RoomCommands.QuietTable({ at: sent, by });
      }

      if (Deadlines.$is("SealDue")(deadline)) {
        const sealed = sealAt(sent, random.below(1_000_000_000));

        return {
          ...sealed,
          by,
          round: Math.max(1, sealed.round - (random.chance(1, 8) ? 1 : 0)),
        };
      }

      if (Deadlines.$is("SealedDealDue")(deadline)) {
        const variant = random.below(8);

        if (variant === 0) {
          return {
            ...dealFromBeacon(sent, deadline.round + 1),
            by,
          };
        }

        return variant === 1
          ? RoomCommands.DealSealed({
              at: sent,
              by,
              source: SealedDealSources.BeaconUnavailable({
                shuffleBytes: bytesFrom(random.below(1_000_000_000)),
              }),
            })
          : { ...dealFromBeacon(sent, deadline.round), by };
      }

      if (Deadlines.$is("DealDue")(deadline)) {
        return RoomCommands.Deal({
          at: sent,
          by,
          shuffleBytes: bytesFrom(random.below(1_000_000_000)),
        });
      }

      return RoomCommands.ExpireClock({
        at: sent,
        by,
        deadline: millis(
          random.chance(1, 10) ? Math.max(0, deadline.at - 1) : deadline.at
        ),
      });
    },
  });
};

const membership = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const roll = random.below(10);
  const by = someone(state, random);

  if (roll < 4) {
    return RoomCommands.Join({
      at: millis(at),
      avatar: `a${random.below(5)}`,
      by: member(Option.getOrElse(pickFrom(random, POOL), () => state.host)),
      name: `n${random.below(50)}`,
    });
  }

  if (roll < 6) {
    return RoomCommands.LeaveRoom({ at: millis(at), by });
  }

  if (roll < 8) {
    return RoomCommands.SetProfile({
      at: millis(at),
      avatar: `a${random.below(5)}`,
      by,
      name: `n${random.below(50)}`,
    });
  }

  return RoomCommands.TransferHost({
    at: millis(at),
    by: hostOrNot(state, random),
    to: someMember(state, random),
  });
};

const pendingPlayer = (
  state: Open,
  random: SeededRandom,
  requests: readonly { readonly player: PlayerId }[]
) =>
  Option.getOrElse(
    pickFrom(
      random,
      requests.map((request) => request.player)
    ),
    () => someMember(state, random)
  );

const seating = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const when = millis(at);
  const roll = random.below(13);
  const by = someone(state, random);

  const seatedPlayer = Option.getOrElse(
    pickFrom(
      random,
      seated(state).map(({ occupant }) => occupant.player)
    ),
    () => someMember(state, random)
  );

  if (roll < 3) {
    return requestSeat(state, random, at, members(state));
  }

  if (roll < 5) {
    const player = pendingPlayer(state, random, state.requests.seats);
    const host = hostOrNot(state, random);

    return random.chance(2, 3)
      ? RoomCommands.ApproveSeat({ at: when, by: host, player })
      : RoomCommands.DenySeat({ at: when, by: host, player });
  }

  if (roll < 7) {
    return RoomCommands.RequestChips({
      amount: chips(1 + random.below(state.settings.buyIn.max)),
      at: when,
      by: random.chance(4, 5) ? member(seatedPlayer) : by,
    });
  }

  if (roll < 8) {
    const player = pendingPlayer(state, random, state.requests.chips);
    const host = hostOrNot(state, random);

    return random.chance(2, 3)
      ? RoomCommands.ApproveChips({ at: when, by: host, player })
      : RoomCommands.DenyChips({ at: when, by: host, player });
  }

  if (roll < 9) {
    return random.chance(1, 2)
      ? RoomCommands.LeaveSeat({ at: when, by: member(seatedPlayer) })
      : RoomCommands.RemoveFromSeat({
          at: when,
          by: hostOrNot(state, random),
          player: seatedPlayer,
        });
  }

  if (roll < 11) {
    return random.chance(1, 2)
      ? RoomCommands.SitOut({ at: when, by: member(seatedPlayer) })
      : RoomCommands.SitIn({ at: when, by: member(seatedPlayer) });
  }

  if (roll < 12) {
    return RoomCommands.ChoosePosting({
      at: when,
      by: member(seatedPlayer),
      post: random.chance(1, 2),
    });
  }

  return RoomCommands.DeclareStraddle({
    at: when,
    by: random.chance(4, 5) ? member(seatedPlayer) : by,
    on: random.chance(3, 4),
  });
};

const hosting = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const when = millis(at);
  const by = hostOrNot(state, random);
  const roll = random.below(10);

  if (roll < 2) {
    return RoomCommands.StartGame({ at: when, by });
  }

  if (roll < 3) {
    return RoomCommands.PauseGame({ at: when, by });
  }

  if (roll < 7) {
    const toAct = PendingDecisions.$match(pendingDecisions(state.table), {
      Bet: ({ legal }) => playerAt(state, legal.seat),
      ChooseRuns: ({ seats }) =>
        Option.flatMap(pickFrom(random, seats), (seat) =>
          playerAt(state, seat)
        ),
      Nothing: () => Option.none(),
      Show: ({ choices }) => playerAt(state, choices.seat),
    });

    return RoomCommands.ActForSeat({
      at: when,
      by,
      player: Option.getOrElse(toAct, () => someMember(state, random)),
    });
  }

  return RoomCommands.ChangeSettings({
    at: when,
    by,
    settings: settingsFrom(random),
  });
};

const afterHand = (
  state: Open,
  random: SeededRandom,
  at: number
): RoomCommand => {
  const lastHand = TableStates.$is("BetweenHands")(state.table)
    ? Option.getOrUndefined(state.table.lastHand)
    : undefined;

  const shower = lastHand?.players[random.below(lastHand.players.length)];

  const by = member(shower?.player ?? someMember(state, random));

  if (random.chance(1, 3)) {
    return RoomCommands.RabbitHunt({ at: millis(at), by });
  }

  const hole = shower?.holeCards ?? [CardSchema.make(random.below(52))];
  const chosen = hole.filter(() => random.chance(1, 2));

  return RoomCommands.ShowCards({
    at: millis(at),
    by,
    cards: ShownCardsSchema.make(chosen.length > 0 ? chosen : hole.slice(0, 1)),
  });
};

const junk = (state: Open, random: SeededRandom, at: number): RoomCommand => {
  const when = millis(at);
  const by = someone(state, random);
  const player = Option.getOrElse(pickFrom(random, POOL), () => state.host);

  const choices: readonly RoomCommand[] = [
    RoomCommands.Act({ action: Actions.Fold(), at: when, by }),
    RoomCommands.ChooseRuns({ at: when, by, runs: RunCountSchema.make(1) }),
    RoomCommands.TableHand({ at: when, by }),
    RoomCommands.MuckHand({ at: when, by }),
    RoomCommands.ApproveSeat({ at: when, by, player }),
    RoomCommands.ApproveChips({ at: when, by, player }),
    RoomCommands.ActForSeat({ at: when, by, player }),
    RoomCommands.CloseRoom({ at: when, by: member(player) }),
    RoomCommands.StartGame({ at: when, by }),
    RoomCommands.DealNextHand({ at: when, by }),
    RoomCommands.RemoveFromSeat({ at: when, by, player }),
    RoomCommands.TransferHost({ at: when, by, to: player }),
    RoomCommands.Deal({ at: when, by, shuffleBytes: bytesFrom(1) }),
  ];

  return (
    choices[random.below(choices.length)] ??
    choices[0] ??
    RoomCommands.SitIn({ at: when, by })
  );
};

export const commandFor = (
  state: RoomState,
  intent: Intent,
  at: number
): RoomCommand => {
  const random = seededRandom(intent.pick);

  if (!RoomStates.$is("Open")(state)) {
    return RoomCommands.Join({
      at: millis(at),
      avatar: "",
      by: member(POOL[0] ?? PlayerIdSchema.make("p0")),
      name: "late",
    });
  }

  const { roll } = intent;

  if (roll < 42) {
    return playOrDeal(state, random, at);
  }

  if (roll < 54) {
    return serverCommand(state, random, at);
  }

  if (roll < 61) {
    return membership(state, random, at);
  }

  if (roll < 76) {
    return seating(state, random, at);
  }

  if (roll < 85) {
    return hosting(state, random, at);
  }

  if (roll < 92) {
    return afterHand(state, random, at);
  }

  if (roll === 92 && random.chance(1, 8)) {
    return RoomCommands.CloseRoom({ at: millis(at), by: member(state.host) });
  }

  return junk(state, random, at);
};

const waitFor = (intent: Intent) => {
  if (intent.wait < 50) {
    return intent.wait * 20;
  }

  return intent.wait < 85 ? intent.wait * 120 : intent.wait * 600;
};

export interface Step {
  readonly after: RoomState;
  readonly before: RoomState;
  readonly command: RoomCommand;
  readonly decision: Decision;
  readonly events: readonly RoomEvent[];
}

export interface Played {
  readonly log: RoomLog;
  readonly settings: RoomSettings;
  readonly state: RoomState;
  readonly steps: readonly Step[];
}

const OPENING_SEATS = [0, 2, 4, 6, 8, 1, 3, 5, 7].map((index) =>
  SeatIndexSchema.make(index)
);

export const openingCommands = (
  settings: RoomSettings
): readonly RoomCommand[] => {
  const at = millis(0);

  return [
    ...POOL.slice(1, 6).map((player) =>
      RoomCommands.Join({ at, avatar: "", by: member(player), name: player })
    ),
    ...POOL.slice(0, 5).map((player, index) =>
      RoomCommands.RequestSeat({
        at,
        buyIn: settings.buyIn.max,
        by: member(player),
        seat:
          OPENING_SEATS.filter((open) => open < settings.seats)[index] ??
          SeatIndexSchema.make(index),
      })
    ),
    ...POOL.slice(1, 5).map((player) =>
      RoomCommands.ApproveSeat({ at, by: member(POOL[0] ?? player), player })
    ),
    RoomCommands.StartGame({
      at,
      by: member(POOL[0] ?? PlayerIdSchema.make("p0")),
    }),
  ];
};

export const playSession = (
  source: Session,
  onEvent?: (state: RoomState, event: RoomEvent) => void,
  adjust: (settings: RoomSettings) => RoomSettings = (same) => same
): Played => {
  const settings = adjust(settingsFrom(seededRandom(source.setup)));
  const host = POOL[0] ?? PlayerIdSchema.make("p0");

  const log: [RoomLog[0], ...RoomEvent[]] = [
    ...openRoom({
      at: millis(0),
      avatar: "",
      chain: drand.chain,
      code: RoomCodeSchema.make("GNRTD2"),
      host,
      name: "host",
      settings,
    }),
  ];

  let state = replay(log);

  for (const event of log) {
    onEvent?.(state, event);
  }

  const steps: Step[] = [];
  let now = 0;

  const apply = (command: RoomCommand) => {
    const before = state;
    const decision = decide(state, command);
    const events = Result.isSuccess(decision) ? decision.success : [];

    for (const event of events) {
      state = evolve(state, event);
      log.push(event);
      onEvent?.(state, event);
    }

    now = Math.max(now, command.at);
    steps.push({ after: state, before, command, decision, events });
  };

  for (const command of openingCommands(settings)) {
    apply(command);
  }

  for (const intent of source.intents) {
    apply(commandFor(state, intent, now + waitFor(intent)));
  }

  return { log, settings, state, steps };
};
