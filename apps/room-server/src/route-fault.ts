import { Option, Schema } from "effect";
import { flow } from "effect/Function";

const STACK_FRAMES = 4;

const FRAME = /^\s*at /u;

const DefectSchema = Schema.Struct({
  name: Schema.String,
  stack: Schema.optionalKey(Schema.String),
});

export const defectWhere = flow(
  Schema.decodeUnknownOption(DefectSchema),
  Option.match({
    onNone: () => "a value that is not an error",
    onSome: ({ name, stack }) =>
      [
        name,
        ...(stack ?? "")
          .split("\n")
          .filter((line) => FRAME.test(line))
          .slice(0, STACK_FRAMES)
          .map((line) => line.trim()),
      ].join(" "),
  })
);

export class RouteFault extends Schema.TaggedError<
  RouteFault,
  { readonly brand: unique symbol }
>()("RouteFault", { detail: Schema.String, route: Schema.String }) {
  override get message() {
    return `The room route ${this.route} died: ${this.detail}. The client was answered ServerFault. This is a bug in the room server.`;
  }
}
