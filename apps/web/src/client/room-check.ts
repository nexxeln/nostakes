import { CLOSE_CODES, ClosingSchema } from "@nostakes/protocol";
import { Effect, Option, Schema } from "effect";

import { socketUrl } from "./connection.js";

const QUIET_MEANS_THERE = "2500 millis";

const closingJson = Schema.fromJsonString(ClosingSchema);

const saysNotFound = (event: MessageEvent) =>
  Option.exists(
    Schema.decodeUnknownOption(closingJson)(event.data),
    ({ reason }) => reason === "NotFound"
  );

export const roomIsGone = (code: string) =>
  Effect.callback<boolean>((resume) => {
    const socket = new WebSocket(socketUrl(code));

    const answer = (gone: boolean) => {
      socket.close();
      resume(Effect.succeed(gone));
    };

    socket.addEventListener("message", (event) => {
      answer(saysNotFound(event));
    });
    socket.addEventListener("close", (event) => {
      answer(event.code === CLOSE_CODES.NotFound);
    });
    socket.addEventListener("error", () => {
      answer(false);
    });

    return Effect.sync(() => {
      socket.close();
    });
  }).pipe(
    Effect.timeoutOption(QUIET_MEANS_THERE),
    Effect.map(Option.getOrElse(() => false))
  );
