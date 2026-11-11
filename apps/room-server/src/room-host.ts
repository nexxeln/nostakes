import { SeqSchema, MAX_MISSED_EVENTS } from "@nostakes/protocol";
import type {
  BuildId,
  CloseReason,
  CommandId,
  PlayerId,
  RoomCode,
  UnavailableReason,
} from "@nostakes/protocol";
import {
  Array as Arr,
  Data,
  Duration,
  Inspectable,
  Option,
  Order,
  Result,
  Schema,
} from "effect";
import { constVoid, flow } from "effect/Function";

import { CommandFault } from "./command-fault.js";
import { hashedCredential, matchCredential } from "./credentials.js";
import type { HashedCredential } from "./credentials.js";
import type {
  Deadline,
  HostedRoom,
  OpenInput,
  RoomTypes,
} from "./hosted-room.js";
import {
  RETRY_POLICY,
  RefusedDeadline,
  retryDelay,
} from "./refused-deadline.js";
import type { RetryPolicy } from "./refused-deadline.js";
import { roomCodec } from "./room-codec.js";
import type { CatchUp, Reply } from "./room-codec.js";
import type {
  Credential,
  Refusals,
  RoomStorage,
  StoredEvent,
} from "./room-storage.js";

export interface Viewer {
  readonly player: PlayerId;
  readonly send: (frame: string) => void;
}

export interface Connections {
  readonly viewers: readonly Viewer[];
  readonly socketDeadline: Option.Option<number>;
  readonly closeAll: (reason: CloseReason) => void;
  readonly closePlayer: (player: PlayerId, reason: CloseReason) => void;
}

export type Origin = Data.TaggedEnum<{
  Member: { readonly player: PlayerId; readonly id: CommandId };
  Server: { readonly trigger: "Alarm" | "Attendance" | "Join" | "Stall" };
}>;

export const Origins = Data.taggedEnum<Origin>();

export interface CommitInput<T extends RoomTypes> {
  readonly origin: Origin;
  readonly command: T["Command"];
  readonly at: number;
  readonly grant: Option.Option<Credential>;
}

export type CommitNote = Data.TaggedEnum<{
  Replayed: { readonly id: CommandId };
  Rejected: { readonly reply: string };
  Committed: { readonly from: number; readonly to: number };
  StorageFailed: { readonly cause: string };
  Crashed: { readonly cause: string; readonly fault: string };
  Halted: {
    readonly violations: readonly string[];
    readonly kinds: readonly string[];
    readonly from: number;
  };
  RoomHalted: { readonly reason: string };
}>;

export const CommitNotes = Data.taggedEnum<CommitNote>();

export interface CommitResult<T extends RoomTypes> {
  readonly reply: Reply<T>;
  readonly note: CommitNote;
  readonly events: readonly T["Event"][];
}

export interface DeadlineAnswer<T extends RoomTypes> {
  readonly result: CommitResult<T>;
  readonly refused: Option.Option<RefusedDeadline>;
  readonly stall: Option.Option<{
    readonly command: T["Command"];
    readonly result: CommitResult<T>;
  }>;
}

export interface MemberAnswer<T extends RoomTypes> {
  readonly result: CommitResult<T>;
  readonly fault: Option.Option<CommandFault>;
  readonly stall: Option.Option<{
    readonly command: T["Command"];
    readonly result: CommitResult<T>;
  }>;
}

export type Standings<View, Revoked, Knock> = Data.TaggedEnum<{
  Halted: { readonly view: View; readonly reason: string };
  Knocking: { readonly knock: Knock };
  NotHalted: { readonly headSeq: number };
  NotAuthorized: { readonly halted: boolean };
  Removed: { readonly revoked: Revoked };
}>;

interface StandingsDefinition extends Data.TaggedEnum.WithGenerics<3> {
  readonly taggedEnum: Standings<this["A"], this["B"], this["C"]>;
}

export const StandingsAnswers = Data.taggedEnum<StandingsDefinition>();

export interface RecentStates<State> {
  readonly from: number;
  readonly states: readonly State[];
}

export const ROOM_RETENTION_MS = Duration.toMillis(Duration.days(30));

