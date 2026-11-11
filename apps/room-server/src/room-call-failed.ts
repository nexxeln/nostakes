import { Cause, Effect, Schema } from "effect";

export const RoomCallSchema = Schema.Literals([
  "open",
  "join",
  "connect",
  "check",
  "standings",
]);

export type RoomCall = typeof RoomCallSchema.Type;

export class RoomCallFailed extends Schema.TaggedError<
  RoomCallFailed,
  { readonly brand: unique symbol }
>()("RoomCallFailed", {
  call: RoomCallSchema,
  detail: Schema.String,
  room: Schema.String,
}) {
  override get message() {
    return `A room failed the ${this.call} call: ${this.detail}. Cloudflare refuses calls to a room for a while after a deploy, so the client answers RoomUnavailable and may try again.`;
  }
}

const describe = (cause: Cause.Cause<unknown>) => {
  const squashed = Cause.squash(cause);

  return squashed instanceof Error ? squashed.message : String(squashed);
};

export const callRoom = <A, E>(
  room: Effect.Effect<string>,
  call: RoomCall,
  effect: Effect.Effect<A, E>
) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : room.pipe(
            Effect.flatMap((key) =>
              Effect.fail(
                new RoomCallFailed({ call, detail: describe(cause), room: key })
              )
            )
          )
    )
  );
