import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

import {
  REALTIME_APP_ID,
  REALTIME_APP_SECRET,
  TURN_KEY_ID,
  TURN_KEY_SECRET,
} from "./realtime.js";
import type { SiteStage } from "./site.js";

export const siteVoice = (stage: SiteStage) =>
  Effect.gen(function* declareSiteVoice() {
    if (yield* Alchemy.ALCHEMY_DEV) {
      return {};
    }

    const app = yield* Cloudflare.Calls.App("Voice", {
      name: `nostakes-${stage}-voice`,
    });

    const turn = yield* Cloudflare.Calls.TurnKey("VoiceTurn", {
      name: `nostakes-${stage}-voice-turn`,
    });

    return {
      [REALTIME_APP_ID]: app.appId,
      [REALTIME_APP_SECRET]: app.secret,
      [TURN_KEY_ID]: turn.keyId,
      [TURN_KEY_SECRET]: turn.key,
    };
  });
