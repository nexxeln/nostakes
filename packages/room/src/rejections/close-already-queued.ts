import { Schema } from "effect";

export class CloseAlreadyQueued extends Schema.TaggedError<
  CloseAlreadyQueued,
  { readonly brand: unique symbol }
>()("CloseAlreadyQueued", { handNumber: Schema.Int }) {
  override get message() {
    return `The room already closes when hand ${this.handNumber} ends. There is nothing more to do.`;
  }
}
