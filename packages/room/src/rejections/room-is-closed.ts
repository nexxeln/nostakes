import { Schema } from "effect";

import { RoomCodeSchema } from "../identity.js";

export class RoomIsClosed extends Schema.TaggedError<
  RoomIsClosed,
  { readonly brand: unique symbol }
>()("RoomIsClosed", { code: RoomCodeSchema }) {
  override get message() {
    return `Room ${this.code} is closed and its settlement is final. Open a new room to play again.`;
  }
}
