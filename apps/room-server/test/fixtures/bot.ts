import {
  Actions,
  CardSchema,
  ChipsSchema,
  ShownCardsSchema,
  WinningHandMustTable,
} from "@nostakes/engine";
import type {
  Action,
  Card,
  LegalActions,
  ShowdownChoices,
} from "@nostakes/engine";
import { CommandIdSchema, SeqSchema } from "@nostakes/protocol";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  RoomSettingsSchema,
  RoomViews,
  SeenEvents,
  TableRejected,
} from "@nostakes/room";
import type { RoomRejection, RoomView, RoomViewSchema } from "@nostakes/room";
import { Duration, Effect, Option, Queue, Schedule, Schema } from "effect";

import { MemberCommandSchema } from "../../src/poker-room.js";
import type { MemberCommand } from "../../src/poker-room.js";
import {
  awaitArrival,
  encodeClientFrame,
  openSocket,
  pokerCodec,
  wallClock,
} from "./poker-socket.js";
import type { PokerSocket } from "./poker-socket.js";
import { signalPlanner, signalSeedFor } from "./signal-plan.js";
import type { SignalTally } from "./signal-plan.js";

export type OpenView = typeof RoomViewSchema.cases.Open.Type;

type EncodedSettings = typeof RoomSettingsSchema.Encoded;

const Commands = MemberCommandSchema.cases;

export const refusedWinningMuck = (
  command: MemberCommand,
  rejection: RoomRejection
) =>
  MemberCommandSchema.guards.MuckHand(command) &&
  Schema.is(TableRejected)(rejection) &&
  Schema.is(WinningHandMustTable)(rejection.rejection);

const decodeRuns = Schema.decodeSync(Commands.ChooseRuns.fields.runs);

const encodeSettings = Schema.encodeSync(RoomSettingsSchema);

const decodeSettings = Schema.decodeSync(RoomSettingsSchema);

const { guards } = pokerCodec.server;

export interface Random {
  readonly below: (bound: number) => number;
  readonly chance: (percent: number) => boolean;
  readonly between: (low: number, high: number) => number;
}

export const randomSource = (seed: number): Random => {
  let state = (Math.abs(Math.trunc(seed)) % 2_147_483_646) + 1;

  const below = (bound: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, bound);
  };

  for (let warm = 0; warm < 8; warm += 1) {
    below(1);
  }

  return {
    below,
    between: (low, high) => low + below(high - low + 1),
    chance: (percent) => below(10_000) < percent * 100,
  };
};

export interface Temper {
  readonly silencePercent: number;
  readonly voteSilencePercent: number;
  readonly shovePercent: number;
  readonly showdownSilencePercent: number;
  readonly illegalPercent: number;
  readonly mustTableMuckPercent: number;
  readonly duplicatePercent: number;
  readonly dropPercent: number;
  readonly secondDevicePercent: number;
  readonly churnPercent: number;
  readonly thinkMs: number;
}

export interface RuleChange {
  readonly atHand: number;
  readonly label: string;
  readonly change: (settings: EncodedSettings) => EncodedSettings;
}

export interface NightControl {
  stop: boolean;
  closing: boolean;
  head: number;
  rulesApplied: number;
  readonly ruleChanges: readonly RuleChange[];
  readonly silences: readonly number[];
  silencesTaken: number;
  readonly quiet: Set<PlayerId>;
  readonly seats: number;
  readonly intruders: Map<PlayerId, number>;
}

export interface SocketRecord {
  readonly socket: PokerSocket;
  readonly after: Option.Option<number>;
  readonly helloAt: number;
}

export interface Device {
  readonly name: string;
  readonly sockets: SocketRecord[];
}

export interface BotStats {
  commands: number;
  rejected: number;
  illegal: number;
  illegalMucks: number;
  duplicates: number;
  resent: number;
  reconnects: number;
  drops: number;
  secondDevices: number;
  silences: number;
  replyTimeouts: number;
  protocolViolations: number;
  signals: SignalTally;
}

export type Role = "Player" | "Spectator";

