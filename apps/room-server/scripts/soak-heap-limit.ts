import { Schema } from "effect";

export class SoakHeapLimit extends Schema.TaggedError<
  SoakHeapLimit,
  { readonly brand: unique symbol }
>()("SoakHeapLimit", {
  heapMb: Schema.Int,
  limitMb: Schema.Int,
  playing: Schema.String,
  wave: Schema.Int,
}) {
  override get message() {
    return `the soak's heap reached ${this.heapMb} MB, past its limit of ${this.limitMb} MB, in wave ${this.wave} while these rooms played: ${this.playing}. It stopped them rather than run out of memory; the heap lines above show the trend`;
  }
}
