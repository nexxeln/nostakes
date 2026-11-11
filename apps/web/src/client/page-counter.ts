import { Effect, Option } from "effect";

import {
  BEACON_SOURCE,
  PAGE_COUNTER_TOKENS,
} from "../features/outside-hosts.js";
import { countingOn } from "./counting.js";

const tokenFor = (host: string) =>
  Option.fromUndefinedOr(
    Object.entries(PAGE_COUNTER_TOKENS).find(([known]) => known === host)?.[1]
  ).pipe(Option.filter((token) => token !== ""));

export const loadPageCounter = Effect.sync(() => {
  const already = globalThis.document.querySelector(
    `script[src="${BEACON_SOURCE}"]`
  );

  for (const token of Option.toArray(tokenFor(globalThis.location.hostname))) {
    if (already === null && countingOn()) {
      const script = globalThis.document.createElement("script");

      script.defer = true;
      script.src = BEACON_SOURCE;
      script.dataset.cfBeacon = JSON.stringify({ spa: true, token });
      globalThis.document.head.append(script);
    }
  }
});
