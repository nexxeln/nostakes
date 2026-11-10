import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CLOSE_CODES, CloseReasonSchema } from "@nostakes/protocol";
import { Effect, FileSystem } from "effect";

import { closeWith } from "../src/socket-close.js";

const closeCalls = Effect.gen(function* closeCallsInSource() {
  const fs = yield* FileSystem.FileSystem;
  const source = `${import.meta.dirname}/../src`;

  const files = (yield* fs.readDirectory(source)).filter((file) =>
    file.endsWith(".ts")
  );

  const calls: string[] = [];

  for (const file of files.toSorted()) {
    const text = yield* fs.readFileString(`${source}/${file}`);

    for (const line of text.split("\n")) {
      if (line.includes(".close(")) {
        calls.push(`${file}: ${line.trim()}`);
      }
    }
  }

  return calls;
});

describe("closing a socket", () => {
  it.effect(
    "the server closes a socket only through closeWith, which names a protocol reason, or to answer the peer's own close",
    () =>
      Effect.gen(function* everyCloseNamesAReason() {
        const calls = yield* closeCalls;

        expect(calls).toEqual([
          "socket-close.ts: socket.close(CLOSE_CODES[reason], reason);",
          'socket-close.ts: socket.close(NORMAL_CLOSURE, "closed");',
        ]);
      }).pipe(Effect.provide(NodeFileSystem.layer))
  );

  it("sends the Closing frame first and then closes with the reason's code, for every reason", () => {
    for (const reason of CloseReasonSchema.literals) {
      const log: string[] = [];

      closeWith(
        {
          close: (code, text) => {
            log.push(`close ${code} ${text}`);
          },
          send: (frame) => {
            log.push(`send ${frame}`);
          },
        },
        reason
      );

      expect(log).toEqual([
        `send {"_tag":"Closing","reason":"${reason}"}`,
        `close ${CLOSE_CODES[reason]} ${reason}`,
      ]);
    }
  });
});
