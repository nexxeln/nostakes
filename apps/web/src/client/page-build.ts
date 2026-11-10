import { BuildIdSchema } from "@nostakes/protocol";
import { Option, Schema } from "effect";

export const pageBuild = () =>
  Option.fromNullishOr(
    globalThis.document
      .querySelector('meta[name="nostakes-build"]')
      ?.getAttribute("content")
  ).pipe(Option.flatMap(Schema.decodeOption(BuildIdSchema)));
