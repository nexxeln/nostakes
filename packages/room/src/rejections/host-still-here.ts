import { PlayerIdSchema } from "@nostakes/engine";
import { Option, Schema } from "effect";

import { MillisSchema } from "../time.js";

export class HostStillHere extends Schema.TaggedError<
  HostStillHere,
  { readonly brand: unique symbol }
>()("HostStillHere", {
  claimableAt: Schema.Option(MillisSchema),
  host: PlayerIdSchema,
}) {
  override get message() {
    return Option.match(this.claimableAt, {
      onNone: () =>
        `${this.host} is connected and stays the host. Another member may take over only after the host has had no connection for two minutes.`,
      onSome: (at) =>
        `${this.host} has had no connection for less than two minutes. Another member may take over as host from ${at}.`,
    });
  }
}