export interface BotRecord {
  readonly index: number;
  readonly label: string;
  readonly pass: RoomPass;
  readonly role: Role;
  readonly devices: readonly Device[];
  readonly stats: BotStats;
  readonly sent: Map<string, number>;
  readonly latest: () => Option.Option<RoomView>;
  readonly lastTableAt: () => number;
  readonly lastSeq: () => number;
}

export interface BotSetup {
  readonly base: string;
  readonly index: number;
  readonly pass: RoomPass;
  readonly role: Role;
  readonly random: Random;
  readonly temper: Temper;
  readonly control: NightControl;
}

export class BotFailed extends Schema.TaggedError<
  BotFailed,
  { readonly brand: unique symbol }
>()("BotFailed", { label: Schema.String, problem: Schema.String }) {
  override get message() {
    return `Bot ${this.label} failed: ${this.problem}. Rerun the night with the same seed and read the bot's frames.`;
  }
}

export interface Intent {
  readonly command: MemberCommand;
  readonly illegal: boolean;
  readonly think: number;
}

const intent = (command: MemberCommand, think = 0): Option.Option<Intent> =>
  Option.some({ command, illegal: false, think });

const illegal = (command: MemberCommand): Option.Option<Intent> =>
  Option.some({ command, illegal: true, think: 0 });

const answer = (legal: LegalActions, random: Random): Action => {
  const roll = random.below(100);

  if (roll < 12) {
    return legal.canCheck ? Actions.Check() : Actions.Fold();
  }

  if (roll < 50 && legal.canCheck) {
    return Actions.Check();
  }

  if (roll < 72 && Option.isSome(legal.call)) {
    return Actions.Call();
  }

  if (Option.isSome(legal.raise)) {
    const { maxTo, minTo } = legal.raise.value;

    if (roll < 84) {
      return Actions.RaiseTo({ to: minTo });
    }

    return Actions.RaiseTo({
      to: roll < 92 ? ChipsSchema.make(random.between(minTo, maxTo)) : maxTo,
    });
  }

  if (legal.canCheck) {
    return Actions.Check();
  }

  return Option.isSome(legal.call) ? Actions.Call() : Actions.Fold();
};

const handNumberOf = (view: OpenView) =>
  Math.max(
    view.hand.pipe(
      Option.match({ onNone: () => 0, onSome: (hand) => hand.handNumber })
    ),
    view.lastHand.pipe(
      Option.match({ onNone: () => 0, onSome: (last) => last.handNumber })
    )
  );

export const handsSeen = (view: RoomView) =>
  RoomViews.$is("Open")(view) ? handNumberOf(view) : 0;

const seatOf = (view: OpenView, player: PlayerId) =>
  Option.fromUndefinedOr(
    view.seats.find((seat) =>
      seat.occupant.pipe(Option.exists((who) => who.player === player))
    )
  );

const decisionKey = (view: OpenView) =>
  view.hand.pipe(
    Option.map((hand) =>
      [
        hand.handNumber,
        hand.street,
        ...hand.players.map((player) => player.committedTotal),
      ].join("/")
    ),
    Option.getOrElse(() => "none")
  );

const notMine = (cards: readonly Card[], random: Random) => {
  const start = random.below(52);

  const card = Array.from(
    { length: 52 },
    (_, step) => (start + step) % 52
  ).find((candidate) => !cards.some((held) => held === candidate));

  return CardSchema.make(card ?? 0);
};

const replyIn = (socket: PokerSocket, id: string, from: number) =>
  Option.fromUndefinedOr(
    socket.arrivals
      .slice(from)
      .map(({ message }) => message)
      .find(
        (message): message is typeof pokerCodec.server.cases.Reply.Type =>
          guards.Reply(message) && message.id === id
      )
  );

const awaitReply = (socket: PokerSocket, id: string, from: number) =>
  Effect.gen(function* waitForReply() {
    while (Option.isNone(replyIn(socket, id, from))) {
      if (Option.isSome(socket.closed())) {
        return Option.none();
      }

      yield* Queue.take(socket.signal);
    }

    return replyIn(socket, id, from);
  }).pipe(
    Effect.timeoutOption(Duration.seconds(8)),
    Effect.map(Option.flatten)
  );

