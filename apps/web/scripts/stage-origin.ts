import { Context } from "effect";

export class StageOrigin extends Context.Service<StageOrigin, string>()(
  "@nostakes/web/scripts/StageOrigin"
) {}
