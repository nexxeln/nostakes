import {
  CommandIdSchema,
  fullBucket,
  MAX_FRAME_BYTES,
  SIGNAL_ALLOWANCE,
  spendToken,
} from "@nostakes/protocol";
import type {
  BuildId,
  CloseReason,
  CommandId,
  PlayerId,
  Seq,
  Token,
} from "@nostakes/protocol";
import {
  createEffectActor,
  snapshots,
  taggedState,
  waitFor,
} from "@xstate/effect";
import {
  Clock,
  Deferred,
  Effect,
  Exit,
  Option,
  PubSub,
  Random,
  Ref,
  Result,
  Stream,
} from "effect";
import type { Scope } from "effect";
import type { SnapshotFrom } from "xstate";

import type {
  Activity,
  DropReason,
  ReceivedSignal,
  RoomUpdate,
} from "./client-events.js";
import { clientCodec, frameBytes } from "./codec.js";
import type { ClientSchemas, ReplyResult, RoomTypes } from "./codec.js";
import { ClientRefused } from "./errors/client-refused.js";
import { ClientStopped } from "./errors/client-stopped.js";
import { CommandCancelled } from "./errors/command-cancelled.js";
import { CommandInvalid } from "./errors/command-invalid.js";
import { CommandTooLarge } from "./errors/command-too-large.js";
import { SignalInvalid } from "./errors/signal-invalid.js";
import { roomClientMachine } from "./machine.js";
import type { RoomClientMachine } from "./machine.js";
import type { Transport } from "./transport.js";

export type ConnectionPhase =
  | "Idle"
  | "Connecting"
  | "Greeting"
  | "Live"
  | "Waiting"
  | "Refused"
  | "Outdated"
  | "Stopped";

export interface ClientState<T extends RoomTypes> {
  readonly connection: ConnectionPhase;
  readonly view: Option.Option<T["View"]>;
  readonly seq: Option.Option<Seq>;
  readonly you: Option.Option<PlayerId>;
  readonly presence: readonly PlayerId[];
  readonly pending: readonly CommandId[];
  readonly waitingForTable: readonly CommandId[];
  readonly failures: number;
  readonly retryDelayMs: Option.Option<number>;
  readonly drop: Option.Option<DropReason>;
  readonly refusal: Option.Option<CloseReason>;
  readonly newBuild: Option.Option<BuildId>;
}

export type LocalCancelOutcome =
  | "NeverSentWillNotApply"
  | "AlreadySentMayStillApply"
  | "NotPending";

export type CommandFailure = ClientRefused | ClientStopped | CommandCancelled;

export type CommandRejectedLocally = CommandInvalid | CommandTooLarge;

export type SignalOutcome = "Sent" | "NotLive" | "OverLimit";

export interface IssuedCommand<T extends RoomTypes> {
  readonly id: CommandId;
  readonly reply: Effect.Effect<ReplyResult<T>, CommandFailure>;
}

export interface RoomClient<T extends RoomTypes> {
  readonly start: Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
  readonly wake: Effect.Effect<void>;
  readonly issue: (
    command: T["Command"]
  ) => Effect.Effect<
    IssuedCommand<T>,
    CommandRejectedLocally | ClientRefused | ClientStopped
  >;
  readonly send: (
    command: T["Command"]
  ) => Effect.Effect<ReplyResult<T>, CommandRejectedLocally | CommandFailure>;
  readonly cancelLocally: (id: CommandId) => Effect.Effect<LocalCancelOutcome>;
  readonly signal: (
    signal: T["Signal"]
  ) => Effect.Effect<SignalOutcome, SignalInvalid>;
  readonly signals: Stream.Stream<ReceivedSignal<T>>;
  readonly state: Effect.Effect<ClientState<T>>;
  readonly states: Stream.Stream<ClientState<T>>;
  readonly activity: Stream.Stream<Activity<T["Event"]>>;
  readonly updates: Stream.Stream<RoomUpdate<T>>;
}

interface NumberedUpdate<T extends RoomTypes> {
  readonly number: number;
  readonly update: RoomUpdate<T>;
}

interface LatestUpdate<T extends RoomTypes> {
  update: Option.Option<NumberedUpdate<T>>;
}

export interface RoomClientOptions {
  readonly url: string;
  readonly token: Token;
  readonly build?: BuildId;
}