export interface HostState<T extends RoomTypes> {
  readonly code: RoomCode;
  readonly state: T["State"];
  readonly headSeq: number;
  readonly lastEventAt: number;
  readonly halted: Option.Option<string>;
  readonly credentials: readonly HashedCredential[];
  readonly recent: RecentStates<T["State"]>;
  readonly refusals: Option.Option<Refusals>;
  readonly commandFaults: number;
}

export const STATES_KEPT = MAX_MISSED_EVENTS + 1;

const keepRecent = <State>(
  recent: RecentStates<State>,
  added: readonly State[]
): RecentStates<State> => {
  const states = [...recent.states, ...added];
  const dropped = Math.max(0, states.length - STATES_KEPT);

  return { from: recent.from + dropped, states: states.slice(dropped) };
};

interface SoundLog<Event> {
  readonly rows: readonly StoredEvent[];
  readonly events: readonly Event[];
  readonly problems: readonly string[];
}

const soundRows = <Event>(
  rows: readonly StoredEvent[],
  decode: (text: string) => Event,
  upTo: Option.Option<number>
): SoundLog<Event> => {
  const kept: StoredEvent[] = [];
  const events: Event[] = [];

  for (const [index, row] of rows.entries()) {
    if (Option.exists(upTo, (last) => row.seq > last)) {
      break;
    }

    if (row.seq !== index + 1) {
      return {
        events,
        problems: [`stored event ${index + 1} has sequence number ${row.seq}`],
        rows: kept,
      };
    }

    const decoded = Result.try({
      catch: (thrown) => Inspectable.toStringUnknown(thrown, 0),
      try: () => decode(row.event),
    });

    if (Result.isFailure(decoded)) {
      return {
        events,
        problems: [
          `stored event ${row.seq} does not decode: ${decoded.failure}`,
        ],
        rows: kept,
      };
    }

    kept.push(row);
    events.push(decoded.success);
  }

  return { events, problems: [], rows: kept };
};

const soundUntilBroken = <T extends RoomTypes>(
  core: HostedRoom<T>,
  log: SoundLog<T["Event"]>
): SoundLog<T["Event"]> => {
  const [first, ...rest] = log.events;

  if (first === undefined) {
    return log;
  }

  let state = core.replay([first]);
  let problems: readonly string[] = core.invariants(state);
  let kept = 1;

  for (const event of rest) {
    if (problems.length > 0) {
      break;
    }

    const next = core.evolve(state, event);
    const broken = core.invariants(next);

    if (broken.length > 0) {
      problems = broken;
    } else {
      state = next;
      kept += 1;
    }
  }

  return {
    events: log.events.slice(0, kept),
    problems: [...log.problems, ...problems],
    rows: log.rows.slice(0, kept),
  };
};

export const loadRoom = <T extends RoomTypes>(
  core: HostedRoom<T>,
  storage: RoomStorage,
  replayed: (events: readonly T["Event"][]) => void = constVoid
): Option.Option<HostState<T>> =>
  storage.meta().pipe(
    Option.map((meta): HostState<T> => {
      const { decodeEvent } = roomCodec(core);

      const read = soundRows(
        storage.eventsAfter(0),
        decodeEvent,
        meta.soundSeq
      );

      const whole = (log: SoundLog<T["Event"]>) => {
        const split = Math.max(1, log.events.length - MAX_MISSED_EVENTS);
        let state = core.replay(log.events.slice(0, split));
        const states = [state];

        for (const event of log.events.slice(split)) {
          state = core.evolve(state, event);
          states.push(state);
        }

        return { split, state, states };
      };

      const first = whole(read);
      const broken = core.invariants(first.state);

      const sound = Arr.isReadonlyArrayNonEmpty(broken)
        ? soundUntilBroken(core, read)
        : read;

      const { split, state, states } = sound === read ? first : whole(sound);
      const violations = sound.problems;

      replayed(sound.events);

      return {
        code: meta.code,
        commandFaults: storage.commandFaults(),
        credentials: storage.credentials().map(hashedCredential),
        halted: Arr.isReadonlyArrayNonEmpty(violations)
          ? Option.some(violations.join("; "))
          : meta.halted,
        headSeq: sound.rows.at(-1)?.seq ?? 0,
        lastEventAt: sound.rows.at(-1)?.at ?? 0,
        recent: { from: sound.rows[split - 1]?.seq ?? 0, states },
        refusals: storage.refusals(),
        state,
      };
    })
  );

