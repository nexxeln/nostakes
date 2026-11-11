import { Schema } from "effect";

import { RoomCodeSchema } from "../identity.js";

export class RoomLocked extends Schema.TaggedError<
  RoomLocked,
  { readonly brand: unique symbol }
>()("RoomLocked", { code: RoomCodeSchema }) {
  override get message() {
    return `The host locked room ${this.code}, so nobody new may join. People who already hold a pass come and go as before. Ask the host to unlock the room.`;
  }
}