const PHASES = {
  Idle: "Idle",
  "Online.Connecting": "Connecting",
  "Online.Greeting": "Greeting",
  "Online.Live": "Live",
  Outdated: "Outdated",
  Refused: "Refused",
  Stopped: "Stopped",
  "Waiting.Drawing": "Waiting",
  "Waiting.Sleeping": "Waiting",
} as const satisfies Record<string, ConnectionPhase>;

type PhaseTag = keyof typeof PHASES;

const isPhaseTag = (tag: string): tag is PhaseTag => Object.hasOwn(PHASES, tag);

const phaseOf = (tag: string): ConnectionPhase =>
  isPhaseTag(tag) ? PHASES[tag] : "Idle";

const ID_SPACE = 2_147_483_647;

const clientPrefix = Effect.all([
  Random.nextIntBetween(0, ID_SPACE),
  Random.nextIntBetween(0, ID_SPACE),
]).pipe(Effect.map(([high, low]) => `${high.toString(36)}${low.toString(36)}`));

export const roomClient = <T extends RoomTypes>(
  schemas: ClientSchemas<T>,
  options: RoomClientOptions
): Effect.Effect<RoomClient<T>, never, Transport | Scope.Scope> =>
  Effect.gen(function* buildRoomClient() {
    const codec = clientCodec(schemas);
    const machine: RoomClientMachine<T> = roomClientMachine(codec);
    const prefix = yield* clientPrefix;
    const issued = yield* Ref.make(0);
    const activity = yield* PubSub.unbounded<Activity<T["Event"]>>();
    const updates = yield* PubSub.unbounded<NumberedUpdate<T>>();

    const latest: LatestUpdate<T> = {
      update: Option.none(),
    };

    const signals = yield* PubSub.unbounded<ReceivedSignal<T>>();

    const signalBucket = yield* Ref.make(
      fullBucket(SIGNAL_ALLOWANCE, yield* Clock.currentTimeMillis)
    );

    const waiting = new Map<
      CommandId,
      Deferred.Deferred<ReplyResult<T>, CommandFailure>
    >();

    const actor = yield* createEffectActor(machine, {
      input: {
        build: Option.fromUndefinedOr(options.build),
        token: options.token,
        url: options.url,
      },
    });

    const stateOf = (
      snapshot: SnapshotFrom<RoomClientMachine<T>>
    ): ClientState<T> => {
      const connection = phaseOf(taggedState(snapshot)._tag);
      const { context } = snapshot;

      return {
        connection,
        drop: context.drop,
        failures: context.failures,
        newBuild: context.newBuild,
        pending: context.pending.map(({ id }) => id),
        presence: context.presence,
        refusal: context.refusal,
        retryDelayMs:
          connection === "Waiting"
            ? Option.some(context.retryDelayMs)
            : Option.none(),
        seq: context.applied,
        view: context.view,
        waitingForTable: context.owed.late,
        you: context.you,
      };
    };

    const ending = (id: CommandId) => {
      const snapshot = actor.getSnapshot();

      return Option.match(
        stateOf(snapshot).connection === "Outdated"
          ? Option.some<CloseReason>("ClientOutdated")
          : snapshot.context.refusal,
        {
          onNone: () => new ClientStopped({ id }),
          onSome: (reason) => new ClientRefused({ id, reason }),
        }
      );
    };

    const settle = (
      id: CommandId,
      exit: Exit.Exit<ReplyResult<T>, CommandFailure>
    ) => {
      const deferred = waiting.get(id);

      waiting.delete(id);

      if (deferred !== undefined) {
        Deferred.doneUnsafe(deferred, exit);
      }
    };

    const abandonAll = () => {
      for (const id of waiting.keys()) {
        settle(id, Exit.fail(ending(id)));
      }
    };

    const listeners = [
      actor.on("Applied", ({ activity: items, seq, view }) => {
        const numbered = {
          number: Option.match(latest.update, {
            onNone: () => 0,
            onSome: ({ number }) => number + 1,
          }),
          update: { activity: items, seq, view },
        };

        latest.update = Option.some(numbered);
        PubSub.publishUnsafe(updates, numbered);

        for (const item of items) {
          PubSub.publishUnsafe(activity, item);
        }
      }),
      actor.on("Replied", ({ id, result }) => {
        settle(id, Exit.succeed(result));
      }),
      actor.on("Signalled", ({ from, signal }) => {
        PubSub.publishUnsafe(signals, { from, signal });
      }),
    ];

    const finished = actor.subscribe({
      complete: abandonAll,
      error: abandonAll,
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const listener of listeners) {
          listener.unsubscribe();
        }

        finished.unsubscribe();
        abandonAll();
      })
    );

    const nextId = Ref.modify(issued, (count) => [
      CommandIdSchema.make(`${prefix}-${count + 1}`),
      count + 1,
    ]);

    const checkFrame = (id: CommandId, command: T["Command"]) =>
      Result.match(
        codec.encodeClientFrame(
          codec.client.cases.Command.make({ command, id })
        ),
        {
          onFailure: (issue) =>
            Effect.fail(new CommandInvalid({ issue: issue.message })),
          onSuccess: (frame) => {
            const bytes = frameBytes(frame);

            return bytes > MAX_FRAME_BYTES
              ? Effect.fail(
                  new CommandTooLarge({ bytes, limit: MAX_FRAME_BYTES })
                )
              : Effect.void;
          },
        }
      );

    const issue = (command: T["Command"]) =>
      Effect.gen(function* issueCommand() {
        const id = yield* nextId;

        yield* checkFrame(id, command);

        if (actor.getSnapshot().status !== "active") {
          return yield* ending(id);
        }

        const deferred = Deferred.makeUnsafe<ReplyResult<T>, CommandFailure>();

        waiting.set(id, deferred);
        actor.send({ command, id, type: "Issue" });

        return { id, reply: Deferred.await(deferred) };
      });

    const cancelLocally = (id: CommandId) =>
      Effect.sync((): LocalCancelOutcome => {
        const snapshot = actor.getSnapshot();
        const deferred = waiting.get(id);
        const known = snapshot.context.pending.find((entry) => entry.id === id);

        if (deferred === undefined || snapshot.status !== "active") {
          return "NotPending";
        }

        const phase = stateOf(snapshot).connection;

        const mayStillApply =
          known?.sent === true || phase === "Live" || phase === "Greeting";

        actor.send({ id, type: "Cancel" });
        settle(id, Exit.fail(new CommandCancelled({ id, mayStillApply })));

        return mayStillApply
          ? "AlreadySentMayStillApply"
          : "NeverSentWillNotApply";
      });

    const sendSignal = (signal: T["Signal"]) =>
      Effect.gen(function* signalOnce() {
        yield* Result.match(
          codec.encodeClientFrame(
            codec.client.cases.Signal.make({ signal }, { disableChecks: true })
          ),
          {
            onFailure: (problem) =>
              Effect.fail(new SignalInvalid({ issue: problem.message })),
            onSuccess: () => Effect.void,
          }
        );

        if (stateOf(actor.getSnapshot()).connection !== "Live") {
          return "NotLive" as const;
        }

        const at = yield* Clock.currentTimeMillis;

        const allowed = yield* Ref.modify(signalBucket, (bucket) =>
          Option.match(spendToken(SIGNAL_ALLOWANCE, bucket, at), {
            onNone: () => [false, bucket] as const,
            onSome: (spent) => [true, spent] as const,
          })
        );

        if (!allowed) {
          return "OverLimit" as const;
        }

        actor.send({ signal, type: "SendSignal" });

        return "Sent" as const;
      });

    const client: RoomClient<T> = {
      activity: Stream.fromPubSub(activity),
      cancelLocally,
      issue,
      send: (command) =>
        issue(command).pipe(Effect.flatMap(({ reply }) => reply)),
      signal: sendSignal,
      signals: Stream.fromPubSub(signals),
      start: Effect.sync(() => {
        actor.send({ type: "Start" });
      }),
      state: Effect.sync(() => stateOf(actor.getSnapshot())),
      states: snapshots(actor).pipe(Stream.map(stateOf)),
      stop: Effect.sync(() => {
        actor.send({ type: "Stop" });
      }).pipe(
        Effect.andThen(
          waitFor(actor, (snapshot) => snapshot.status !== "active").pipe(
            Effect.ignore
          )
        )
      ),
      updates: Stream.unwrap(
        PubSub.subscribe(updates).pipe(
          Effect.map((subscription) => {
            const caughtUp = latest.update;

            const after = Option.match(caughtUp, {
              onNone: () => -1,
              onSome: ({ number }) => number,
            });

            return Stream.concat(
              Stream.fromIterable(
                Option.toArray(caughtUp).map(
                  ({ update: { seq, view } }): RoomUpdate<T> => ({
                    activity: [],
                    seq,
                    view,
                  })
                )
              ),
              Stream.fromSubscription(subscription).pipe(
                Stream.filter(({ number }) => number > after),
                Stream.map(({ update }) => update)
              )
            );
          })
        )
      ),
      wake: Effect.sync(() => {
        actor.send({ type: "Wake" });
      }),
    };

    return client;
  });