export const openStorage = <T extends RoomTypes>(
  core: HostedRoom<T>,
  storage: RoomStorage,
  input: OpenInput<T["OpenRequest"]>,
  credential: Credential
) => {
  const { encodeEvent } = roomCodec(core);
  const opened = core.open(input);

  storage.transaction(() => {
    storage.create(input.code);
    storage.grant(credential);

    for (const [index, event] of opened.entries()) {
      storage.appendEvent({
        at: input.at,
        event: encodeEvent(event),
        seq: index + 1,
      });
    }
  });

  return opened;
};

const faultNameOf = flow(
  Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String })),
  Option.match({
    onNone: () => "a value that is not an error",
    onSome: ({ name }) => name,
  })
);

interface Crash {
  readonly cause: string;
  readonly fault: string;
}

const earliest = (times: readonly Option.Option<number>[]) =>
  Arr.head(Arr.sort(Arr.getSomes(times), Order.Number));

type Checked<A> = Result.Result<A, readonly string[]>;

const guarded = <A>(label: string, run: () => Checked<A>): Checked<A> =>
  Result.try({
    catch: (cause): readonly string[] => [
      `${label}: ${Inspectable.toStringUnknown(cause, 0)}`,
    ],
    try: run,
  }).pipe(Result.flatMap((inner) => inner));

