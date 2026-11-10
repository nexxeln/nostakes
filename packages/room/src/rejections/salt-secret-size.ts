import { DIGEST_BYTES } from "@nostakes/shuffle";
import { Schema } from "effect";

export class SaltSecretSize extends Schema.TaggedError<
  SaltSecretSize,
  { readonly brand: unique symbol }
>()("SaltSecretSize", { bytes: Schema.Int }) {
  override get message() {
    return `A seal's salt secret was ${this.bytes} bytes. Send exactly ${DIGEST_BYTES} fresh random bytes.`;
  }
}
