import { SeqSchema, MAX_MISSED_EVENTS } from "@nostakes/protocol";
import type { CommandId, PlayerId, RoomCode } from "@nostakes/protocol";
import { Array as Arr, Data, Inspectable, Option, Order, Result } from "effect";

import { hashedCredential, matchCredential } from "./credentials.js";
import type { HashedCredential } from "./credentials.js";
import type { HostedRoom, OpenInput, RoomTypes } from "./hosted-room.js";
import { roomCodec } from "./room-codec.js";
import type { Reply } from "./room-codec.js";
import type { Credential, RoomStorage, StoredEvent } from "./room-storage.js";

export interface Viewer {
  readonly player: PlayerId;
  readonly send: (frame: string) => void;
}

export interface Connections {
  readonly viewers: readonly Viewer[];
  readonly helloDeadline: Option.Option<number>;
  readonly closeAll: (frame: string) => void;
}

export type Origin = Data.TaggedEnum<{
  Member: { readonly player: PlayerId; readonly id: CommandId };
  Server: { readonly trigger: "Alarm" | "Join" };
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
  Rejected: { readonly stored: boolean };
  Committed: { readonly from: number; readonly to: number };
  StorageFailed: { readonly cause: string };
  Halted: { readonly violations: readonly string[]; readonly events: string };
  RoomHalted: { readonly reason: string };
}>;

export const CommitNotes = Data.taggedEnum<CommitNote>();

export interface CommitResult<T extends RoomTypes> {
  readonly reply: Reply<T>;
  readonly note: CommitNote;
}

export interface RecentStates<State> {
  readonly from: number;
  readonly states: readonly State[];
}

