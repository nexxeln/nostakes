import { Activities } from "@nostakes/client";
import type { ClientState } from "@nostakes/client";
import { Clock, Effect, Option, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import type { ManagedResource } from "foldkit";

import { Messages } from "../features/message.js";
import type { Message } from "../features/message.js";
import type { Link, Model } from "../features/model.js";
import { clockRunning, roomOf } from "../features/room.js";
import type { PokerClientTypes } from "../features/wire.js";
import { RoomConnection } from "./connection.js";

const TICK = "250 millis";

const linkOf = (
  state: ClientState<PokerClientTypes>,
  receivedAt: number
): Link => ({
  phase: state.connection,
  presence: state.presence,
  receivedAt,
  refusal: state.refusal,
  retryDelayMs: state.retryDelayMs,
  view: state.view,
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

const roomActivity = RoomConnection.get.pipe(
  Effect.map((client) =>
    client.activity.pipe(
      Stream.flatMap(
        Activities.$match({
          Applied: ({ event, seq }) =>
            Stream.make(Messages.AppliedEvent({ event, seq })),
          Skipped: () => Stream.empty,
        })
      )
    )
  ),
  Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty)),
  Stream.unwrap
);

const ticks = Stream.tick(TICK).pipe(
  Stream.mapEffect(() => Clock.currentTimeMillis),
  Stream.map((now) => Messages.Ticked({ now }))
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

export const subscriptions = Subscription.make<
  Model,
  Message,
  ManagedResource.ServiceOf<typeof RoomConnection>
>()((entry) => ({
  activity: entry(
    { connected: Schema.Option(Schema.String) },
    {
      dependenciesToStream: ({ connected }) =>
        Option.isSome(connected) ? roomActivity : Stream.empty,
      modelToDependencies: (model) => ({
        connected: roomOf(model).pipe(
          Option.filter(({ connected }) => connected),
          Option.map(({ code }) => code)
        ),
      }),
    }
  ),
  clock: entry(
    { ticking: Schema.Boolean },
    {
      dependenciesToStream: ({ ticking }) => (ticking ? ticks : Stream.empty),
      modelToDependencies: (model) => ({
        ticking: Option.exists(roomOf(model), clockRunning),
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
