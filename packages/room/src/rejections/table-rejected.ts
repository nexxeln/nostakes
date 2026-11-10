import { RejectionSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class TableRejected extends Schema.TaggedError<
  TableRejected,
  { readonly brand: unique symbol }
>()("TableRejected", { rejection: RejectionSchema }) {
  override get message() {
    return `The table refused: ${this.rejection.message}`;
  }
}
