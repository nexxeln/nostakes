import { describe, expect, it } from "@effect/vitest";
import { NameSchema, RoomViewSchema } from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import {
  settleUpCardOf,
  settleUpSvg,
} from "../src/features/pictures/settle-up.js";
import { nameOf, settlementText } from "../src/features/room.js";
import { init, update } from "../src/features/update.js";

const closedViews = Arbitrary.schema(RoomViewSchema.cases.Closed);

const names = Arbitrary.schema(NameSchema);

type ClosedView = typeof RoomViewSchema.cases.Closed.Type;

const named = (view: ClosedView, people: readonly string[]): ClosedView => {
  const players = [
    ...view.settlement.balances.map(({ player }) => player),
    ...view.settlement.transfers.flatMap(({ from, to }) => [from, to]),
  ];

  return {
    ...view,
    departed: [],
    members: [...new Set(players)].map((player, index) => ({
      avatar: "",
      name: people[index % Math.max(1, people.length)] ?? "Ana",
      player,
    })),
  };
};

const NAME = String.raw`\u2068([^\u2068\u2069\n]*)\u2069`;

const NET_LINE = new RegExp(String.raw`^(-?\+?\d+) ${NAME}$`, "u");

const TRANSFER_LINE = new RegExp(
  String.raw`^${NAME} pays (\d+) to ${NAME}$`,
  "u"
);

const readBack = (text: string) => {
  const [title, ...rest] = text.split("\n");
  const gap = rest.indexOf("");

  return {
    nets: rest
      .slice(0, gap)
      .map((line) => NET_LINE.exec(line)?.slice(1) ?? [line]),
    title,
    transfers: rest
      .slice(gap + 1)
      .map((line) => TRANSFER_LINE.exec(line)?.slice(1) ?? [line]),
  };
};

describe("the settle-up as text", () => {
  it.prop(
    "reads back to exactly the room's nets and transfers whatever the names are, one line each, with every name isolated from the words and amounts around it",
    {
      people: Arbitrary.array(names, { maxLength: 9, minLength: 1 }),
      view: closedViews,
    },
    ({ people, view }) => {
      const shown = named(view, people);
      const read = readBack(settlementText(shown));

      expect(read).toStrictEqual({
        nets: shown.settlement.balances
          .toSorted((left, right) => right.net - left.net)
          .map(({ net, player }) => [
            `${net > 0 ? "+" : ""}${net}`,
            nameOf(shown, player),
          ]),
        title: `nostakes ${shown.code}`,
        transfers:
          shown.settlement.transfers.length === 0
            ? [["Everyone is square."]]
            : shown.settlement.transfers.map(({ amount, from, to }) => [
                nameOf(shown, from),
                String(amount),
                nameOf(shown, to),
              ]),
      });
    }
  );

  it.prop(
    "draws every name on the slip as its own isolated run, so a right-to-left name cannot pull an amount or another name across",
    {
      people: Arbitrary.array(names, { maxLength: 9, minLength: 1 }),
      view: closedViews,
    },
    ({ people, view }) => {
      const svg = settleUpSvg(settleUpCardOf(named(view, people)), {
        deck: "TwoColour",
        fonts: "",
        frame: "Chat",
        theme: "Light",
      });

      const boldRuns = [
        ...svg.matchAll(
          /<tspan font-weight="700"[^>]*>(?<run>[^<]*)<\/tspan>/gu
        ),
      ].map(([, run = ""]) => run);

      expect(
        boldRuns.filter((run) => !/^\u2068[^\u2068\u2069]*\u2069$/u.test(run))
      ).toStrictEqual([]);
      expect(boldRuns.length).toBe(2 * view.settlement.transfers.length);
    }
  );
});

const home = init({
  deck: "TwoColour",
  invite: Option.none(),
  learned: [],
  profile: { avatar: "", name: "" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.none(),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const submitted = (typed: string) => {
  const step = update(
    update(home, Messages.ChangedName({ value: typed })).model,
    Messages.SubmittedCreate()
  );

  return {
    problem: Screens.guards.Home(step.model.screen)
      ? step.model.screen.problem
      : Option.none(),
    sent: (step.commands ?? []).map(({ args }) => args),
  };
};

describe("typing a name", () => {
  it("refuses a name with a line break, a hidden character, mixed alphabets, or no letter, says why, and sends nothing", () => {
    expect(
      [
        "Sam +0\n\nAna pays Sam 300",
        "\u202EBen\u202C 400",
        "B\u0435n",
        "300",
      ].map(submitted)
    ).toStrictEqual([
      {
        problem: Option.some(
          "That name has a line break or a hidden character. Type it again."
        ),
        sent: [],
      },
      {
        problem: Option.some(
          "That name has a line break or a hidden character. Type it again."
        ),
        sent: [],
      },
      {
        problem: Option.some(
          "Use one alphabet in a name. Latin, Greek, and Cyrillic letters do not mix."
        ),
        sent: [],
      },
      {
        problem: Option.some("A name needs at least one letter."),
        sent: [],
      },
    ]);
  });

  it("trims spaces at the ends and composes accents before sending, since neither shows", () => {
    expect(submitted("  José ").sent).toStrictEqual([
      { avatar: "", name: "José" },
    ]);
  });

  it.prop(
    "sends every name the room accepts exactly as it was typed",
    { name: names },
    ({ name }) => {
      expect(submitted(name)).toStrictEqual({
        problem: Option.none(),
        sent: [{ avatar: "", name }],
      });
    }
  );
});
