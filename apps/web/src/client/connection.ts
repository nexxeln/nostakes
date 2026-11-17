import type { RoomClient } from "@nostakes/client";
import { Effect, Option, Schema } from "effect";
import { ManagedResource } from "foldkit";

import { Messages } from "../features/message.js";
import type { Message } from "../features/message.js";
import { SavedPassSchema } from "../features/model.js";
import type { Model } from "../features/model.js";
import { connectionTarget, roomOf } from "../features/room.js";
import { voiceTargetOf } from "../features/voice.js";
import { socketPath } from "../features/wire.js";
import type { PokerClientTypes } from "../features/wire.js";
import { pageBuild } from "./page-build.js";
import { storedPass } from "./storage.js";
import type { VoiceLine } from "./voice/line.js";

export const RoomConnection =
  ManagedResource.tag<RoomClient<PokerClientTypes>>()("RoomConnection");

export const VoiceLineResource = ManagedResource.tag<VoiceLine>()("VoiceLine");

const VoiceTargetSchema = Schema.Struct({
  code: Schema.String,
  player: Schema.String,
  talk: Schema.Boolean,
});

export const socketUrl = (code: string) => {
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

          const link = yield* Effect.promise(() => import("./room-link.js"));

          const client = yield* link.startedClient(
            socketUrl(code),
            pass.token,
            pageBuild()
          );

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
    voice: entry(Schema.Option(VoiceTargetSchema), {
      acquire: ({ code, talk }) =>
        Effect.promise(() => import("./voice/line.js")).pipe(
          Effect.flatMap(({ openVoiceLine }) => openVoiceLine(code, talk))
        ),
      modelToMaybeRequirements: (model) =>
        roomOf(model).pipe(Option.flatMap(voiceTargetOf)),
      onAcquireError: (failure) =>
        Messages.FailedVoice({ problem: String(failure) }),
      onAcquired: () => Messages.AcquiredVoice(),
      onReleased: () => Messages.ReleasedVoice(),
      release: (line) => line.stop,
      resource: VoiceLineResource,
    }),
  })
);
