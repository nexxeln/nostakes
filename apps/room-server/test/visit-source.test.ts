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

  it("names the sites in the table and nothing that only looks like them", () => {
    expect(
      [
        null,
        "",
        "https://x.com/someone/status/1",
        "https://mobile.twitter.com/",
        "https://t.co/Q8MZ4T",
        "https://news.ycombinator.com/item?id=1",
        "https://old.reddit.com/r/poker/",
        "https://discord.com/channels/1/2",
        "https://www.google.co.uk/",
        "https://github.com/someone/repo",
        "https://bsky.app/profile/someone",
        "https://lnkd.in/abc",
        "https://nostakes.club/r/Q8MZ4T",
        "https://preview.nostakes.club/",
        "https://notx.com/",
        "https://x.com.example/",
        "https://google.example.com/",
        "not a link",
      ].map((referrer) => visitSourceOf(referrer, OWN))
    ).toStrictEqual([
      "none",
      "none",
      "x",
      "x",
      "x",
      "hn",
      "reddit",
      "discord",
      "google",
      "github",
      "bsky",
      "linkedin",
      "own",
      "other",
      "other",
      "other",
      "other",
      "other",
    ]);
  });
});