export const hostRoom = <T extends RoomTypes>(
  core: HostedRoom<T>,
  storage: RoomStorage,
  loaded: HostState<T>,
  retainFor: number,
  policy: RetryPolicy = RETRY_POLICY
) => {
  const codec = roomCodec(core);
  let current = loaded;

  const outside = (state: T["State"], player: PlayerId) =>
    core.revoked(state, player) || Option.isSome(core.knockOf(state, player));

  const expiresAt = () => current.lastEventAt + retainFor;

  const keyOf = (deadline: Deadline<T["Due"]>) =>
    `${core.dueKind(deadline.due)}@${deadline.at}`;

  const refusalsOf = (deadline: Deadline<T["Due"]>) =>
    current.refusals.pipe(
      Option.filter((refusals) => refusals.deadline === keyOf(deadline))
    );

  const retryAt = (deadline: Deadline<T["Due"]>) =>
    Option.match(refusalsOf(deadline), {
      onNone: () => deadline.at,
      onSome: (refusals) => Math.max(deadline.at, refusals.retryAt),
    });

  const nextDeadline = () =>
    core
      .nextDeadline(current.state)
      .pipe(Option.map((deadline) => ({ ...deadline, at: retryAt(deadline) })));

  const dueAt = (at: number) =>
    core
      .nextDeadline(current.state)
      .pipe(Option.filter((deadline) => retryAt(deadline) <= at));

  const alarmAt = (socketDeadline: Option.Option<number>) =>
    earliest([
      nextDeadline().pipe(Option.map(({ at }) => at)),
      socketDeadline,
      Option.some(expiresAt()),
    ]);

  const armAlarm = (socketDeadline: Option.Option<number>) => {
    storage.setAlarm(alarmAt(socketDeadline));
  };

  const halt = (reason: string, connections: Connections) => {
    current = { ...current, halted: Option.some(reason) };
    Result.try(() => {
      storage.halt(reason, current.headSeq);
    });
    connections.closeAll("RoomHalted");
  };

  const redactAll = (
    seen: readonly {
      readonly event: T["Event"];
      readonly audience: T["Audience"];
    }[],
    from: number,
    player: PlayerId
  ): Checked<readonly T["Redacted"][]> => {
    const redacted = seen.map(({ audience, event }) =>
      core.redact(event, audience)
    );

    const dropped = redacted.flatMap((form, index) =>
      Option.isNone(form)
        ? [`redact dropped event ${from + index} for player ${player}`]
        : []
    );

    return Arr.isArrayNonEmpty(dropped)
      ? Result.fail(dropped)
      : Result.succeed(Arr.getSomes(redacted));
  };

  const deliveries = (
    next: T["State"],
    events: readonly T["Event"][],
    from: number,
    at: number,
    viewers: readonly Viewer[]
  ): Checked<ReadonlyMap<PlayerId, string>> => {
    const frames = new Map<PlayerId, string>();
    const problems: string[] = [];

    for (const { player } of viewers) {
      if (frames.has(player) || outside(next, player)) {
        continue;
      }

      const audience = core.audienceOf(next, player);

      const seen = events.map((event) => ({ audience, event }));

      Result.match(redactAll(seen, from, player), {
        onFailure: (dropped) => {
          problems.push(...dropped);
        },
        onSuccess: (redacted) => {
          frames.set(
            player,
            codec.encodeFrame(
              codec.server.cases.Events.make({
                events: redacted,
                from: SeqSchema.make(from),
                to: SeqSchema.make(from + events.length - 1),
                view: core.viewFor(next, audience, at),
              })
            )
          );
        },
      });
    }

    return Arr.isArrayNonEmpty(problems)
      ? Result.fail(problems)
      : Result.succeed(frames);
  };

  const batchPersisted = (
    after: number,
    committed: number
  ): Checked<number> => {
    const rows = storage.countEventsAfter(after);

    return rows === committed
      ? Result.succeed(rows)
      : Result.fail([
          `storage holds ${rows} events after ${after}, but the commit wrote ${committed}`,
        ]);
  };

  const unavailable = (reason: UnavailableReason) =>
    codec.reply.cases.Unavailable.make({ reason });

  const crashed = (crash: Crash): CommitResult<T> => ({
    events: [],
    note: CommitNotes.Crashed(crash),
    reply: unavailable("RoomFault"),
  });

  const storedReply = (origin: Origin) =>
    Origins.$match(origin, {
      Member: ({ id, player }) =>
        storage
          .findReply(player, id)
          .pipe(Option.map((text) => ({ id, reply: codec.decodeReply(text) }))),
      Server: () => Option.none(),
    });

  const storeReply = (origin: Origin, reply: Reply<T>) => {
    if (Origins.$is("Member")(origin)) {
      storage.storeReply(origin.player, origin.id, codec.encodeReply(reply));
    }
  };

  const reject = (rejection: T["Rejection"]): CommitResult<T> => {
    const reply = codec.reply.cases.Rejected.make({ rejection });

    return {
      events: [],
      note: CommitNotes.Rejected({ reply: codec.encodeReply(reply) }),
      reply,
    };
  };

  const keepReplies = (
    player: PlayerId,
    replies: readonly { readonly id: CommandId; readonly reply: string }[]
  ) =>
    Result.try({
      catch: (cause) => Inspectable.toStringUnknown(cause, 0),
      try: () => {
        storage.transaction(() => {
          for (const { id, reply } of replies) {
            storage.storeReply(player, id, reply);
          }
        });
      },
    });

  const accept = (
    input: CommitInput<T>,
    events: readonly T["Event"][],
    connections: Connections
  ): CommitResult<T> => {
    const from = current.headSeq + 1;
    const to = current.headSeq + events.length;

    const evolved = Result.try({
      catch: (thrown): Crash => ({
        cause: Inspectable.toStringUnknown(thrown, 0),
        fault: faultNameOf(thrown),
      }),
      try: () => {
        let next = current.state;
        const states: T["State"][] = [];

        for (const event of events) {
          next = core.evolve(next, event);
          states.push(next);
        }

        return { broken: core.invariants(next), next, states };
      },
    });

    if (Result.isFailure(evolved)) {
      return crashed(evolved.failure);
    }

    const { broken, next, states } = evolved.success;

    const prepared = guarded("could not prepare delivery", () =>
      deliveries(next, events, from, input.at, connections.viewers)
    );

    const violations = [
      ...broken,
      ...Result.match(prepared, {
        onFailure: (problems) => problems,
        onSuccess: () => [],
      }),
    ];

    if (Arr.isArrayNonEmpty(violations)) {
      halt(violations.join("; "), connections);

      return {
        events: [],
        note: CommitNotes.Halted({
          from,
          kinds: events.map(core.eventKind),
          violations,
        }),
        reply: unavailable("RoomHalted"),
      };
    }

    const reply = codec.reply.cases.Accepted.make({ seq: SeqSchema.make(to) });

    const stored = Result.try({
      catch: (cause) => Inspectable.toStringUnknown(cause, 0),
      try: () => {
        storage.transaction(() => {
          for (const [index, event] of events.entries()) {
            storage.appendEvent({
              at: input.at,
              event: codec.encodeEvent(event),
              seq: from + index,
            });
          }

          storeReply(input.origin, reply);

          for (const credential of Option.toArray(input.grant)) {
            storage.grant(credential);
          }
        });
      },
    });

    if (Result.isFailure(stored)) {
      return {
        events: [],
        note: CommitNotes.StorageFailed({ cause: stored.failure }),
        reply: unavailable("StorageFailed"),
      };
    }

    const persisted = guarded("could not read the batch back", () =>
      batchPersisted(current.headSeq, events.length)
    );

    if (Result.isFailure(persisted)) {
      halt(persisted.failure.join("; "), connections);

      return {
        events: [],
        note: CommitNotes.Halted({
          from,
          kinds: events.map(core.eventKind),
          violations: persisted.failure,
        }),
        reply: unavailable("RoomHalted"),
      };
    }

    current = {
      ...current,
      credentials: [
        ...current.credentials,
        ...Option.toArray(input.grant).map(hashedCredential),
      ],
      headSeq: to,
      lastEventAt: events.length > 0 ? input.at : current.lastEventAt,
      recent: keepRecent(current.recent, states),
      state: next,
    };

    const frames = Result.getOrElse(
      prepared,
      (): ReadonlyMap<PlayerId, string> => new Map()
    );

    for (const viewer of connections.viewers) {
      const frame = frames.get(viewer.player);

      if (frame !== undefined && events.length > 0) {
        viewer.send(frame);
      }
    }

    for (const player of Arr.dedupe(
      connections.viewers.map((viewer) => viewer.player)
    )) {
      if (core.revoked(next, player)) {
        connections.closePlayer(player, "Removed");
      } else if (Option.isSome(core.knockOf(next, player))) {
        connections.closePlayer(player, "Knocking");
      }
    }

    armAlarm(connections.socketDeadline);

    return { events, note: CommitNotes.Committed({ from, to }), reply };
  };

  const commit = (
    input: CommitInput<T>,
    connections: Connections
  ): CommitResult<T> => {
    if (Option.isSome(current.halted)) {
      return {
        events: [],
        note: CommitNotes.RoomHalted({ reason: current.halted.value }),
        reply: unavailable("RoomHalted"),
      };
    }

    const replayed = storedReply(input.origin);

    if (Option.isSome(replayed)) {
      return {
        events: [],
        note: CommitNotes.Replayed({ id: replayed.value.id }),
        reply: replayed.value.reply,
      };
    }

    const decided = Result.try({
      catch: (thrown): Crash => ({
        cause: Inspectable.toStringUnknown(thrown, 0),
        fault: faultNameOf(thrown),
      }),
      try: () => core.decide(current.state, input.command),
    });

    if (Result.isFailure(decided)) {
      return crashed(decided.failure);
    }

    return Result.match(decided.success, {
      onFailure: reject,
      onSuccess: (events) => accept(input, events, connections),
    });
  };

  const audienceAfter = (seq: number, player: PlayerId) =>
    Option.fromUndefinedOr(
      current.recent.states[seq - current.recent.from]
    ).pipe(Option.map((state) => core.audienceOf(state, player)));

  const catchUpFor = (
    after: Option.Option<number>,
    player: PlayerId
  ): Checked<CatchUp<T>> => {
    const upToDate = codec.catchUp.cases.UpToDate.make({});

    return Option.match(after, {
      onNone: () => Result.succeed(upToDate),
      onSome: (seq) => {
        if (seq >= current.headSeq) {
          return Result.succeed(upToDate);
        }

        const skipped = codec.catchUp.cases.Skipped.make({
          from: SeqSchema.make(seq + 1),
          to: SeqSchema.make(current.headSeq),
        });

        if (current.headSeq - seq > MAX_MISSED_EVENTS) {
          return Result.succeed(skipped);
        }

        const seen = Option.all(
          storage.eventsAfter(seq).map((row) =>
            audienceAfter(row.seq, player).pipe(
              Option.map((audience) => ({
                audience,
                event: codec.decodeEvent(row.event),
              }))
            )
          )
        );

        return Option.match(seen, {
          onNone: () => Result.succeed(skipped),
          onSome: (forms) =>
            redactAll(forms, seq + 1, player).pipe(
              Result.map((events): CatchUp<T> =>
                Arr.isReadonlyArrayNonEmpty(events)
                  ? codec.catchUp.cases.Missed.make({
                      events,
                      from: SeqSchema.make(seq + 1),
                    })
                  : skipped
              )
            ),
        });
      },
    });
  };

  const welcome = (
    player: PlayerId,
    after: Option.Option<number>,
    at: number,
    connections: Connections,
    build: Option.Option<BuildId> = Option.none()
  ) => {
    const audience = core.audienceOf(current.state, player);

    const frame = guarded("could not prepare welcome", () =>
      catchUpFor(after, player).pipe(
        Result.map((caughtUp) =>
          codec.encodeFrame(
            codec.server.cases.Welcome.make({
              build,
              catchUp: caughtUp,
              seq: SeqSchema.make(current.headSeq),
              view: core.viewFor(current.state, audience, at),
              you: player,
            })
          )
        )
      )
    );

    if (Result.isFailure(frame)) {
      halt(frame.failure.join("; "), connections);
    }

    return frame;
  };

  const keepRefusals = (refusals: Option.Option<Refusals>) => {
    current = { ...current, refusals };
    Result.try(() => {
      storage.noteRefusals(refusals);
    });
  };

  const refusalOf = (
    deadline: Deadline<T["Due"]>,
    rejection: string,
    at: number,
    connections: Connections
  ): Pick<DeadlineAnswer<T>, "refused" | "stall"> => {
    const count = Option.match(refusalsOf(deadline), {
      onNone: () => 1,
      onSome: (refusals) => refusals.count + 1,
    });

    const retryInMs = retryDelay(policy, count);
    const stalled = count >= policy.stallAfter;

    keepRefusals(
      Option.some({ count, deadline: keyOf(deadline), retryAt: at + retryInMs })
    );

    return {
      refused: Option.some(
        new RefusedDeadline({
          deadline: core.dueKind(deadline.due),
          refusals: count,
          rejection,
          retryInMs,
          stalled,
        })
      ),
      stall: stalled
        ? core.stalled(current.state, deadline.due, at).pipe(
            Option.map((command) => ({
              command,
              result: commit(
                {
                  at,
                  command,
                  grant: Option.none(),
                  origin: Origins.Server({ trigger: "Stall" }),
                },
                connections
              ),
            }))
          )
        : Option.none(),
    };
  };

  const answerDeadline = (
    deadline: Deadline<T["Due"]>,
    command: T["Command"],
    at: number,
    connections: Connections
  ): DeadlineAnswer<T> => {
    const stillDue = Option.exists(
      core.nextDeadline(current.state),
      (now) => keyOf(now) === keyOf(deadline)
    );

    const result = commit(
      {
        at,
        command,
        grant: Option.none(),
        origin: Origins.Server({ trigger: "Alarm" }),
      },
      connections
    );

    if (
      CommitNotes.$is("Committed")(result.note) &&
      Option.isSome(current.refusals)
    ) {
      keepRefusals(Option.none());
    }

    const refusal = CommitNotes.$match(result.note, {
      Committed: () => Option.none<string>(),
      Crashed: ({ fault }) => Option.some(`the room core threw ${fault}`),
      Halted: () => Option.none<string>(),
      Rejected: () =>
        stillDue && codec.reply.guards.Rejected(result.reply)
          ? Option.some(core.rejectionKind(result.reply.rejection))
          : Option.none(),
      Replayed: () => Option.none<string>(),
      RoomHalted: () => Option.none<string>(),
      StorageFailed: () => Option.none<string>(),
    });

    const refused = Option.match(refusal, {
      onNone: () => ({ refused: Option.none(), stall: Option.none() }),
      onSome: (text) => refusalOf(deadline, text, at, connections),
    });

    return { result, ...refused };
  };

  const keepCommandFaults = (faults: number) => {
    current = { ...current, commandFaults: faults };
    Result.try(() => {
      storage.noteCommandFaults(faults);
    });
  };

  const stallFor = (at: number, connections: Connections) =>
    core.nextDeadline(current.state).pipe(
      Option.flatMap(({ due }) => core.stalled(current.state, due, at)),
      Option.map((command) => ({
        command,
        result: commit(
          {
            at,
            command,
            grant: Option.none(),
            origin: Origins.Server({ trigger: "Stall" }),
          },
          connections
        ),
      }))
    );

  const answerMember = (
    input: CommitInput<T>,
    connections: Connections
  ): MemberAnswer<T> => {
    const result = commit(input, connections);
    const quiet = { fault: Option.none(), result, stall: Option.none() };

    if (!CommitNotes.$is("Crashed")(result.note)) {
      if (
        current.commandFaults > 0 &&
        (CommitNotes.$is("Committed")(result.note) ||
          CommitNotes.$is("Rejected")(result.note))
      ) {
        keepCommandFaults(0);
      }

      return quiet;
    }

    const faults = current.commandFaults + 1;

    keepCommandFaults(faults);

    const stall =
      faults >= policy.stallAfter
        ? stallFor(input.at, connections)
        : Option.none();

    return {
      fault: Option.some(
        new CommandFault({
          command: core.commandKind(input.command),
          fault: result.note.fault,
          faults,
          stalled: Option.exists(stall, ({ result: marked }) =>
            CommitNotes.$is("Committed")(marked.note)
          ),
        })
      ),
      result,
      stall,
    };
  };

  const noteAttendance = (
    connected: readonly PlayerId[],
    at: number,
    connections: Connections
  ) =>
    Option.isSome(current.halted)
      ? Option.none()
      : core.attendance(current.state, connected, at).pipe(
          Option.map((command) => ({
            command,
            result: commit(
              {
                at,
                command,
                grant: Option.none(),
                origin: Origins.Server({ trigger: "Attendance" }),
              },
              connections
            ),
          }))
        );

  const standings = (
    hash: Uint8Array,
    at: number
  ): Standings<T["View"], T["Revoked"], T["Knock"]> => {
    const player = matchCredential(current.credentials, hash);

    const knock = player.pipe(
      Option.flatMap((known) => core.knockOf(current.state, known))
    );

    if (Option.isSome(knock)) {
      return StandingsAnswers.Knocking({ knock: knock.value });
    }

    const removed = player.pipe(
      Option.filter((known) => core.revoked(current.state, known))
    );

    if (Option.isSome(removed)) {
      return StandingsAnswers.Removed({
        revoked: core.revokedView(
          current.state,
          removed.value,
          at,
          Option.isSome(current.halted)
        ),
      });
    }

    return Option.match(current.halted, {
      onNone: () => StandingsAnswers.NotHalted({ headSeq: current.headSeq }),
      onSome: (reason) =>
        Option.match(player, {
          onNone: () => StandingsAnswers.NotAuthorized({ halted: true }),
          onSome: (known) =>
            StandingsAnswers.Halted({
              reason,
              view: core.haltedView(
                current.state,
                core.audienceOf(current.state, known),
                at
              ),
            }),
        }),
    });
  };

  return {
    answerDeadline,
    answerMember,
    armAlarm,
    authenticate: (hash: Uint8Array) =>
      matchCredential(current.credentials, hash),
    codec,
    commit,
    dueAt,
    expiresAt,
    keepReplies,
    knockOf: (player: PlayerId) => core.knockOf(current.state, player),
    knocking: (player: PlayerId) =>
      Option.isSome(core.knockOf(current.state, player)),
    nextDeadline,
    noteAttendance,
    placesHeld: () =>
      current.credentials.filter(({ player }) =>
        core.holdsPlace(current.state, player)
      ).length,
    revoked: (player: PlayerId) => core.revoked(current.state, player),
    snapshot: () => current,
    standings,
    welcome,
  };
};

export type RoomHost<T extends RoomTypes> = ReturnType<typeof hostRoom<T>>;
