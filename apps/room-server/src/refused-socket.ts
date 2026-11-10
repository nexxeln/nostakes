import type * as cf from "@cloudflare/workers-types";
import type { CloseReason } from "@nostakes/protocol";
import { Effect, Schema } from "effect";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { closeWith } from "./socket-close.js";

interface WorkerdGlobals {
  readonly WebSocketPair: typeof cf.WebSocketPair;
  readonly Response: typeof cf.Response;
}

export class NoWebSocketPair extends Schema.TaggedError<
  NoWebSocketPair,
  { readonly brand: unique symbol }
>()("NoWebSocketPair", { reason: Schema.String }) {
  override get message() {
    return `Could not refuse a socket with ${this.reason}: this runtime has no WebSocketPair. Socket refusals run only inside workerd, in the Worker or a room object.`;
  }
}

const isWorkerd = (
  scope: typeof globalThis
): scope is typeof globalThis & WorkerdGlobals => "WebSocketPair" in scope;

export const refuseSocket = (reason: CloseReason) => {
  const scope = globalThis;

  if (!isWorkerd(scope)) {
    return Effect.die(new NoWebSocketPair({ reason }));
  }

  return Effect.sync(() => {
    const { 0: client, 1: server } = new scope.WebSocketPair();

    server.accept();
    closeWith(server, reason);

    return HttpServerResponse.setBody(
      HttpServerResponse.empty({ status: 101 }),
      HttpBody.raw(new scope.Response(null, { status: 101, webSocket: client }))
    );
  });
};
