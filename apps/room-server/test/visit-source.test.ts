import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { VisitSourceSchema, visitSourceOf } from "../src/visit-source.js";

const OWN = "https://nostakes.club";

const hosts = Arbitrary.schema(
  Schema.Literals([
    "x.com",
    "t.co",
    "news.ycombinator.com",
    "old.reddit.com",
    "www.google.co.uk",
    "nostakes.club",
    "notx.com",
    "x.com.example",
    "google.example.com",
    "wren.example",
  ])
);

const tails = Arbitrary.schema(Schema.String);

describe("where a visit came from", () => {
  it.prop(
    "is always a name from the table",
    { referrer: Arbitrary.schema(Schema.String) },
    ({ referrer }) => {
      expect(Schema.is(VisitSourceSchema)(visitSourceOf(referrer, OWN))).toBe(
        true
      );
    }
  );

  it.prop(
    "depends on the referring site alone, never on its path or query",
    { host: hosts, tail: tails },
    ({ host, tail }) => {
      const site = `https://${host}`;

      expect(visitSourceOf(`${site}/${tail}?q=${tail}`, OWN)).toBe(
        visitSourceOf(`${site}/`, OWN)
      );
    }
  );
});
