import { codeFor } from "@nostakes/avatar";
import { Effect, Option } from "effect";
import { renderToString } from "foldkit/experimental/server";

import { HOME_TITLE } from "../link-preview.js";
import type { Flags } from "../model.js";
import { init } from "../update.js";
import { CAST } from "./cast.js";
import { landingView } from "./view.js";

const FIRST_VISIT: Flags = {
  deck: "TwoColour",
  invite: Option.none(),
  learned: [],
  profile: { avatar: codeFor(CAST.Sam), name: "" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.none(),
  sound: true,
  systemTheme: "Light",
  theme: Option.none(),
};

const DRAWINGS = /<svg\b[\s\S]*?<\/svg>/gu;

export const PRERENDERED_CLASS = "prerendered-landing";

export const PRERENDER_STYLE = `.${PRERENDERED_CLASS} { display: none; }`;

export const NO_SCRIPT_STYLE = `.${PRERENDERED_CLASS} { display: block; }`;

export const landingWords = renderToString(
  {
    init: () => init(FIRST_VISIT),
    view: (model, h) => ({ body: landingView(model, h), title: HOME_TITLE }),
  },
  { isHydratable: false }
).pipe(
  Effect.map(
    ({ html }) =>
      `<div class="${PRERENDERED_CLASS}">${html.replaceAll(DRAWINGS, "")}</div>`
  )
);
