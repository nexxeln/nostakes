import { Transport, webSocketTransport } from "@nostakes/client";
import { Effect, Layer, Option, Result, Stream } from "effect";

import { decodeServerFrame, pokerCodec } from "./poker-socket.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export type LineMode = "Clear" | "BlackHole" | "Deaf";

export interface Line {
  readonly raw: WebSocket;
  readonly offline: boolean;
  readonly received: string[];
  mode: LineMode;
  closedByBot: boolean;
}

export interface PastBatch {
  readonly text: string;
  readonly to: number;
}

const UNREACHABLE_URL = "ws://127.0.0.1:9/offline";

const SOCKET_OPEN = 1;

const batchEnd = (text: string) =>
  decodeServerFrame(text).pipe(
    Result.getSuccess,
    Option.filter(pokerCodec.server.guards.Events),
    Option.map(({ to }) => to)
  );

export const describeFrame = (text: string) =>
  Result.match(decodeServerFrame(text), {
    onFailure: () => "undecodable",
    onSuccess: (message) =>
      pokerCodec.server.match(message, {
        Closing: ({ reason }) => `Closing ${reason}`,
        Events: ({ from, to }) => `Events ${from}..${to}`,
        Pong: () => "Pong",
        Presence: () => "Presence",
        Reply: ({ id }) => `Reply ${id}`,
        Welcome: ({ catchUp, seq }) =>
          `Welcome ${seq} ${pokerCodec.catchUp.match(catchUp, {
            Missed: ({ events, from }) => `missed ${from}+${events.length}`,
            Skipped: ({ from, to }) => `skipped ${from}..${to}`,
            UpToDate: () => "up to date",
          })}`,
      }),
  });

export const clientWire = () => {
  const lines: Line[] = [];
  const frames: string[] = [];
  const batches: PastBatch[] = [];
  const echoes: string[] = [];
  let offline = false;
  let echoing = false;

  const live = webSocketTransport((url) => {
    const raw = offline
      ? new WebSocket(UNREACHABLE_URL)
      : new WebSocket(url, { headers: { origin: TEST_ORIGIN } });

    const received: string[] = [];

    raw.addEventListener("message", (event) => {
      const text = String(event.data);

      received.push(echoing ? `echo ${text}` : text);

      if (echoing) {
        return;
      }

      frames.push(text);

      for (const to of Option.toArray(batchEnd(text))) {
        batches.push({ text, to });
      }
    });
    lines.push({ closedByBot: false, mode: "Clear", offline, raw, received });

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
    echoes: (): readonly string[] => echoes,
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
      echoes.push(describeFrame(text));
      line.raw.dispatchEvent(new MessageEvent("message", { data: text }));
      echoing = false;

      return true;
    },
    lastLine: () => lines.at(-1),
    layer,
    opened: () => lines.filter((line) => !line.offline).length,
    pastBatches: (applied: number): readonly string[] =>
      batches.flatMap(({ text, to }) => (to <= applied ? [text] : [])),
  };
};

export type ClientWire = ReturnType<typeof clientWire>;
