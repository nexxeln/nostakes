import { describe, expect, it } from "@effect/vitest";
import {
  FRAME_BURST,
  FRAMES_PER_SECOND,
  PING_FRAME,
  SOCKET_SILENCE_LIMIT_MS,
} from "@nostakes/protocol";
import { Result } from "effect";

import {
  ANSWER_LIMIT_MS,
  CLIENT_BURST_REFILL_MS,
  CLIENT_FRAME_BURST,
  PING_INTERVAL_MS,
} from "../src/index.js";
import { toyCodec } from "./fixtures/toy-room.js";

describe("frame budget", () => {
  it("bursts and refills below the server's limit, so a flood close never comes from this client", () => {
    expect(CLIENT_FRAME_BURST).toBeLessThan(FRAME_BURST);
    expect(CLIENT_FRAME_BURST * 1000).toBeLessThan(
      FRAMES_PER_SECOND * CLIENT_BURST_REFILL_MS
    );
  });
});

describe("heartbeat", () => {
  it("sends the exact ping text the server answers without waking the room, often enough that two lost pings never get a live client dropped", () => {
    const ping = toyCodec.encodeClientFrame(
      toyCodec.client.cases.Ping.make({})
    );

    expect(Result.getOrThrow(ping)).toBe(PING_FRAME);
    expect(PING_INTERVAL_MS * 3).toBeLessThan(SOCKET_SILENCE_LIMIT_MS);
  });

  it("notices a line that hears the room but is not heard within one ping and its answer limit, long before the server's silence limit would close it", () => {
    expect(ANSWER_LIMIT_MS).toBeLessThan(PING_INTERVAL_MS);
    expect(PING_INTERVAL_MS + ANSWER_LIMIT_MS).toBeLessThan(
      SOCKET_SILENCE_LIMIT_MS / 2
    );
  });
});
