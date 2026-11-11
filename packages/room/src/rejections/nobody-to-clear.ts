import { Schema } from "effect";

export class NobodyToClear extends Schema.TaggedError<
  NobodyToClear,
  { readonly brand: unique symbol }
>()("NobodyToClear", { members: Schema.Int }) {
  override get message() {
    return `Nobody the host named can still go: of the ${this.members} members, everyone named holds a seat, hosts, is in the settle-up, or is gone already, and the room is already locked, so clearing it would change nothing. Name the people to clear as the host's view lists them (clearableOf).`;
  }
}
