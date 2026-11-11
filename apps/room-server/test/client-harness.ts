import {
  Activities,
  clientCodec,
  roomClient,
  SocketEvents,
  Transport,
  webSocketTransport,
} from "@nostakes/client";
import type {
  Activity,
  ClientSchemas,
  RoomClient,
  SocketEvent,
} from "@nostakes/client";
import { PLAYER_FRAME_ALLOWANCE, TokenSchema } from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import { Effect, Layer, Result, Schema, Stream } from "effect";

import { socketUrl } from "./fixtures/room-client.js";
import { ToyRefusal } from "./fixtures/toy-refusal.js";
import {
  ToyMemberCommandSchema,
  ToyRedactedSchema,
  ToySignalSchema,
  ToyViewSchema,
} from "./fixtures/toy-room.js";
import { TEST_ORIGIN } from "./fixtures/toy-worker.js";

export interface ToyClientTypes {
  readonly Command: typeof ToyMemberCommandSchema.Type;
  readonly Event: typeof ToyRedactedSchema.Type;
  readonly View: typeof ToyViewSchema.Type;
  readonly Rejection: ToyRefusal;
  readonly Signal: typeof ToySignalSchema.Type;
}

export const toyClientSchemas: ClientSchemas<ToyClientTypes> = {
  command: ToyMemberCommandSchema,
  event: ToyRedactedSchema,
  rejection: ToyRefusal,
  signal: ToySignalSchema,
  view: ToyViewSchema,
};

export const Commands = ToyMemberCommandSchema.cases;

export const toyClientCodec = clientCodec(toyClientSchemas);

const isReplyFrame = (text: string) =>
  Result.match(toyClientCodec.decodeServerFrame(text), {
    onFailure: () => false,
    onSuccess: toyClientCodec.server.guards.Reply,
  });

const WAKING_PING_FRAME = `${Result.getOrThrow(
  toyClientCodec.encodeClientFrame(toyClientCodec.client.cases.Ping.make({}))
)} `;

export interface Wire {
  readonly label: string;
  readonly opened: () => number;
  readonly received: () => readonly string[];
  readonly closeFromClient: Effect.Effect<void>;
  readonly floodFromClient: Effect.Effect<void>;
  readonly goSilent: Effect.Effect<void>;
  readonly loseNextReply: Effect.Effect<void>;
}

interface Tapped {
  readonly raw: WebSocket;
  silent: boolean;
}

export const tappedWire = (label: string) => {
  const sockets: Tapped[] = [];
  const received: string[] = [];
  let losingReply = false;

  const live = webSocketTransport((url) => {
    const raw = new WebSocket(url, { headers: { origin: TEST_ORIGIN } });

    raw.addEventListener("message", (event) => {
      received.push(String(event.data));
    });
    sockets.push({ raw, silent: false });

    return raw;
  });

  const latest = () => sockets.at(-1);

  const keep = (tapped: Tapped | undefined) => (event: SocketEvent) => {
    if (tapped === undefined) {
      return true;
    }

    if (tapped.silent) {
      return false;
    }

    if (
      losingReply &&
      SocketEvents.$is("Received")(event) &&
      isReplyFrame(event.text)
    ) {
      losingReply = false;
      tapped.raw.close(1000, "reply lost on purpose");

      return false;
    }

    return true;
  };

  const layer = Layer.effect(
    Transport,
    Transport.pipe(
      Effect.map((base) =>
        Transport.of({
          open: (url) =>
            base.open(url).pipe(
              Effect.map((socket) => {
                const tapped = latest();

                return {
                  events: socket.events.pipe(Stream.filter(keep(tapped))),
                  send: (text: string) =>
                    tapped?.silent === true ? Effect.void : socket.send(text),
                };
              })
            ),
        })
      )
    )
  ).pipe(Layer.provide(live));

  const wire: Wire = {
    closeFromClient: Effect.sync(() => {
      latest()?.raw.close(1000, "killed by the test");
    }),
    floodFromClient: Effect.sync(() => {
      const tapped = latest();

      for (
        let frame = 0;
        frame <
        PLAYER_FRAME_ALLOWANCE.burst + 2 * PLAYER_FRAME_ALLOWANCE.perSecond;
        frame += 1
      ) {
        tapped?.raw.send(WAKING_PING_FRAME);
      }
    }),
    goSilent: Effect.sync(() => {
      const tapped = latest();

      if (tapped !== undefined) {
        tapped.silent = true;
      }
    }),
    label,
    loseNextReply: Effect.sync(() => {
      losingReply = true;
    }),
    opened: () => sockets.length,
    received: () => received,
  };

  return { layer, wire };
};

export interface Player {
  readonly pass: RoomPass;
  readonly client: RoomClient<ToyClientTypes>;
  readonly wire: Wire;
  readonly seen: Activity<ToyClientTypes["Event"]>[];
}

export const playerFor = (base: string, pass: RoomPass, label: string) =>
  Effect.gen(function* connectPlayer() {
    const { layer, wire } = tappedWire(label);
    const seen: Activity<ToyClientTypes["Event"]>[] = [];

    const client = yield* roomClient(toyClientSchemas, {
      token: pass.token,
      url: socketUrl(base, pass.code),
    }).pipe(Effect.provide(layer));

    yield* client.activity.pipe(
      Stream.runForEach((item) => Effect.sync(() => seen.push(item))),
      Effect.forkScoped
    );

    const player: Player = { client, pass, seen, wire };

    return player;
  });

export const untilLive = (player: Player) =>
  player.client.states.pipe(
    Stream.filter(({ connection }) => connection === "Live"),
    Stream.runHead,
    Effect.timeout("10 seconds"),
    Effect.orDie
  );

export const until = (
  player: Player,
  reached: (
    state: Effect.Success<RoomClient<ToyClientTypes>["state"]>
  ) => boolean
) =>
  player.client.states.pipe(
    Stream.filter(reached),
    Stream.runHead,
    Effect.timeout("15 seconds"),
    Effect.orDie
  );

export const appliedSeqs = (player: Player) =>
  player.seen.flatMap((item) =>
    Activities.$is("Applied")(item) ? [item.seq] : []
  );

export const skipped = (player: Player) =>
  player.seen.filter(Activities.$is("Skipped"));

export const wrongToken = Schema.decodeSync(TokenSchema)("b".repeat(43));
