import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { limitKeyOf } from "../src/address-limits.js";

const Hextets = Schema.Array(
  Schema.Int.check(Schema.isBetween({ maximum: 0xff_ff, minimum: 0 }))
).check(Schema.isMinLength(8), Schema.isMaxLength(8));

const written = (hextets: readonly number[]) =>
  hextets.map((hextet) => hextet.toString(16)).join(":");

describe("the key an address is rate limited under", () => {
  it("keeps an IPv4 address whole, keys IPv6 on its /64 however it is written, and reads an IPv4-mapped address as IPv4", () => {
    expect(
      [
        "203.0.113.7",
        "2001:db8:85a3:8d3:1319:8a2e:370:7348",
        "2001:db8:85a3:8d3::1",
        "2001:DB8:85A3:08D3:0:0:0:2",
        "2001:db8::1",
        "::1",
        "::ffff:203.0.113.7",
        "64:ff9b::203.0.113.7",
        "unknown",
      ].map(limitKeyOf)
    ).toStrictEqual([
      "203.0.113.7",
      "2001:db8:85a3:8d3::/64",
      "2001:db8:85a3:8d3::/64",
      "2001:db8:85a3:8d3::/64",
      "2001:db8:0:0::/64",
      "0:0:0:0::/64",
      "203.0.113.7",
      "64:ff9b:0:0::/64",
      "unknown",
    ]);
  });

  it.prop(
    "gives every address in one /64 the same key and addresses in different /64s different keys",
    {
      first: Arbitrary.schema(Hextets),
      second: Arbitrary.schema(Hextets),
    },
    ({ first, second }) => {
      const sameNetwork = [...first.slice(0, 4), ...second.slice(4)];

      const samePrefix =
        first.slice(0, 4).join(",") === second.slice(0, 4).join(",");

      expect([
        limitKeyOf(written(sameNetwork)) === limitKeyOf(written(first)),
        limitKeyOf(written(second)) === limitKeyOf(written(first)),
      ]).toStrictEqual([true, samePrefix]);
    }
  );
});