export interface PlannerSetup {
  readonly label: string;
  readonly pass: RoomPass;
  readonly role: Role;
  readonly random: Random;
  readonly temper: Temper;
  readonly control: NightControl;
  readonly stats: { silences: number };
}

const mayTopUp = (open: OpenView, stack: number) =>
  open.settings.topUps === "UpToMax" ||
  (Option.isNone(open.hand) &&
    (open.settings.topUps === "BelowMin"
      ? stack < open.settings.buyIn.min
      : stack === 0));

const handToCall = (open: OpenView) =>
  open.settings.dealing === "Host" &&
  open.game === "Running" &&
  Option.isNone(open.hand) &&
  Option.isNone(open.clocks.nextDeal) &&
  open.seats.filter(({ occupant }) =>
    occupant.pipe(
      Option.exists(({ sittingOut, stack }) => !sittingOut && stack > 0)
    )
  ).length >= 2;

export const plannerFor = (setup: PlannerSetup) => {
  const { control, label, pass, random, stats, temper } = setup;
  let silent = Option.none<{ readonly key: string; readonly bank: boolean }>();
  let decided = "";
  let muckFirst = "";
  let finishedHand = 0;
  let restingUntil = 0;

  const freeSeats = (open: OpenView) =>
    open.seats
      .filter(
        ({ occupant, seat }) =>
          seat < control.seats &&
          Option.isNone(occupant) &&
          !open.requests.seats.some((request) => request.seat === seat)
      )
      .map(({ seat }) => seat);

  const buyIn = (open: OpenView) =>
    ChipAmountSchema.make(
      random.between(open.settings.buyIn.min, open.settings.buyIn.max)
    );

  const turnIntent = (open: OpenView, legal: LegalActions) => {
    const key = decisionKey(open);
    const hand = handNumberOf(open);

    if (silent.pipe(Option.exists((quiet) => quiet.key !== key))) {
      silent = Option.none();
    }

    if (decided !== key && open.settings.turnSeconds > 0) {
      decided = key;

      const due = control.silences[control.silencesTaken];
      const planned = due !== undefined && hand >= due;

      control.silencesTaken += planned ? 1 : 0;
      control.quiet.delete(pass.player);

      if (planned) {
        control.quiet.add(pass.player);
      }

      if (planned || random.chance(temper.silencePercent)) {
        stats.silences += 1;
        silent = Option.some({ bank: !planned && random.chance(40), key });
      }
    }

    const inBank = open.clocks.turn.pipe(
      Option.exists((turn) => turn.inTimeBank)
    );

    if (
      silent.pipe(
        Option.exists((quiet) => quiet.key === key && !(quiet.bank && inBank))
      )
    ) {
      return Option.none();
    }

    if (random.chance(temper.illegalPercent) && Option.isSome(legal.raise)) {
      return illegal(
        Commands.Act.make({
          action: Actions.RaiseTo({ to: ChipsSchema.make(1) }),
        })
      );
    }

    const shoves =
      temper.shovePercent > 0 &&
      Option.isSome(legal.raise) &&
      random.chance(temper.shovePercent);

    return intent(
      Commands.Act.make({
        action:
          shoves && Option.isSome(legal.raise)
            ? Actions.RaiseTo({ to: legal.raise.value.maxTo })
            : answer(legal, random),
      }),
      random.below(temper.thinkMs)
    );
  };

  const runsIntent = (open: OpenView, maxRuns: number) => {
    const key = `${handNumberOf(open)}/runs`;

    if (decided !== key) {
      decided = key;

      if (random.chance(temper.voteSilencePercent)) {
        stats.silences += 1;
        silent = Option.some({ bank: false, key });
      }
    }

    if (silent.pipe(Option.exists((quiet) => quiet.key === key))) {
      return Option.none();
    }

    return intent(
      Commands.ChooseRuns.make({
        runs: decodeRuns(random.chance(60) ? random.between(2, maxRuns) : 1),
      }),
      random.between(80, 300)
    );
  };

  const showIntent = (open: OpenView, choices: ShowdownChoices) => {
    const key = `${handNumberOf(open)}/show/${choices.seat}`;

    if (decided !== key) {
      decided = key;
      muckFirst =
        !choices.canMuck && random.chance(temper.mustTableMuckPercent)
          ? key
          : "";

      if (random.chance(temper.showdownSilencePercent)) {
        stats.silences += 1;
        silent = Option.some({ bank: false, key });
      }
    }

    if (muckFirst === key) {
      muckFirst = "";

      return illegal(Commands.MuckHand.make({}));
    }

    if (silent.pipe(Option.exists((quiet) => quiet.key === key))) {
      return Option.none();
    }

    return intent(
      choices.canMuck && random.chance(45)
        ? Commands.MuckHand.make({})
        : Commands.TableHand.make({}),
      random.between(40, 200)
    );
  };

  const gameIntent = (
    open: OpenView,
    seated: number
  ): Option.Option<Intent> => {
    if (open.game === "Waiting" && seated >= 2) {
      return intent(Commands.StartGame.make({}), random.below(300));
    }

    if (
      open.game === "Running" &&
      Option.isNone(open.hand) &&
      random.chance(0.3)
    ) {
      return intent(Commands.PauseGame.make({}));
    }

    return handToCall(open)
      ? intent(Commands.DealNextHand.make({}), random.below(400))
      : Option.none();
  };

  const hostIntent = (open: OpenView): Option.Option<Intent> => {
    const [seatRequest] = open.requests.seats;
    const [chipRequest] = open.requests.chips;
    const seated = open.seats.filter(({ occupant }) => Option.isSome(occupant));

    if (control.closing) {
      return open.queued.close && Option.isNone(open.stalled)
        ? Option.none()
        : intent(Commands.CloseRoom.make({}));
    }

    if (seatRequest !== undefined) {
      return intent(
        random.chance(80)
          ? Commands.ApproveSeat.make({ player: seatRequest.player })
          : Commands.DenySeat.make({ player: seatRequest.player }),
        random.below(150)
      );
    }

    if (chipRequest !== undefined) {
      return intent(
        random.chance(80)
          ? Commands.ApproveChips.make({ player: chipRequest.player })
          : Commands.DenyChips.make({ player: chipRequest.player }),
        random.below(150)
      );
    }

    const intruder = [...control.intruders].find(([stranger, atHand]) => {
      const inRoom = [...open.members, ...open.departed].some(
        ({ player }) => player === stranger
      );

      const dealtIn = open.hand.pipe(
        Option.exists(({ players }) =>
          players.some(({ player }) => player === stranger)
        )
      );

      return inRoom && (dealtIn || handNumberOf(open) >= atHand);
    });

    if (intruder !== undefined) {
      return intent(Commands.RemoveMember.make({ player: intruder[0] }));
    }

    const change = control.ruleChanges[control.rulesApplied];

    if (change !== undefined && handNumberOf(open) >= change.atHand) {
      control.rulesApplied += 1;

      return intent(
        Commands.ChangeSettings.make({
          settings: decodeSettings(
            change.change(encodeSettings(open.settings))
          ),
        })
      );
    }

    const game = gameIntent(open, seated.length);

    if (Option.isSome(game)) {
      return game;
    }

    const toAct = open.hand.pipe(Option.flatMap((hand) => hand.toAct));

    const away = open.clocks.turn.pipe(
      Option.exists((turn) => turn.inTimeBank)
    );

    const other = toAct.pipe(
      Option.flatMap((seat) => Option.fromUndefinedOr(open.seats[seat])),
      Option.flatMap(({ occupant }) => occupant),
      Option.filter(({ player }) => player !== pass.player)
    );

    if (
      away &&
      Option.isSome(other) &&
      !control.quiet.has(other.value.player) &&
      random.chance(5)
    ) {
      return intent(Commands.ActForSeat.make({ player: other.value.player }));
    }

    if (random.chance(0.05)) {
      const heir = open.members.find(({ player }) => player !== pass.player);

      return heir === undefined
        ? Option.none()
        : intent(Commands.TransferHost.make({ to: heir.player }));
    }

    return Option.none();
  };

  const postingIntent = (occupant: {
    readonly owes: {
      readonly big: boolean;
      readonly entry: boolean;
      readonly small: boolean;
    };
    readonly posts: boolean;
  }): Option.Option<Intent> =>
    (occupant.owes.big || occupant.owes.entry || occupant.owes.small) &&
    random.chance(10)
      ? intent(Commands.ChoosePosting.make({ post: !occupant.posts }))
      : Option.none();

  const seatedIntent = (
    open: OpenView,
    occupant: {
      readonly owes: {
        readonly big: boolean;
        readonly entry: boolean;
        readonly small: boolean;
      };
      readonly player: PlayerId;
      readonly posts: boolean;
      readonly sittingOut: boolean;
      readonly stack: number;
      readonly straddling: boolean;
      readonly leaving: boolean;
    }
  ): Option.Option<Intent> => {
    const asked = open.requests.chips.some(
      ({ player }) => player === pass.player
    );

    const queued = open.queued.chips.some(
      ({ player }) => player === pass.player
    );

    const canTopUp = !asked && !queued && mayTopUp(open, occupant.stack);
    const posting = postingIntent(occupant);

    if (Option.isSome(posting)) {
      return posting;
    }

    const { max, min } = open.settings.buyIn;

    if (occupant.leaving) {
      return Option.none();
    }

    if (occupant.stack === 0 && canTopUp) {
      return intent(
        Commands.RequestChips.make({
          amount: ChipAmountSchema.make(random.between(min, max)),
        })
      );
    }

    if (
      occupant.sittingOut &&
      wallClock() > restingUntil &&
      random.chance(30)
    ) {
      return intent(Commands.SitIn.make({}));
    }

    if (!random.chance(temper.churnPercent)) {
      return Option.none();
    }

    const roll = random.below(100);

    if (roll < 45) {
      return intent(
        Commands.DeclareStraddle.make({ on: !occupant.straddling })
      );
    }

    if (roll < 55 && !occupant.sittingOut) {
      restingUntil = wallClock() + random.between(200, 1500);

      return intent(Commands.SitOut.make({}));
    }

    if (roll < 75 && occupant.stack < max && canTopUp) {
      return intent(
        Commands.RequestChips.make({
          amount: ChipAmountSchema.make(
            random.between(1, Math.max(1, max - occupant.stack))
          ),
        })
      );
    }

    if (roll < 80) {
      return intent(Commands.LeaveSeat.make({}));
    }

    if (roll < 82) {
      return intent(Commands.LeaveRoom.make({}));
    }

    if (roll < 90) {
      return intent(
        Commands.SetProfile.make({
          avatar: `avatar-${random.below(9)}`,
          name: label,
        })
      );
    }

    return Option.none();
  };

  const afterHandIntent = (open: OpenView): Option.Option<Intent> =>
    open.lastHand.pipe(
      Option.filter(({ handNumber }) => handNumber > finishedHand),
      Option.flatMap(({ handNumber, yourCards }) => {
        finishedHand = handNumber;

        const roll = random.below(100);

        if (roll < 35 && yourCards.length > 0) {
          return intent(
            Commands.ShowCards.make({
              cards: ShownCardsSchema.make(
                yourCards.slice(0, random.between(1, yourCards.length))
              ),
            })
          );
        }

        return roll < 60 && open.settings.table.rabbitHunt
          ? intent(Commands.RabbitHunt.make({}))
          : Option.none();
      })
    );

  const standingIntent = (open: OpenView): Option.Option<Intent> => {
    const member = open.members.some(({ player }) => player === pass.player);

    if (!member) {
      return random.chance(3)
        ? intent(Commands.Join.make({ avatar: "back", name: label }))
        : Option.none();
    }

    const asked = open.requests.seats.some(
      ({ player }) => player === pass.player
    );

    const [seat] = freeSeats(open).toSorted(() => random.below(3) - 1);

    if (
      setup.role === "Player" &&
      !asked &&
      seat !== undefined &&
      random.chance(25)
    ) {
      return intent(Commands.RequestSeat.make({ buyIn: buyIn(open), seat }));
    }

    return Option.none();
  };

  const illegalIntent = (open: OpenView): Option.Option<Intent> => {
    const roll = random.below(7);
    const occupied = open.seats.find(({ occupant }) => Option.isSome(occupant));

    const someoneElse = [...open.members, ...open.departed].find(
      ({ player }) => player !== pass.player
    );

    const yours = open.lastHand.pipe(
      Option.map(({ yourCards }) => yourCards),
      Option.getOrElse((): readonly Card[] => [])
    );

    if (roll === 0) {
      return illegal(Commands.Act.make({ action: Actions.Check() }));
    }

    if (roll === 1 && occupied !== undefined) {
      return illegal(
        Commands.RequestSeat.make({ buyIn: buyIn(open), seat: occupied.seat })
      );
    }

    if (roll === 2 && open.host !== pass.player) {
      return illegal(Commands.ApproveSeat.make({ player: pass.player }));
    }

    if (roll === 3) {
      return illegal(
        random.chance(50)
          ? Commands.ChooseRuns.make({ runs: decodeRuns(2) })
          : Commands.TableHand.make({})
      );
    }

    if (roll === 5 && someoneElse !== undefined) {
      return illegal(
        Commands.SetProfile.make({
          avatar: "taken",
          name: someoneElse.name.toUpperCase(),
        })
      );
    }

    if (roll === 4) {
      return illegal(
        Commands.ShowCards.make({
          cards: ShownCardsSchema.make([notMine(yours, random)]),
        })
      );
    }

    return illegal(
      Commands.RequestChips.make({
        amount: ChipAmountSchema.make(1_000_000_000),
      })
    );
  };

  const choose = (open: OpenView): Option.Option<Intent> => {
    const me = seatOf(open, pass.player);

    if (
      control.closing &&
      Option.isSome(open.stalled) &&
      open.host !== pass.player &&
      random.chance(40)
    ) {
      return intent(Commands.CloseRoom.make({}), random.below(200));
    }

    const choosing = open.hand.pipe(
      Option.flatMap((hand) => hand.choosingRuns)
    );

    if (Option.isSome(open.legal)) {
      return turnIntent(open, open.legal.value);
    }

    if (Option.isSome(open.showdown)) {
      return showIntent(open, open.showdown.value);
    }

    if (
      Option.isSome(me) &&
      Option.isSome(choosing) &&
      choosing.value.seats.includes(me.value.seat)
    ) {
      return runsIntent(open, choosing.value.maxRuns);
    }

    if (open.host === pass.player) {
      const hosting = hostIntent(open);

      if (Option.isSome(hosting)) {
        return hosting;
      }
    }

    if (control.closing) {
      return Option.none();
    }

    const afterHand = afterHandIntent(open);

    if (Option.isSome(afterHand)) {
      return afterHand;
    }

    if (random.chance(temper.illegalPercent)) {
      return illegalIntent(open);
    }

    return Option.match(me.pipe(Option.flatMap(({ occupant }) => occupant)), {
      onNone: () => standingIntent(open),
      onSome: (occupant) => seatedIntent(open, occupant),
    });
  };

  return { choose };
};

