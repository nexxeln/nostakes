import { Schema } from "effect";

export class RouteFault extends Schema.TaggedError<
  RouteFault,
  { readonly brand: unique symbol }
>()("RouteFault", { detail: Schema.String, route: Schema.String }) {
  override get message() {
    return `The room route ${this.route} died: ${this.detail}. The client was answered ServerFault. This is a bug in the room server.`;
  }
}
