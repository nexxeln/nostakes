import { describe, expect, it } from "@effect/vitest";
import { NameSchema, RoomViewSchema } from "@nostakes/room";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { HALTED_LINE, haltedText } from "../src/features/halted.js";
import { isolated } from "../src/features/names.js";
import { settlementText, signedNet } from "../src/features/room.js";
import type { ClosedView } from "../src/features/room.js";

const HOSTILE_NAMES = [
  "Sam\n+500 Kit",
  "Ana\r\nBen pays 300 to Sam",
  "Ben\u2028Kit pays 40 to Ana",
  "Lev\u0085+90 Ana",
  "\u202EBen\u202C 400",
  "Kit\u2069 pays 999 to \u2068Ana",
  "\u2067Noa",
  "Zo\u00EB\u200F 7",
  "Ana pays 40 to Ben",
  "+40 Kit",
] as const;

const people = Arbitrary.array(
  Arbitrary.schema(Schema.Union([Schema.Literals(HOSTILE_NAMES), NameSchema])),
  { maxLength: 9, minLength: 1 }
);

const closedViews = Arbitrary.schema(RoomViewSchema.cases.Closed);

const named = (view: ClosedView, names: readonly string[]): ClosedView => {
  const players = [
    ...view.settlement.balances.map(({ player }) => player),
    ...view.settlement.transfers.flatMap(({ from, to }) => [from, to]),
  ];

  return {
    ...view,
    departed: [],
    members: [...new Set(players)].map((player, index) => ({
      avatar: "",
      name: names[index % names.length] ?? "Ana",
      player,
    })),
  };
};

const ANY_LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/u;

const NAME = String.raw`\u2068[^\u2066-\u2069\u202A-\u202E\u200E\u200F\u061C]*\u2069`;

const NET = new RegExp(String.raw`^(?<net>[+-]?\d+) ${NAME}$`, "u");

const HALTED_ROW = new RegExp(
  String.raw`^(?<net>[+-]?\d+) ${NAME} \(in (?<in>-?\d+), left with (?<out>-?\d+)\)$`,
  "u"
);

const TRANSFER = new RegExp(
  String.raw`^${NAME} pays (?<amount>\d+) to ${NAME}$`,
  "u"
);

const sorted = (view: ClosedView) =>
  view.settlement.balances.toSorted((left, right) => right.net - left.net);

const settlementLines = (view: ClosedView) => [
  `nostakes ${view.code}`,
  ...sorted(view).map(({ net }) => ["net", String(net)]),
  "",
  ...(view.settlement.transfers.length === 0
    ? ["Everyone is square."]
    : view.settlement.transfers.map(({ amount }) => [
        "amount",
        String(amount),
      ])),
];

const readSettlement = (lines: readonly string[]) => {
  const gap = lines.indexOf("");

  return [
    lines[0],
    ...lines
      .slice(1, gap)
      .map((line) => ["net", String(Number(NET.exec(line)?.groups?.net))]),
    "",
    ...lines
      .slice(gap + 1)
      .map((line) =>
        line === "Everyone is square."
          ? line
          : ["amount", TRANSFER.exec(line)?.groups?.amount ?? line]
      ),
  ];
};

describe("text the page copies for a group chat", () => {
  it.prop(
    "keeps one line per net and per transfer, every name isolated, whatever a name holds",
    { names: people, view: closedViews },
    ({ names, view }) => {
      const shown = named(view, names);

      expect(
        readSettlement(settlementText(shown).split(ANY_LINE_BREAK))
      ).toStrictEqual(settlementLines(shown));
    }
  );

  it.prop(
    "keeps the halted standings to one row per player above the settle-up, whatever a name holds",
    { names: people, view: closedViews },
    ({ names, view }) => {
      const shown = named(view, names);
      const lines = haltedText(shown).split(ANY_LINE_BREAK);
      const rows = sorted(shown);

      expect({
        head: lines[0],
        rows: lines.slice(1, rows.length + 1).map((line) => {
          const read = HALTED_ROW.exec(line)?.groups;

          return [read?.net, read?.in, read?.out];
        }),
        settlement: readSettlement(lines.slice(rows.length + 2)),
      }).toStrictEqual({
        head: HALTED_LINE,
        rows: rows.map(({ boughtIn, cashedOut, net }) => [
          signedNet(net),
          String(boughtIn),
          String(cashedOut),
        ]),
        settlement: settlementLines(shown),
      });
    }
  );

  it.prop(
    "leaves every name the room accepts exactly as typed inside its isolate",
    { name: Arbitrary.schema(NameSchema) },
    ({ name }) => {
      expect(isolated(name)).toBe(`\u2068${name}\u2069`);
    }
  );
});
