import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { BLUFF_HAND } from "../scripts/moments/bluff-hand.js";
import { adoptEarlyProperties } from "../src/client/early-properties.js";
import { momentElement } from "../src/features/moments/element.js";
import { shownMomentOf } from "../src/features/moments/scene.js";
import { keepElement } from "../src/features/pictures/keep.js";
import { tableElement } from "../src/features/table/snapshot.js";

const byName = <Value>(
  [left]: readonly [string, Value],
  [right]: readonly [string, Value]
) => left.localeCompare(right);

const upgraded = <Value>(
  properties: Readonly<Record<string, Schema.Top>>,
  early: Readonly<Record<string, Value>>,
  refused: boolean
) => {
  const heard: (readonly [string, Value])[] = [];
  const element = { ...early };

  if (refused) {
    for (const name of Object.keys(early)) {
      Reflect.set(element, name, Symbol(name));
    }
  }

  const accessors = Object.fromEntries(
    Object.keys(properties).map((name) => [
      name,
      {
        configurable: true,
        get: () => null,
        set: (value: Value) => {
          heard.push([name, value]);
        },
      },
    ])
  );

  Object.setPrototypeOf(element, Object.defineProperties({}, accessors));
  adoptEarlyProperties(element, properties);

  const left = Object.keys(element);
  const adopted = heard.splice(0).toSorted(byName);

  for (const [name, value] of Object.entries(early)) {
    Reflect.set(element, name, value);
  }

  return { adopted, later: heard.toSorted(byName), left };
};

const expected = <Value>(
  early: Readonly<Record<string, Value>>,
  adopted: boolean
) => {
  const every = Object.entries(early).toSorted(byName);

  return { adopted: adopted ? every : [], later: every, left: [] };
};

const valuesOf = {
  keep: Arbitrary.schema(Schema.Struct(keepElement.properties)),
  moment: Arbitrary.schema(Schema.Struct(momentElement.properties)),
  table: Arbitrary.schema(Schema.Struct(tableElement.properties)),
};

describe("a property the page sets before its element is defined", () => {
  it.prop(
    "reaches the element's setter once it is defined, for every property of the table, a moment, and the keep button, and later writes reach the setter too",
    valuesOf,
    ({ keep, moment, table }) => {
      expect([
        upgraded(keepElement.properties, keep, false),
        upgraded(momentElement.properties, moment, false),
        upgraded(tableElement.properties, table, false),
      ]).toStrictEqual([
        expected(keep, true),
        expected(moment, true),
        expected(table, true),
      ]);
    },
    { arbitrary: { runs: 25 } }
  );

  it.prop(
    "drops a value its schema refuses instead of handing it to the element",
    valuesOf,
    ({ keep, moment, table }) => {
      expect([
        upgraded(keepElement.properties, keep, true),
        upgraded(momentElement.properties, moment, true),
        upgraded(tableElement.properties, table, true),
      ]).toStrictEqual([
        expected(keep, false),
        expected(moment, false),
        expected(table, false),
      ]);
    },
    { arbitrary: { runs: 5 } }
  );

  it("calls out a bluff for the hand the phone check sets before the moment is defined", () => {
    expect(
      Option.map(shownMomentOf(BLUFF_HAND), ({ picture }) => picture.kind)
    ).toStrictEqual(Option.some("Bluff"));
  });
});
