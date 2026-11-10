import { Context } from "effect";
import type { Effect, Scope, Stream } from "effect";

import type { SocketEvent } from "./socket-event.js";

export interface Socket {
  readonly events: Stream.Stream<SocketEvent>;
  readonly send: (text: string) => Effect.Effect<void>;
}

export class Transport extends Context.Service<
  Transport,
  { readonly open: (url: string) => Effect.Effect<Socket, never, Scope.Scope> }
>()("@nostakes/client/Transport") {}
