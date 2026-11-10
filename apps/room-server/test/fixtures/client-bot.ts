import {
  Activities,
  ANSWER_LIMIT_MS,
  PING_INTERVAL_MS,
  roomClient,
} from "@nostakes/client";
import type {
  Activity,
  ClientSchemas,
  ClientState,
  ConnectionPhase,
  DropReason,
  IssuedCommand,
  ReplyResult,
} from "@nostakes/client";
import { MAX_MISSED_EVENTS } from "@nostakes/protocol";
import type { CommandId, RoomPass } from "@nostakes/protocol";
import { RoomViews, SeenEvents } from "@nostakes/room";
import type { RoomRejection, RoomView, SeenEvent } from "@nostakes/room";
import { Duration, Effect, Fiber, Option, Result, Stream } from "effect";
import type { Scope } from "effect";

import { MemberCommandSchema, pokerRoom } from "../../src/poker-room.js";
import type { MemberCommand } from "../../src/poker-room.js";
import { plannerFor } from "./bot.js";
import type {
  Intent,
  NightControl,
  OpenView,
  Random,
  Role,
  Temper,
} from "./bot.js";
import { clientWire, describeFrame, timeline } from "./client-wire.js";
import type { Line, LineMode, Moment } from "./client-wire.js";
import { pokerCodec, wallClock } from "./poker-socket.js";
import { socketUrl } from "./room-client.js";

export interface PokerClientTypes {
  readonly Command: MemberCommand;
  readonly Event: SeenEvent;
  readonly View: RoomView;
  readonly Rejection: RoomRejection;
}

export const pokerClientSchemas: ClientSchemas<PokerClientTypes> = {
  command: pokerRoom.schemas.memberCommand,
  event: pokerRoom.schemas.redacted,
  rejection: pokerRoom.schemas.rejection,
  view: pokerRoom.schemas.view,
};

export type PokerClientState = ClientState<PokerClientTypes>;

export type PokerReply = ReplyResult<PokerClientTypes>;

export interface ClientTemper {
  readonly dropPercent: number;
  readonly blackHolePercent: number;
  readonly waitOutSilencePercent: number;
  readonly deafPercent: number;
  readonly napPercent: number;
  readonly echoPercent: number;
  readonly wakePercent: number;
  readonly issueBeforeDropPercent: number;
}

export type DropCause =
  | "BotClose"
  | "Restart"
  | "SilenceLimit"
  | "BlackHole"
  | "DeafUnanswered"
  | "DeafSilence"
  | "UnansweredOnClearLine"
  | "Unexplained";

export interface ClientDrop {
  readonly reason: DropReason;
  readonly cause: DropCause;
  readonly from: ConnectionPhase;
}

export interface ClientCommand {
  readonly id: CommandId;
  readonly command: MemberCommand;
  readonly issuedAt: number;
  issuedOnDeafLine: boolean;
  pendingAtDrop: boolean;
  outcome: Option.Option<Result.Result<PokerReply, string>>;
  answeredAt: Option.Option<number>;
}

export interface HandEnd {
  readonly hand: number;
  readonly seq: number;
  readonly view: RoomView;
}

export interface ClientBotStats {
  commands: number;
  rejected: number;
  illegal: number;
  silences: number;
  issuedBeforeDrop: number;
  resent: number;
  dropsBotClose: number;
  dropsRestart: number;
  dropsSilenceLimit: number;
  dropsBlackHole: number;
  dropsDeafUnanswered: number;
  dropsDeafSilence: number;
  dropsUnansweredOnClearLine: number;
  dropsUnexplained: number;
  failedAttempts: number;
  wakes: number;
  skippedRanges: number;
  unexpectedRefusals: number;
  echoes: number;
  naps: number;
}

