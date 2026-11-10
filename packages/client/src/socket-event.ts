import { Data } from "effect";

export type SocketEvent = Data.TaggedEnum<{
  Opened: { readonly url: string };
  Received: { readonly text: string };
  Closed: { readonly code: number; readonly reason: string };
}>;

export const SocketEvents = Data.taggedEnum<SocketEvent>();