export interface HostState<T extends RoomTypes> {
  readonly code: RoomCode;
  readonly state: T["State"];
  readonly headSeq: number;
  readonly halted: Option.Option<string>;
  readonly credentials: readonly HashedCredential[];
  readonly recent: RecentStates<T["State"]>;
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

const gapsIn = (rows: readonly StoredEvent[]) =>
  rows.flatMap((row, index) =>
    row.seq === index + 1
      ? []
      : [`stored event ${index + 1} has sequence number ${row.seq}`]
  );

export const loadRoom = <T extends RoomTypes>(
  core: HostedRoom<T>,
  storage: RoomStorage
): Option.Option<HostState<T>> =>
  storage.meta().pipe(
    Option.map((meta): HostState<T> => {
      const { decodeEvent } = roomCodec(core);
      const rows = storage.eventsAfter(0);
      const gaps = gapsIn(rows);
      const events = rows.map((row) => decodeEvent(row.event));
      const split = Math.max(1, events.length - MAX_MISSED_EVENTS);
      let state = core.replay(events.slice(0, split));
      const states = [state];

      for (const event of events.slice(split)) {
        state = core.evolve(state, event);
        states.push(state);
      }

      const violations = [...gaps, ...core.invariants(state)];

      return {
        code: meta.code,
        credentials: storage.credentials().map(hashedCredential),
        halted: Arr.isArrayNonEmpty(violations)
          ? Option.some(violations.join("; "))
          : meta.halted,
        headSeq: rows.at(-1)?.seq ?? 0,
        recent: { from: rows[split - 1]?.seq ?? 0, states },
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

  storage.transaction(() => {
    storage.create(input.code);
    storage.grant(credential);

    for (const [index, event] of core.open(input).entries()) {
      storage.appendEvent({
        at: input.at,
        event: encodeEvent(event),
        seq: index + 1,
      });
    }
  });
};

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
  loaded: HostState<T>
) => {
  const codec = roomCodec(core);
  let current = loaded;

  const closingFrame = codec.encodeFrame(
    codec.server.cases.Closing.make({ reason: "RoomHalted" })
  );

  const alarmAt = (helloDeadline: Option.Option<number>) =>
    earliest([
      core.nextDeadline(current.state).pipe(Option.map(({ at }) => at)),
      helloDeadline,
    ]);

  const armAlarm = (helloDeadline: Option.Option<number>) => {
    storage.setAlarm(alarmAt(helloDeadline));
  };

  const halt = (reason: string, connections: Connections) => {
    current = { ...current, halted: Option.some(reason) };
    Result.try(() => {
      storage.halt(reason);
    });
    connections.closeAll(closingFrame);
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
      if (frames.has(player)) {
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

  const unavailable = (reason: "RoomHalted" | "StorageFailed") =>
    codec.reply.cases.Unavailable.make({ reason });

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

  const reject = (
    input: CommitInput<T>,
    rejection: T["Rejection"]
  ): CommitResult<T> => {
    const reply = codec.reply.cases.Rejected.make({ rejection });

    const stored = Result.try({
      catch: (cause) => Inspectable.toStringUnknown(cause, 0),
      try: () => {
        storage.transaction(() => {
          storeReply(input.origin, reply);
        });
      },
    });

    return Result.match(stored, {
      onFailure: (cause) => ({
        note: CommitNotes.StorageFailed({ cause }),
        reply: unavailable("StorageFailed"),
      }),
      onSuccess: () => ({
        note: CommitNotes.Rejected({
          stored: Origins.$is("Member")(input.origin),
        }),
        reply,
      }),
    });
  };

  const accept = (
    input: CommitInput<T>,
    events: readonly T["Event"][],
    connections: Connections
  ): CommitResult<T> => {
    const from = current.headSeq + 1;
    const to = current.headSeq + events.length;
    let next = current.state;
    const states: T["State"][] = [];

    for (const event of events) {
      next = core.evolve(next, event);
      states.push(next);
    }

    const prepared = guarded("could not prepare delivery", () =>
      deliveries(next, events, from, input.at, connections.viewers)
    );

    const violations = [
      ...core.invariants(next),
      ...Result.match(prepared, {
        onFailure: (problems) => problems,
        onSuccess: () => [],
      }),
    ];

    if (Arr.isArrayNonEmpty(violations)) {
      halt(violations.join("; "), connections);

      return {
        note: CommitNotes.Halted({
          events: Inspectable.toStringUnknown(events, 0),
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
        note: CommitNotes.StorageFailed({ cause: stored.failure }),
        reply: unavailable("StorageFailed"),
      };
    }

    current = {
      ...current,
      credentials: [
        ...current.credentials,
        ...Option.toArray(input.grant).map(hashedCredential),
      ],
      headSeq: to,
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

    armAlarm(connections.helloDeadline);

    return { note: CommitNotes.Committed({ from, to }), reply };
  };

  const commit = (
    input: CommitInput<T>,
    connections: Connections
  ): CommitResult<T> => {
    if (Option.isSome(current.halted)) {
      return {
        note: CommitNotes.RoomHalted({ reason: current.halted.value }),
        reply: unavailable("RoomHalted"),
      };
    }

    const replayed = storedReply(input.origin);

    if (Option.isSome(replayed)) {
      return {
        note: CommitNotes.Replayed({ id: replayed.value.id }),
        reply: replayed.value.reply,
      };
    }

    return Result.match(core.decide(current.state, input.command), {
      onFailure: (rejection) => reject(input, rejection),
      onSuccess: (events) => accept(input, events, connections),
    });
  };

  const audienceAfter = (seq: number, player: PlayerId) =>
    Option.fromUndefinedOr(
      current.recent.states[seq - current.recent.from]
    ).pipe(Option.map((state) => core.audienceOf(state, player)));

  const missedSince = (
    after: Option.Option<number>,
    player: PlayerId
  ): Checked<readonly T["Redacted"][]> =>
    Option.match(after, {
      onNone: () => Result.succeed([]),
      onSome: (seq) => {
        if (
          seq >= current.headSeq ||
          current.headSeq - seq > MAX_MISSED_EVENTS
        ) {
          return Result.succeed([]);
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
          onNone: () => Result.succeed([]),
          onSome: (forms) => redactAll(forms, seq + 1, player),
        });
      },
    });

  const welcome = (
    player: PlayerId,
    after: Option.Option<number>,
    at: number,
    connections: Connections
  ) => {
    const audience = core.audienceOf(current.state, player);

    const frame = guarded("could not prepare welcome", () =>
      missedSince(after, player).pipe(
        Result.map((missed) =>
          codec.encodeFrame(
            codec.server.cases.Welcome.make({
              missed,
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

  return {
    armAlarm,
    authenticate: (hash: Uint8Array) =>
      matchCredential(current.credentials, hash),
    codec,
    commit,
    nextDeadline: () => core.nextDeadline(current.state),
    snapshot: () => current,
    welcome,
  };
};

export type RoomHost<T extends RoomTypes> = ReturnType<typeof hostRoom<T>>;