export interface ClientBotRecord {
  readonly index: number;
  readonly label: string;
  readonly pass: RoomPass;
  readonly role: Role;
  readonly stats: ClientBotStats;
  readonly activity: readonly Activity<SeenEvent>[];
  readonly commands: readonly ClientCommand[];
  readonly handEnds: readonly HandEnd[];
  readonly drops: readonly ClientDrop[];
  readonly problems: readonly string[];
  readonly firstSeq: () => Option.Option<number>;
  readonly final: () => Option.Option<PokerClientState>;
  readonly frames: () => readonly string[];
  readonly opened: () => number;
  readonly latest: () => Option.Option<RoomView>;
  readonly lastSeq: () => number;
  readonly lastTableAt: () => number;
  readonly timeline: () => readonly Moment[];
  readonly unsettled: () => Option.Option<string>;
}

export interface ClientBotSetup {
  readonly base: string;
  readonly index: number;
  readonly pass: RoomPass;
  readonly role: Role;
  readonly random: Random;
  readonly temper: Temper;
  readonly chaos: ClientTemper;
  readonly control: NightControl;
}

const PROTOCOL_FAULTS: ReadonlySet<DropReason> = new Set([
  "Gap",
  "Garbled",
  "Malformed",
  "TooManyFrames",
]);

type Disruption = Effect.Effect<void, never, Scope.Scope>;

const Commands = MemberCommandSchema.cases;

const REPLY_LIMIT_MS = 100_000;

const LIVE_REPLY_LIMIT_MS = 8000;

const STOP_GRACE_MS = 15_000;

const NAP_LIMIT_MS = 60_000;

const NAP_MIN_SEATED = 4;

const MEND_POLL_MS = 100;

const MEND_WAKE_GAP_MS = 1000;

const UNANSWERED_ON: Readonly<Record<LineMode, DropCause>> = {
  BlackHole: "BlackHole",
  Clear: "UnansweredOnClearLine",
  Deaf: "DeafUnanswered",
};

const causeOf = (reason: DropReason, line: Line | undefined): DropCause => {
  if (reason === "SocketClosed") {
    return line?.closedByBot === true ? "BotClose" : "Restart";
  }

  if (reason === "Unanswered") {
    return UNANSWERED_ON[line?.mode ?? "Clear"];
  }

  if (reason === "Unresponsive") {
    return line?.mode === "Deaf" ? "SilenceLimit" : "Unexplained";
  }

  if (reason === "Silent" && line?.mode === "BlackHole") {
    return "BlackHole";
  }

  return reason === "Silent" && line?.mode === "Deaf"
    ? "DeafSilence"
    : "Unexplained";
};

const countDrop = (stats: ClientBotStats, cause: DropCause) => {
  stats.dropsBotClose += cause === "BotClose" ? 1 : 0;
  stats.dropsRestart += cause === "Restart" ? 1 : 0;
  stats.dropsSilenceLimit += cause === "SilenceLimit" ? 1 : 0;
  stats.dropsBlackHole += cause === "BlackHole" ? 1 : 0;
  stats.dropsDeafUnanswered += cause === "DeafUnanswered" ? 1 : 0;
  stats.dropsDeafSilence += cause === "DeafSilence" ? 1 : 0;
  stats.dropsUnansweredOnClearLine += cause === "UnansweredOnClearLine" ? 1 : 0;
  stats.dropsUnexplained += cause === "Unexplained" ? 1 : 0;
};

const seatedCount = (open: OpenView) =>
  open.seats.filter(({ occupant }) => Option.isSome(occupant)).length;

const handOf = (open: OpenView) =>
  open.lastHand.pipe(
    Option.match({ onNone: () => 0, onSome: (last) => last.handNumber })
  );

