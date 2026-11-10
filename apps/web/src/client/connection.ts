import { roomClient, webSocketTransport } from "@nostakes/client";
import type { RoomClient } from "@nostakes/client";
import { Effect, Schema } from "effect";
import { ManagedResource } from "foldkit";

import { Messages } from "../features/message.js";
import type { Message } from "../features/message.js";
import { SavedPassSchema } from "../features/model.js";
import type { Model } from "../features/model.js";
import { connectionTarget } from "../features/room.js";
import { pokerClientSchemas, socketPath } from "../features/wire.js";
import type { PokerClientTypes } from "../features/wire.js";
import { storedPass } from "./storage.js";

export const RoomConnection =
  ManagedResource.tag<RoomClient<PokerClientTypes>>()("RoomConnection");

const socketUrl = (code: string) => {
  const url = new URL(socketPath(code), globalThis.location.href);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
};

export const managedResources = ManagedResource.make<Model, Message>()(
  (entry) => ({
    room: entry(Schema.Option(SavedPassSchema), {
      acquire: ({ code }) =>
        Effect.gen(function* openRoomClient() {
          const pass = yield* storedPass(code);

          const client = yield* roomClient(pokerClientSchemas, {
            token: pass.token,
            url: socketUrl(code),
          }).pipe(Effect.provide(webSocketTransport()));

          yield* client.start;

          return client;
        }),
      modelToMaybeRequirements: connectionTarget,
      onAcquireError: (failure) =>
        Messages.FailedConnection({ problem: String(failure) }),
      onAcquired: () => Messages.AcquiredConnection(),
      onReleased: () => Messages.ReleasedConnection(),
      release: (client) => client.stop,
      resource: RoomConnection,
    }),
  })
);
