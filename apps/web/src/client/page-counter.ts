import { Effect, Option } from "effect";

import {
  BEACON_SOURCE,
  PAGE_COUNTER_TOKENS,
} from "../features/outside-hosts.js";
import { pageCounterMayLoad } from "../features/page-counting.js";
import { countingOn } from "./counting.js";

const tokenFor = (host: string) =>
  Option.fromUndefinedOr(
    Object.entries(PAGE_COUNTER_TOKENS).find(([known]) => known === host)?.[1]
  ).pipe(Option.filter((token) => token !== ""));

export const pageCounterLoaded = () =>
  globalThis.document.querySelector(`script[src="${BEACON_SOURCE}"]`) !== null;

const mayLoadHere = () =>
  pageCounterMayLoad({
    origin: globalThis.location.origin,
    path: globalThis.location.pathname,
    referrer: globalThis.document.referrer,
  });

export const loadPageCounter = Effect.sync(() => {
  const already = pageCounterLoaded();

  for (const token of Option.toArray(tokenFor(globalThis.location.hostname))) {
    if (!already && countingOn() && mayLoadHere()) {
      const script = globalThis.document.createElement("script");

      script.defer = true;
      script.src = BEACON_SOURCE;
      script.dataset.cfBeacon = JSON.stringify({ spa: false, token });
      globalThis.document.head.append(script);
    }
  }
});
