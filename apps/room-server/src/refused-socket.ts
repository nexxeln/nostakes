import type { CloseReason } from "@nostakes/protocol";
import { Effect } from "effect";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { closeWith } from "./socket-close.js";
import { workerdGlobals } from "./workerd.js";

export const refuseSocket = (reason: CloseReason) =>
  workerdGlobals(`refuse a socket with ${reason}`).pipe(
    Effect.map((scope) => {
      const { 0: client, 1: server } = new scope.WebSocketPair();

      server.accept();
      closeWith(server, reason);

      return HttpServerResponse.setBody(
        HttpServerResponse.empty({ status: 101 }),
        HttpBody.raw(
          new scope.Response(null, { status: 101, webSocket: client })
        )
      );
    })
  );
