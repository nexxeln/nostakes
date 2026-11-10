import { Schema } from "effect";

export class CommandFault extends Schema.TaggedError<
  CommandFault,
  { readonly brand: unique symbol }
>()("CommandFault", {
  code: Schema.String,
  command: Schema.String,
  fault: Schema.String,
  faults: Schema.Int,
  stalled: Schema.Boolean,
}) {
  override get message() {
    const marked = this.stalled
      ? " The room is marked stalled, so its players see that the table is stuck and can end the night."
      : "";

    return `Room ${this.code} threw ${this.fault} while deciding a member's ${this.command} command, ${this.faults} in a row. Nothing was stored, and the member was told the room could not take it.${marked} This is a bug in the room core.`;
  }
}
