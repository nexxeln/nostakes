import type { ClientState } from "@nostakes/client";
import { Clock, Effect, Option, Predicate, Ref, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import type { ManagedResource } from "foldkit";

import { Messages } from "../features/message.js";
import type { Message } from "../features/message.js";
import type { Link, Model } from "../features/model.js";
import {
  clockRunning,
  keepsScreenAwake,
  roomOf,
  waitsToClaimHost,
} from "../features/room.js";
import { signalsShowing } from "../features/signals.js";
import type { PokerClientTypes } from "../features/wire.js";
import { RoomConnection } from "./connection.js";
import { DARK_SCHEME, systemTheme } from "./storage.js";

const TICK = "250 millis";

const linkOf = (
  state: ClientState<PokerClientTypes>,
  receivedAt: number
): Link => ({
  newBuild: state.newBuild,
  phase: state.connection,
  presence: state.presence,
  receivedAt,
  refusal: state.refusal,
  retryDelayMs: state.retryDelayMs,
});

const roomLinks = RoomConnection.get.pipe(
  Effect.map((client) =>
    client.states.pipe(
      Stream.mapEffect((state) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((at) => Messages.GotLink({ link: linkOf(state, at) }))
        )
      )
    )
  ),
  Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty)),
  Stream.unwrap
);

const loadRoomLink = Effect.promise(() => import("./room-link.js"));

const roomUpdates = RoomConnection.get.pipe(
  Effect.flatMap((client) =>
    loadRoomLink.pipe(
      Effect.map(({ appliedEvents }) => ({ appliedEvents, client }))
    )
  ),
  Effect.map(({ appliedEvents, client }) =>
    client.updates.pipe(
      Stream.mapEffect(({ activity, seq, view }) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((receivedAt) =>
            Messages.GotUpdate({
              events: appliedEvents(activity),
              receivedAt,
              seq,
              view,
            })
          )
        )
      )
    )
  ),
  Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty)),
  Stream.unwrap
);

const roomSignals = RoomConnection.get.pipe(
  Effect.map((client) =>
    client.signals.pipe(
      Stream.mapEffect(({ from, signal }) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((receivedAt) =>
            Messages.HeardSignal({ from, receivedAt, signal })
          )
        )
      )
    )
  ),
  Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty)),
  Stream.unwrap
);

const roomFairness = (code: string) =>
  RoomConnection.get.pipe(
    Effect.flatMap((client) =>
      Effect.promise(() => import("./fairness.js")).pipe(
        Effect.map(({ fairnessMarks }) => fairnessMarks(client, code))
      )
    ),
    Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty)),
    Stream.unwrap
  );

const ticks = Stream.tick(TICK).pipe(
  Stream.mapEffect(() => Clock.currentTimeMillis),
  Stream.map((now) => Messages.Ticked({ now }))
);

const schemeChanges = Stream.suspend(() =>
  Stream.fromEventListener(globalThis.matchMedia(DARK_SCHEME), "change")
).pipe(Stream.map(() => Messages.ChangedSystemTheme({ theme: systemTheme() })));

const caught = (failure: Error | string) =>
  Predicate.isString(failure)
    ? Messages.CaughtError({ message: failure, name: "Error" })
    : Messages.CaughtError({ message: failure.message, name: failure.name });

const pageErrors = Stream.merge(
  Stream.fromEventListener<ErrorEvent>(globalThis.window, "error").pipe(
    Stream.map((event) =>
      caught(Predicate.isError(event.error) ? event.error : event.message)
    )
  ),
  Stream.fromEventListener<PromiseRejectionEvent>(
    globalThis.window,
    "unhandledrejection"
  ).pipe(
    Stream.map((event) =>
      caught(
        Predicate.isError(event.reason) ? event.reason : "unhandled rejection"
      )
    )
  )
);

const pageVisible = () => globalThis.document.visibilityState === "visible";

const wakes = Stream.merge(
  Stream.fromEventListener(globalThis.document, "visibilitychange").pipe(
    Stream.map(() => Messages.WokePage({ visible: pageVisible() }))
  ),
  Stream.fromEventListener(globalThis.window, "online").pipe(
    Stream.map(() => Messages.WokePage({ visible: true }))
  )
);

const releaseLock = (held: Ref.Ref<Option.Option<WakeLockSentinel>>) =>
  Ref.getAndSet(held, Option.none()).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (sentinel) =>
          Effect.tryPromise(() => sentinel.release()).pipe(Effect.ignore),
      })
    )
  );

