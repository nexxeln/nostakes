import { Transport, webSocketTransport } from "@nostakes/client";
import { Effect, Layer, Result, Stream } from "effect";

import { decodeServerFrame, pokerCodec } from "./poker-socket.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export type LineMode = "Clear" | "BlackHole" | "Deaf";

export interface Line {
  readonly raw: WebSocket;
  readonly offline: boolean;
  mode: LineMode;
  closedByBot: boolean;
}

const UNREACHABLE_URL = "ws://127.0.0.1:9/offline";

const SOCKET_OPEN = 1;

const isEventsFrame = (text: string) =>
  Result.match(decodeServerFrame(text), {
    onFailure: () => false,
    onSuccess: pokerCodec.server.guards.Events,
  });

export const clientWire = () => {
  const lines: Line[] = [];
  const frames: string[] = [];
  const batches: string[] = [];
  let offline = false;
  let echoing = false;

  const live = webSocketTransport((url) => {
    const raw = offline
      ? new WebSocket(UNREACHABLE_URL)
      : new WebSocket(url, { headers: { origin: TEST_ORIGIN } });

    raw.addEventListener("message", (event) => {
      if (echoing) {
        return;
      }

      const text = String(event.data);

      frames.push(text);

      if (isEventsFrame(text)) {
        batches.push(text);
      }
    });
    lines.push({ closedByBot: false, mode: "Clear", offline, raw });

    return raw;
  });

  const layer = Layer.effect(
    Transport,
    Transport.pipe(
      Effect.map((base) =>
        Transport.of({
          open: (url) =>
            base.open(url).pipe(
              Effect.map((socket) => {
                const line = lines.at(-1);

                return {
                  events: socket.events.pipe(
                    Stream.filter(() => line?.mode !== "BlackHole")
                  ),
                  send: (text: string) =>
                    line === undefined || line.mode === "Clear"
                      ? socket.send(text)
                      : Effect.void,
                };
              })
            ),
        })
      )
    )
  ).pipe(Layer.provide(live));

  const closeFromBot = () => {
    const line = lines.at(-1);

    if (line !== undefined && line.raw.readyState <= SOCKET_OPEN) {
      line.closedByBot = true;
      line.raw.close(1000, "dropped by the bot");
    }
  };

  const setMode = (mode: LineMode) => {
    const line = lines.at(-1);

    if (line !== undefined) {
      line.mode = mode;
    }
  };

  return {
    blackHole: () => {
      setMode("BlackHole");
    },
    closeFromBot,
    deafen: () => {
      setMode("Deaf");
    },
    frames: (): readonly string[] => frames,
    goOffline: () => {
      offline = true;
      closeFromBot();
    },
    goOnline: () => {
      offline = false;
    },
    inject: (text: string) => {
      const line = lines.at(-1);

      if (
        line === undefined ||
        line.mode !== "Clear" ||
        line.raw.readyState !== SOCKET_OPEN
      ) {
        return false;
      }

      echoing = true;
      line.raw.dispatchEvent(new MessageEvent("message", { data: text }));
      echoing = false;

      return true;
    },
    lastLine: () => lines.at(-1),
    layer,
    opened: () => lines.filter((line) => !line.offline).length,
    pastBatches: (): readonly string[] => batches,
  };
};

export type ClientWire = ReturnType<typeof clientWire>;