export const startClientBot = (setup: ClientBotSetup) => {
  const { base, chaos, control, pass, random, temper } = setup;
  const label = `client${setup.index}`;

  const stats: ClientBotStats = {
    commands: 0,
    dropsBlackHole: 0,
    dropsBotClose: 0,
    dropsDeafSilence: 0,
    dropsDeafUnanswered: 0,
    dropsRestart: 0,
    dropsSilenceLimit: 0,
    dropsUnansweredOnClearLine: 0,
    dropsUnexplained: 0,
    echoes: 0,
    failedAttempts: 0,
    illegal: 0,
    issuedBeforeDrop: 0,
    naps: 0,
    rejected: 0,
    resent: 0,
    silences: 0,
    skippedRanges: 0,
    unexpectedRefusals: 0,
    wakes: 0,
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

  const journal = timeline();
  const { note } = journal;
  const wire = clientWire(journal);
  const activity: Activity<SeenEvent>[] = [];
  const commands: ClientCommand[] = [];
  const handEnds: HandEnd[] = [];
  const drops: ClientDrop[] = [];
  const problems: string[] = [];
  let current = Option.none<PokerClientState>();
  let firstSeq = Option.none<number>();
  let lastTableAt = wallClock();
  let checkedHand = 0;
  let napped = false;
  let noted = "";

  const lastSeq = () =>
    current.pipe(
      Option.flatMap(({ seq }) => seq),
      Option.getOrElse(() => 0)
    );

  const recordHandEnd = (state: PokerClientState) => {
    if (state.connection !== "Live" || state.pending.length > 0) {
      return;
    }

    const open = state.view.pipe(
      Option.filter(RoomViews.$is("Open")),
      Option.filter((view) => Option.isNone(view.hand))
    );

    for (const view of Option.toArray(open)) {
      const hand = handOf(view);

      for (const seq of Option.toArray(state.seq)) {
        if (hand > checkedHand) {
          checkedHand = hand;
          handEnds.push({ hand, seq, view });
        }
      }
    }
  };

  const faultContext = () => {
    const line = wire.lastLine();

    return `line ${wire.opened()} ${line?.mode ?? "none"}, last frames ${(
      line?.received ?? []
    )
      .slice(-5)
      .map((text) =>
        text.startsWith("echo ")
          ? `echo ${describeFrame(text.slice(5))}`
          : describeFrame(text)
      )
      .join(" / ")}; echoes ${wire.echoes().slice(-3).join(" / ")}`;
  };

  const observe = (state: PokerClientState) => {
    const was = current.pipe(
      Option.map(({ connection }) => connection),
      Option.getOrElse((): ConnectionPhase => "Idle")
    );

    const appliedBefore = lastSeq();

    const summary = `${state.connection}${Option.match(state.drop, {
      onNone: () => "",
      onSome: (reason) => ` drop ${reason}`,
    })} failures ${state.failures}${Option.match(state.retryDelayMs, {
      onNone: () => "",
      onSome: (delayMs) => ` retry in ${delayMs} ms`,
    })} pending [${state.pending.join(" ")}]`;

    if (summary !== noted) {
      noted = summary;
      note(`phase ${summary} at ${Option.getOrElse(state.seq, () => 0)}`);
    }

    current = Option.some(state);

    if (Option.isNone(firstSeq) && state.connection === "Live") {
      firstSeq = state.seq;
    }

    if (state.connection === "Waiting" && was !== "Waiting") {
      const reason = Option.getOrElse(
        state.drop,
        (): DropReason => "SocketClosed"
      );

      if (PROTOCOL_FAULTS.has(reason)) {
        problems.push(
          `${label} dropped its connection for ${reason} after applying ${appliedBefore}; ${faultContext()}`
        );
      }

      if (was === "Live") {
        const cause = causeOf(reason, wire.lastLine());

        drops.push({ cause, from: was, reason });
        countDrop(stats, cause);

        if (cause === "SilenceLimit") {
          problems.push(
            `${label}: the server's silence limit closed a deaf line, which the client should have dropped as Unanswered within ${PING_INTERVAL_MS + ANSWER_LIMIT_MS} ms`
          );
        }

        for (const id of state.pending) {
          for (const issued of commands.filter((entry) => entry.id === id)) {
            issued.pendingAtDrop = true;
          }
        }
      } else {
        stats.failedAttempts += 1;
      }
    }

    if (state.connection === "Refused" && was !== "Refused") {
      stats.unexpectedRefusals += 1;
      problems.push(
        `${label} was refused: ${Option.getOrElse(state.refusal, () => "no reason")}`
      );
    }

    recordHandEnd(state);
  };

  const absorb = (item: Activity<SeenEvent>) => {
    activity.push(item);

    if (Activities.$is("Skipped")(item)) {
      stats.skippedRanges += 1;
    }

    if (
      Activities.$is("Applied")(item) &&
      SeenEvents.$is("Table")(item.event)
    ) {
      lastTableAt = wallClock();
    }
  };

  const unsettled = (): Option.Option<string> => {
    const line = wire.lastLine();

    const reasons = Option.match(current, {
      onNone: () => ["never started"],
      onSome: (state) => [
        ...(state.connection === "Live" ? [] : [`phase ${state.connection}`]),
        ...(state.pending.length === 0
          ? []
          : [`pending ${state.pending.join(" ")}`]),
        ...(line === undefined || line.mode === "Clear"
          ? []
          : [`line ${line.number} ${line.mode}`]),
        ...(state.view.pipe(Option.exists(RoomViews.$is("Closed")))
          ? []
          : ["the room is not closed in its view"]),
      ],
    });

    return reasons.length === 0
      ? Option.none()
      : Option.some(reasons.join(", "));
  };

  const record: ClientBotRecord = {
    activity,
    commands,
    drops,
    final: () => current,
    firstSeq: () => firstSeq,
    frames: wire.frames,
    handEnds,
    index: setup.index,
    label,
    lastSeq,
    lastTableAt: () => lastTableAt,
    latest: () => current.pipe(Option.flatMap(({ view }) => view)),
    opened: wire.opened,
    pass,
    problems,
    role: setup.role,
    stats,
    timeline: journal.moments,
    unsettled,
  };

  const beforeDrop = (open: OpenView): Option.Option<Intent> =>
    random.chance(chaos.issueBeforeDropPercent)
      ? planner.choose(open).pipe(
          Option.orElse(() =>
            Option.some({
              command: Commands.SetProfile.make({
                avatar: `dropping-${stats.issuedBeforeDrop + 1}`,
                name: label,
              }),
              illegal: false,
              think: 0,
            })
          )
        )
      : Option.none();

  const liveOnClearLine = () =>
    current.pipe(Option.exists(({ connection }) => connection === "Live")) &&
    wire.lastLine()?.mode === "Clear";

  const unanswered = (quietMs: number) => {
    if (quietMs > LIVE_REPLY_LIMIT_MS) {
      const problem = `no reply after ${LIVE_REPLY_LIMIT_MS} ms live on a clear connection`;

      problems.push(`${label}: ${problem}`);

      return problem;
    }

    return control.stop
      ? "no reply by the end of the night"
      : `no reply within ${REPLY_LIMIT_MS} ms`;
  };

  const loop = Effect.gen(function* clientBotLoop() {
    const client = yield* roomClient(pokerClientSchemas, {
      token: pass.token,
      url: socketUrl(base, pass.code),
    }).pipe(Effect.provide(wire.layer));

    yield* client.states.pipe(
      Stream.runForEach((state) =>
        Effect.sync(() => {
          observe(state);
        })
      ),
      Effect.forkScoped
    );
    yield* client.activity.pipe(
      Stream.runForEach((item) =>
        Effect.sync(() => {
          absorb(item);
        })
      ),
      Effect.forkScoped
    );
    yield* client.start;

    const wake = client.wake.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          note("wake");
          stats.wakes += 1;
        })
      )
    );

    const wakeLater = (delayMs: number) =>
      Effect.sleep(Duration.millis(delayMs)).pipe(
        Effect.andThen(wake),
        Effect.forkScoped,
        Effect.asVoid
      );

    const awaitReply = (reply: IssuedCommand<PokerClientTypes>["reply"]) =>
      Effect.gen(function* waitForReply() {
        const fiber = yield* Effect.forkChild(Effect.result(reply));
        const started = wallClock();

        const poll = Fiber.join(fiber).pipe(
          Effect.timeoutOption(Duration.millis(250))
        );

        let done = yield* poll;
        let polledAt = wallClock();
        let quietMs = 0;
        let afterStopMs = 0;

        while (
          Option.isNone(done) &&
          afterStopMs <= STOP_GRACE_MS &&
          wallClock() - started <= REPLY_LIMIT_MS &&
          quietMs <= LIVE_REPLY_LIMIT_MS
        ) {
          done = yield* poll;

          const now = wallClock();

          quietMs = liveOnClearLine() ? quietMs + now - polledAt : 0;
          afterStopMs += control.stop ? now - polledAt : 0;
          polledAt = now;
        }

        return Option.match(done, {
          onNone: (): Result.Result<PokerReply, string> => {
            const why = unanswered(quietMs);

            note(`gave up waiting: ${why}`);

            return Result.fail(why);
          },
          onSome: (exit) => Result.mapError(exit, (failure) => failure._tag),
        });
      });

    const perform = (planned: Intent, disruption: Option.Option<Disruption>) =>
      Effect.gen(function* performCommand() {
        const issued = yield* client.issue(planned.command).pipe(Effect.result);

        if (Result.isFailure(issued)) {
          problems.push(
            `${label} could not issue ${planned.command._tag}: ${issued.failure._tag}`
          );

          return;
        }

        const entry: ClientCommand = {
          answeredAt: Option.none(),
          command: planned.command,
          id: issued.success.id,
          issuedAt: wallClock(),
          issuedOnDeafLine: false,
          outcome: Option.none(),
          pendingAtDrop: false,
        };

        commands.push(entry);
        stats.commands += 1;
        stats.illegal += planned.illegal ? 1 : 0;
        note(
          `issued ${entry.id} ${planned.command._tag}${Option.isSome(disruption) ? " before a disruption" : ""}`
        );

        for (const disrupt of Option.toArray(disruption)) {
          stats.issuedBeforeDrop += 1;
          yield* disrupt;
        }

        entry.issuedOnDeafLine =
          !control.closing && wire.lastLine()?.mode === "Deaf";

        if (entry.issuedOnDeafLine) {
          note(`${entry.id} went out on a deaf line`);
        }

        const outcome = yield* awaitReply(issued.success.reply);
        const answeredAt = wallClock();

        entry.outcome = Option.some(outcome);
        entry.answeredAt = Result.isSuccess(outcome)
          ? Option.some(answeredAt)
          : Option.none();
        note(
          `outcome ${entry.id} ${Result.match(outcome, {
            onFailure: (why) => `failed: ${why}`,
            onSuccess: (reply) => reply._tag,
          })} after ${Math.round(answeredAt - entry.issuedAt)} ms`
        );
        stats.rejected +=
          Result.isSuccess(outcome) &&
          pokerCodec.reply.guards.Rejected(outcome.success)
            ? 1
            : 0;
        stats.resent +=
          entry.pendingAtDrop && Result.isSuccess(outcome) ? 1 : 0;
      });

    const nap = Effect.gen(function* nap() {
      const from = lastSeq();
      const started = wallClock();

      napped = true;
      stats.naps += 1;
      note(`nap from ${from}`);
      wire.goOffline();

      while (
        !control.stop &&
        !control.closing &&
        control.head - from <= MAX_MISSED_EVENTS + 5 &&
        wallClock() - started < NAP_LIMIT_MS
      ) {
        yield* Effect.sleep(Duration.millis(200));
      }

      wire.goOnline();

      for (
        let attempt = 0;
        attempt < 30 &&
        !control.stop &&
        current.pipe(Option.exists(({ connection }) => connection !== "Live"));
        attempt += 1
      ) {
        yield* wake;
        yield* Effect.sleep(Duration.millis(400));
      }
    });

    const echo = Effect.sync(() => {
      const past = wire.pastBatches(lastSeq());
      const frame = past[random.below(past.length)];

      stats.echoes += frame !== undefined && wire.inject(frame) ? 1 : 0;
    });

    const disruptionFor = (open: OpenView): Option.Option<Disruption> => {
      const clocked = open.settings.turnSeconds > 0;

      if (random.chance(chaos.dropPercent)) {
        return Option.some(Effect.sync(wire.closeFromBot));
      }

      if (random.chance(chaos.blackHolePercent)) {
        const waitOut = clocked && random.chance(chaos.waitOutSilencePercent);
        const wakeAfter = waitOut ? 0 : random.between(100, 900);

        return Option.some(
          Effect.sync(() => {
            note(
              waitOut
                ? "black hole, waiting out the silence limit"
                : `black hole, waking in ${wakeAfter} ms`
            );
            wire.blackHole();
          }).pipe(Effect.andThen(waitOut ? Effect.void : wakeLater(wakeAfter)))
        );
      }

      return clocked && random.chance(chaos.deafPercent)
        ? Option.some(Effect.sync(wire.deafen))
        : Option.none();
    };

    const sideTrip = (open: OpenView): Option.Option<Disruption> => {
      const clocked = open.settings.turnSeconds > 0;

      if (
        clocked &&
        !napped &&
        seatedCount(open) >= NAP_MIN_SEATED &&
        random.chance(chaos.napPercent)
      ) {
        return Option.some(nap);
      }

      if (random.chance(chaos.echoPercent)) {
        return Option.some(echo);
      }

      return random.chance(chaos.wakePercent)
        ? Option.some(wake)
        : Option.none();
    };

    const mend = Effect.gen(function* mendAtClose() {
      while (!control.closing && !control.stop) {
        yield* Effect.sleep(Duration.millis(MEND_POLL_MS));
      }

      note("saw the room closing");

      let wokeAt = 0;

      while (!control.stop) {
        const line = wire.lastLine();

        if (
          line !== undefined &&
          line.mode !== "Clear" &&
          line.raw.readyState <= WebSocket.OPEN
        ) {
          note(`mending line ${line.number}, which is ${line.mode}`);
          wire.closeFromBot();
        }

        const waiting = current.pipe(
          Option.exists(({ connection }) => connection === "Waiting")
        );

        if (waiting && wallClock() - wokeAt >= MEND_WAKE_GAP_MS) {
          wokeAt = wallClock();
          yield* wake;
        }

        yield* Effect.sleep(Duration.millis(MEND_POLL_MS));
      }
    });

    yield* Effect.forkScoped(mend);

    while (!control.stop) {
      yield* Effect.sleep(Duration.millis(random.between(30, 120)));

      const state = yield* client.state;

      const open = state.view.pipe(Option.filter(RoomViews.$is("Open")));

      if (control.stop || state.connection !== "Live" || Option.isNone(open)) {
        continue;
      }

      const disruption = control.closing
        ? Option.none()
        : disruptionFor(open.value);

      if (Option.isNone(disruption)) {
        const trip = control.closing ? Option.none() : sideTrip(open.value);

        if (Option.isSome(trip)) {
          yield* trip.value;
          continue;
        }
      }

      const planned = Option.isSome(disruption)
        ? beforeDrop(open.value)
        : planner.choose(open.value);

      if (Option.isNone(planned)) {
        for (const disrupt of Option.toArray(disruption)) {
          yield* disrupt;
        }

        continue;
      }

      if (planned.value.think > 0 && Option.isNone(disruption)) {
        yield* Effect.sleep(Duration.millis(planned.value.think));
      }

      yield* perform(planned.value, disruption);
    }

    note("saw the night stop");
    yield* client.stop;
  }).pipe(Effect.scoped);

  return { closeAll: Effect.void, loop, record };
};