const requestLock = (held: Ref.Ref<Option.Option<WakeLockSentinel>>) =>
  pageVisible() && Predicate.hasProperty(globalThis.navigator, "wakeLock")
    ? releaseLock(held).pipe(
        Effect.andThen(
          Effect.tryPromise(() =>
            globalThis.navigator.wakeLock.request("screen")
          )
        ),
        Effect.flatMap((sentinel) => Ref.set(held, Option.some(sentinel))),
        Effect.ignore
      )
    : Effect.void;

const screenAwake = Effect.gen(function* holdTheScreen() {
  const held = yield* Effect.acquireRelease(
    Ref.make(Option.none<WakeLockSentinel>()),
    releaseLock
  );

  yield* requestLock(held);

  return Stream.fromEventListener(globalThis.document, "visibilitychange").pipe(
    Stream.mapEffect(() => requestLock(held)),
    Stream.drain
  );
}).pipe(Stream.unwrap);

export const subscriptions = Subscription.make<
  Model,
  Message,
  ManagedResource.ServiceOf<typeof RoomConnection>
>()((entry) => ({
  clock: entry(
    { ticking: Schema.Boolean },
    {
      dependenciesToStream: ({ ticking }) => (ticking ? ticks : Stream.empty),
      modelToDependencies: (model) => ({
        ticking: Option.exists(
          roomOf(model),
          (room) =>
            clockRunning(room) || signalsShowing(room) || waitsToClaimHost(room)
        ),
      }),
    }
  ),
  errors: entry(
    { counting: Schema.Boolean },
    {
      dependenciesToStream: ({ counting }) =>
        counting ? pageErrors : Stream.empty,
      modelToDependencies: (model) => ({ counting: model.counting }),
    }
  ),
  fairness: entry(
    { connected: Schema.Option(Schema.String) },
    {
      dependenciesToStream: ({ connected }) =>
        Option.match(connected, {
          onNone: () => Stream.empty,
          onSome: roomFairness,
        }),
      modelToDependencies: (model) => ({
        connected: roomOf(model).pipe(
          Option.filter(({ connected }) => connected),
          Option.map(({ code }) => code)
        ),
      }),
    }
  ),
  link: entry(
    { connected: Schema.Option(Schema.String) },
    {
      dependenciesToStream: ({ connected }) =>
        Option.isSome(connected) ? roomLinks : Stream.empty,
      modelToDependencies: (model) => ({
        connected: roomOf(model).pipe(
          Option.filter(({ connected }) => connected),
          Option.map(({ code }) => code)
        ),
      }),
    }
  ),
  scheme: entry(
    { following: Schema.Boolean },
    {
      dependenciesToStream: ({ following }) =>
        following ? schemeChanges : Stream.empty,
      modelToDependencies: (model) => ({
        following: Option.isNone(model.theme),
      }),
    }
  ),
  screen: entry(
    { awake: Schema.Boolean },
    {
      dependenciesToStream: ({ awake }) => (awake ? screenAwake : Stream.empty),
      modelToDependencies: (model) => ({
        awake: Option.exists(roomOf(model), keepsScreenAwake),
      }),
    }
  ),
  signals: entry(
    { connected: Schema.Option(Schema.String) },
    {
      dependenciesToStream: ({ connected }) =>
        Option.isSome(connected) ? roomSignals : Stream.empty,
      modelToDependencies: (model) => ({
        connected: roomOf(model).pipe(
          Option.filter(({ connected }) => connected),
          Option.map(({ code }) => code)
        ),
      }),
    }
  ),
  updates: entry(
    { connected: Schema.Option(Schema.String) },
    {
      dependenciesToStream: ({ connected }) =>
        Option.isSome(connected) ? roomUpdates : Stream.empty,
      modelToDependencies: (model) => ({
        connected: roomOf(model).pipe(
          Option.filter(({ connected }) => connected),
          Option.map(({ code }) => code)
        ),
      }),
    }
  ),
  wake: entry(
    { inRoom: Schema.Boolean },
    {
      dependenciesToStream: ({ inRoom }) => (inRoom ? wakes : Stream.empty),
      modelToDependencies: (model) => ({
        inRoom: Option.isSome(roomOf(model)),
      }),
    }
  ),
}));
