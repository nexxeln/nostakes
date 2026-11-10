import { BuildIdSchema } from "@nostakes/protocol";
import type { BuildId } from "@nostakes/protocol";
import { Config, Effect, Option, Schema } from "effect";

export const WEB_BUILD = "WEB_BUILD";

export const servedBuild = Config.option(Config.String(WEB_BUILD)).pipe(
  Config.map(Option.flatMap(Schema.decodeOption(BuildIdSchema)))
);

export const servedBuildOrNone = Effect.gen(function* readServedBuild() {
  return yield* servedBuild;
}).pipe(Effect.orElseSucceed(() => Option.none<BuildId>()));
