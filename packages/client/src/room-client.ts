import { CommandIdSchema, MAX_FRAME_BYTES } from "@nostakes/protocol";
import type {
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

import type { Activity, DropReason, RoomUpdate } from "./client-events.js";
import { clientCodec, frameBytes } from "./codec.js";
import type { ClientSchemas, ReplyResult, RoomTypes } from "./codec.js";
import { ClientRefused } from "./errors/client-refused.js";
import { ClientStopped } from "./errors/client-stopped.js";
import { CommandCancelled } from "./errors/command-cancelled.js";
import { CommandInvalid } from "./errors/command-invalid.js";
import { CommandTooLarge } from "./errors/command-too-large.js";
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
}

export type LocalCancelOutcome =
  | "NeverSentWillNotApply"
  | "AlreadySentMayStillApply"
  | "NotPending";

export type CommandFailure = ClientRefused | ClientStopped | CommandCancelled;

export type CommandRejectedLocally = CommandInvalid | CommandTooLarge;

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
  readonly state: Effect.Effect<ClientState<T>>;
  readonly states: Stream.Stream<ClientState<T>>;
  readonly activity: Stream.Stream<Activity<T["Event"]>>;
  readonly updates: Stream.Stream<RoomUpdate<T>>;
}

export interface RoomClientOptions {
  readonly url: string;
  readonly token: Token;
}

const PHASES = {
  Idle: "Idle",
  "Online.Connecting": "Connecting",
  "Online.Greeting": "Greeting",
  "Online.Live": "Live",
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
    const updates = yield* PubSub.unbounded<RoomUpdate<T>>();

    const waiting = new Map<
      CommandId,
      Deferred.Deferred<ReplyResult<T>, CommandFailure>
    >();

    const actor = yield* createEffectActor(machine, {
      input: { token: options.token, url: options.url },
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

    const ending = (id: CommandId) =>
      Option.match(actor.getSnapshot().context.refusal, {
        onNone: () => new ClientStopped({ id }),
        onSome: (reason) => new ClientRefused({ id, reason }),
      });

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
        PubSub.publishUnsafe(updates, { activity: items, seq, view });

        for (const item of items) {
          PubSub.publishUnsafe(activity, item);
        }
      }),
      actor.on("Replied", ({ id, result }) => {
        settle(id, Exit.succeed(result));
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

    const client: RoomClient<T> = {
      activity: Stream.fromPubSub(activity),
      cancelLocally,
      issue,
      send: (command) =>
        issue(command).pipe(Effect.flatMap(({ reply }) => reply)),
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
      updates: Stream.fromPubSub(updates),
      wake: Effect.sync(() => {
        actor.send({ type: "Wake" });
      }),
    };

    return client;
  });