export const startBot = (setup: BotSetup) => {
  const { base, control, pass, random, temper } = setup;
  const label = `bot${setup.index}`;
  const main: Device = { name: "main", sockets: [] };
  const second: Device = { name: "second", sockets: [] };

  const signals = signalPlanner(
    randomSource(signalSeedFor(setup.index, pass.code)),
    pass.player
  );

  const stats: BotStats = {
    commands: 0,
    drops: 0,
    duplicates: 0,
    illegal: 0,
    illegalMucks: 0,
    protocolViolations: 0,
    reconnects: 0,
    rejected: 0,
    replyTimeouts: 0,
    resent: 0,
    secondDevices: 0,
    signals: signals.tally,
    silences: 0,
  };

  const planner = plannerFor({
    control,
    label,
    pass,
    random,
    role: setup.role,
    stats,
    temper,
  });

  const sent = new Map<string, number>();
  const laterDuplicates: string[] = [];
  let cursor = 0;
  let lastSeq = 0;
  let lastTableAt = wallClock();
  let view = Option.none<RoomView>();
  let counter = 0;

  const record: BotRecord = {
    devices: [main, second],
    index: setup.index,
    label,
    lastSeq: () => lastSeq,
    lastTableAt: () => lastTableAt,
    latest: () => view,
    pass,
    role: setup.role,
    sent,
    stats,
  };

  const currentOf = (device: Device) =>
    Option.fromUndefinedOr(device.sockets.at(-1));

  const isLive = (device: Device) =>
    currentOf(device).pipe(
      Option.exists(({ socket }) => Option.isNone(socket.closed()))
    );

  const lastSeqOf = (device: Device) =>
    currentOf(device).pipe(Option.flatMap(({ socket }) => socket.lastSeq()));

  const absorb = () => {
    const current = currentOf(main);

    if (Option.isNone(current)) {
      return;
    }

    const { arrivals } = current.value.socket;

    for (; cursor < arrivals.length; cursor += 1) {
      const arrival = arrivals[cursor];

      if (arrival !== undefined && guards.Welcome(arrival.message)) {
        lastSeq = arrival.message.seq;
        view = Option.some(arrival.message.view);
      }

      if (arrival !== undefined && guards.Events(arrival.message)) {
        lastSeq = arrival.message.to;
        view = Option.some(arrival.message.view);
        lastTableAt = arrival.message.events.some(SeenEvents.$is("Table"))
          ? arrival.at
          : lastTableAt;
      }
    }
  };

  const connectOnce = (device: Device, after: Option.Option<number>) =>
    Effect.gen(function* connectDevice() {
      const socket = yield* openSocket(
        base,
        pass.code,
        `${label} ${device.name} #${device.sockets.length + 1}`
      );

      const helloAt = yield* socket.send(
        pokerCodec.client.cases.Hello.make({
          after: after.pipe(Option.map((seq) => SeqSchema.make(seq))),
          token: pass.token,
        })
      );

      device.sockets.push({ after, helloAt, socket });

      yield* awaitArrival(socket, "welcome", guards.Welcome);
    });

  const connect = (device: Device, after: Option.Option<number>) =>
    connectOnce(device, after).pipe(
      Effect.retry({
        schedule: Schedule.spaced(Duration.millis(150)),
        times: 40,
      }),
      Effect.mapError(
        (failure) =>
          new BotFailed({
            label,
            problem: `could not connect: ${failure.message}`,
          })
      )
    );

  const reconnectMain = Effect.gen(function* reconnectMain() {
    absorb();
    yield* Effect.sleep(Duration.millis(random.between(20, 250)));
    yield* connect(main, lastSeq > 0 ? Option.some(lastSeq) : Option.none());
    cursor = 0;
    stats.reconnects += 1;
    absorb();
  });

  const wait = (ms: number) =>
    currentOf(main).pipe(
      Option.match({
        onNone: () => Effect.sleep(Duration.millis(ms)),
        onSome: ({ socket }) =>
          Queue.take(socket.signal).pipe(
            Effect.timeoutOption(Duration.millis(ms)),
            Effect.andThen(Queue.clear(socket.signal)),
            Effect.asVoid
          ),
      })
    );

  const sendCounted = (socket: PokerSocket, id: string, text: string) =>
    socket.sendText(text).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          sent.set(id, (sent.get(id) ?? 0) + 1);
        })
      )
    );

  const perform = (planned: Intent) =>
    Effect.gen(function* sendCommand() {
      counter += 1;

      const id = `${label}.${counter}`;

      const text = encodeClientFrame(
        pokerCodec.client.cases.Command.make({
          command: planned.command,
          id: CommandIdSchema.make(id),
        })
      );

      const current = currentOf(main);

      if (Option.isNone(current)) {
        return;
      }

      const { socket } = current.value;
      const from = socket.arrivals.length;

      stats.commands += 1;
      stats.illegal += planned.illegal ? 1 : 0;

      yield* sendCounted(socket, id, text);

      if (random.chance(temper.duplicatePercent)) {
        stats.duplicates += 1;

        if (random.chance(50)) {
          yield* sendCounted(socket, id, text);
        } else {
          laterDuplicates.push(text);
        }
      }

      let reply = yield* awaitReply(socket, id, from);

      if (Option.isNone(reply) && Option.isSome(socket.closed())) {
        yield* reconnectMain;

        const again = currentOf(main);

        if (Option.isSome(again)) {
          const start = again.value.socket.arrivals.length;

          stats.resent += 1;
          yield* sendCounted(again.value.socket, id, text);
          reply = yield* awaitReply(again.value.socket, id, start);
        }
      }

      if (Option.isNone(reply)) {
        stats.replyTimeouts += isLive(main) ? 1 : 0;
      }

      stats.rejected += reply.pipe(
        Option.exists(({ result }) => pokerCodec.reply.guards.Rejected(result))
      )
        ? 1
        : 0;
      stats.illegalMucks +=
        planned.illegal &&
        reply.pipe(
          Option.exists(
            ({ result }) =>
              pokerCodec.reply.guards.Rejected(result) &&
              refusedWinningMuck(planned.command, result.rejection)
          )
        )
          ? 1
          : 0;

      absorb();
    });

  const chaos = Effect.gen(function* chaos() {
    if (control.closing) {
      return;
    }

    if (random.chance(temper.dropPercent)) {
      stats.drops += 1;

      for (const { socket } of Option.toArray(currentOf(main))) {
        yield* socket.disconnect;
      }

      return;
    }

    if (!isLive(second) && random.chance(temper.secondDevicePercent)) {
      stats.secondDevices += 1;
      yield* connect(second, lastSeqOf(second));

      return;
    }

    if (isLive(second) && random.chance(4)) {
      for (const { socket } of Option.toArray(currentOf(second))) {
        yield* socket.disconnect;
      }
    }

    const later = laterDuplicates.shift();

    if (later !== undefined) {
      const target = isLive(second) ? currentOf(second) : currentOf(main);

      for (const { socket } of Option.toArray(target)) {
        const id = Option.getOrElse(
          Schema.decodeOption(
            Schema.fromJsonString(Schema.Struct({ id: Schema.String }))
          )(later).pipe(Option.map((frame) => frame.id)),
          () => ""
        );

        yield* sendCounted(socket, id, later);
      }
    }
  });

  const sendServerOnly = Effect.gen(function* sendServerOnly() {
    for (const { socket } of Option.toArray(currentOf(main))) {
      stats.protocolViolations += 1;
      yield* socket.sendText(
        `{"_tag":"Command","id":"${label}.server","command":{"_tag":"Deal","shuffleBytes":"AAAA"}}`
      );
      yield* awaitArrival(socket, "closing", guards.Closing).pipe(
        Effect.ignore
      );
    }
  });

  const signalSometimes = (open: OpenView) =>
    Effect.gen(function* sendSignal() {
      for (const { socket } of Option.toArray(currentOf(main))) {
        yield* socket.send(
          pokerCodec.client.cases.Signal.make({ signal: signals.next(open) })
        );
      }
    });

  const keepAlive = Effect.gen(function* keepAlive() {
    for (const device of [main, second]) {
      for (const { socket } of Option.toArray(currentOf(device))) {
        yield* socket.pingIfQuiet;
      }
    }
  });

  const loop = Effect.gen(function* botLoop() {
    yield* connect(main, Option.none());
    absorb();

    while (!control.stop) {
      if (!isLive(main)) {
        yield* reconnectMain;
        continue;
      }

      yield* wait(random.between(30, 120));
      yield* keepAlive;
      absorb();

      const current = view.pipe(Option.filter(RoomViews.$is("Open")));

      if (control.stop || Option.isNone(current)) {
        continue;
      }

      yield* chaos;

      if (!control.closing && signals.due()) {
        yield* signalSometimes(current.value);
      }

      if (!control.closing && random.chance(temper.illegalPercent / 20)) {
        yield* sendServerOnly;
        continue;
      }

      const planned = planner.choose(current.value);

      if (Option.isNone(planned)) {
        continue;
      }

      if (planned.value.think > 0) {
        yield* Effect.sleep(Duration.millis(planned.value.think));
        absorb();
      }

      yield* perform(planned.value);
    }
  });

  const closeAll = Effect.gen(function* closeAll() {
    for (const device of [main, second]) {
      for (const { socket } of device.sockets) {
        if (Option.isNone(socket.closed())) {
          yield* socket.disconnect;
        }
      }
    }
  });

  return { closeAll, connectSecond: connect, loop, record };
};
