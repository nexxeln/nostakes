import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class RemovedFromRoom extends Schema.TaggedError<
  RemovedFromRoom,
  { readonly brand: unique symbol }
>()("RemovedFromRoom", { player: PlayerIdSchema }) {
  override get message() {
    return `The host removed ${this.player} from this room, so their pass no longer joins it. They can still read their own result.`;
  }
}
