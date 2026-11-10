import { Schema } from "effect";

export class GameAlready extends Schema.TaggedError<
  GameAlready,
  { readonly brand: unique symbol }
>()("GameAlready", { status: Schema.Literals(["Running", "Waiting"]) }) {
  override get message() {
    return `The game is already ${this.status === "Running" ? "running. Send PauseGame to stop new deals" : "waiting. Send StartGame to begin dealing"}.`;
  }
}
