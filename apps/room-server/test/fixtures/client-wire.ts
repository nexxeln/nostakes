import { Transport, webSocketTransport } from "@nostakes/client";
import { PING_FRAME } from "@nostakes/protocol";
import { Effect, Layer, Option, Result, Schema, Stream } from "effect";

import { decodeServerFrame, pokerCodec, wallClock } from "./poker-socket.js";
import type { Arrival, PokerServerMessage } from "./poker-socket.js";
import { TEST_ORIGIN } from "./toy-worker.js";

export type LineMode = "Clear" | "BlackHole" | "Deaf";

const DEADNESS: Readonly<Record<LineMode, number>> = {
  BlackHole: 2,
  Clear: 0,
  Deaf: 1,
};

export interface Line {
  readonly number: number;
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

export interface Moment {
  readonly at: number;
  readonly what: string;
}

export interface Timeline {
  readonly note: (what: string) => void;
  readonly moments: () => readonly Moment[];
}

export const timeline = (): Timeline => {
  const moments: Moment[] = [];

  return {
    moments: () => moments,
    note: (what) => {
      moments.push({ at: wallClock(), what });
    },
  };
};

const UNREACHABLE_URL = "ws://127.0.0.1:9/offline";

const SOCKET_OPEN = 1;

const decodeClientFrame = Schema.decodeUnknownResult(
  Schema.fromJsonString(pokerCodec.client)
);

const describeMessage = (message: PokerServerMessage) =>
  pokerCodec.server.match(message, {
    Closing: ({ reason }) => `Closing ${reason}`,
    Events: ({ from, to }) => `Events ${from}..${to}`,
    Pong: () => "Pong",
    Presence: ({ connected }) => `Presence ${connected.length}`,
    Reply: ({ id, result }) => `Reply ${id} ${result._tag}`,
    Welcome: ({ catchUp, seq }) =>
      `Welcome ${seq} ${pokerCodec.catchUp.match(catchUp, {
        Missed: ({ events, from }) => `missed ${from}+${events.length}`,
        Skipped: ({ from, to }) => `skipped ${from}..${to}`,
        UpToDate: () => "up to date",
      })}`,
  });

export const describeFrame = (text: string) =>
  Result.match(decodeServerFrame(text), {
    onFailure: () => "undecodable",
    onSuccess: describeMessage,
  });

const describeSent = (text: string) =>
  text === PING_FRAME
    ? "Ping"
    : Result.match(decodeClientFrame(text), {
        onFailure: () => "undecodable",
        onSuccess: (message) =>
          pokerCodec.client.match(message, {
            Command: ({ command, id }) => `Command ${id} ${command._tag}`,
            Hello: ({ after }) =>
              `Hello after ${Option.match(after, {
                onNone: () => "none",
                onSome: String,
              })}`,
            Ping: () => "Ping",
          }),
      });

export const clientWire = (journal: Timeline) => {
  const { note } = journal;
  const lines: Line[] = [];
  const frames: string[] = [];
  const arrivals: Arrival[] = [];
  const batches: PastBatch[] = [];
  const echoes: string[] = [];
  let offline = false;
  let echoing = false;

  const live = webSocketTransport((url) => {
    const raw = offline
      ? new WebSocket(UNREACHABLE_URL)
      : new WebSocket(url, { headers: { origin: TEST_ORIGIN } });

    const number = lines.length + 1;
    const received: string[] = [];

    note(`line ${number} dialed${offline ? " while offline" : ""}`);
    raw.addEventListener("open", () => {
      note(`line ${number} open`);
    });
    raw.addEventListener("close", (event) => {
      note(`line ${number} closed ${event.code} ${event.reason}`);
    });
    raw.addEventListener("message", (event) => {
      const text = String(event.data);
      const decoded = Result.getSuccess(decodeServerFrame(text));

      const described = Option.match(decoded, {
        onNone: () => "undecodable",
        onSome: describeMessage,
      });

      received.push(echoing ? `echo ${text}` : text);
      note(`line ${number} ${echoing ? "echoed" : "got"} ${described}`);

      if (echoing) {
        return;
      }

      frames.push(text);

      for (const message of Option.toArray(decoded)) {
        arrivals.push({ at: wallClock(), message, text });
      }

      for (const { to } of Option.toArray(
        decoded.pipe(Option.filter(pokerCodec.server.guards.Events))
      )) {
        batches.push({ text, to });
      }
    });
    lines.push({
      closedByBot: false,
      mode: "Clear",
      number,
      offline,
      raw,
      received,
    });

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
                  send: (text: string) => {
                    const clear = line === undefined || line.mode === "Clear";

                    note(
                      `line ${line?.number ?? 0} ${clear ? "sent" : `swallowed (${line?.mode ?? "none"})`} ${describeSent(text)}`
                    );

                    return clear ? socket.send(text) : Effect.void;
                  },
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
      note(`line ${line.number} closed by the bot`);
      line.closedByBot = true;
      line.raw.close(1000, "dropped by the bot");
    }
  };

  const setMode = (mode: LineMode) => {
    const line = lines.at(-1);

    if (line !== undefined && DEADNESS[mode] > DEADNESS[line.mode]) {
      note(`line ${line.number} turned ${mode}`);
      line.mode = mode;
    }
  };

  return {
    arrivals: (): readonly Arrival[] => arrivals,
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
      note("went offline");
      offline = true;
      closeFromBot();
    },
    goOnline: () => {
      note("came back online");
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
