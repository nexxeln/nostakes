import type * as cf from "@cloudflare/workers-types";
import { Effect, Schema } from "effect";

interface WorkerdGlobals {
  readonly WebSocketPair: typeof cf.WebSocketPair;
  readonly WebSocketRequestResponsePair: typeof cf.WebSocketRequestResponsePair;
  readonly Response: typeof cf.Response;
}

export class NotInWorkerd extends Schema.TaggedError<
  NotInWorkerd,
  { readonly brand: unique symbol }
>()("NotInWorkerd", { needed: Schema.String }) {
  override get message() {
    return `Could not ${this.needed}: this runtime has no WebSocketPair. The room server runs only inside workerd, in the Worker or a room object.`;
  }
}

const isWorkerd = (
  scope: typeof globalThis
): scope is typeof globalThis & WorkerdGlobals =>
  "WebSocketPair" in scope && "WebSocketRequestResponsePair" in scope;

export const workerdGlobals = (needed: string) => {
  const scope = globalThis;

  return isWorkerd(scope)
    ? Effect.succeed(scope)
    : Effect.die(new NotInWorkerd({ needed }));
};
