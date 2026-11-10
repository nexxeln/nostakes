import { Activities, roomClient, webSocketTransport } from "@nostakes/client";
import type { RoomUpdate } from "@nostakes/client";
import type { BuildId, RoomPass } from "@nostakes/protocol";
import { Effect, Option } from "effect";

import { pokerClientSchemas } from "../features/wire.js";
import type { PokerClientTypes } from "../features/wire.js";

export const appliedEvents = (
  activity: RoomUpdate<PokerClientTypes>["activity"]
) =>
  activity.flatMap(
    Activities.$match({
      Applied: ({ event, seq }) => [{ event, seq }],
      Skipped: () => [],
    })
  );

export const startedClient = (
  url: string,
  token: RoomPass["token"],
  build: Option.Option<BuildId>
) =>
  roomClient(pokerClientSchemas, {
    token,
    url,
    ...Option.match(build, {
      onNone: () => ({}),
      onSome: (known) => ({ build: known }),
    }),
  }).pipe(
    Effect.provide(webSocketTransport()),
    Effect.tap((client) => client.start)
  );
