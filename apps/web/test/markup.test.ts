import { describe, expect, it } from "@effect/vitest";
import { avatarFor, render } from "@nostakes/avatar";
import { RoomViewSchema } from "@nostakes/room";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { cardFaceMarks, cardFaceOf } from "../src/features/card-art.js";
import { pictureSvg } from "../src/features/moments/picture.js";
import { recapSvg } from "../src/features/pictures/recap-card.js";
import {
  settleUpCardOf,
  settleUpSvg,
} from "../src/features/pictures/settle-up.js";
import { recapCardOf, recapPictureOf } from "../src/features/recap.js";
import { nameOf } from "../src/features/room.js";
import type { ClosedView } from "../src/features/room.js";

const HOSTILE_NAMES = [
  "<img src=x onerror=alert(1)>",
  '"><svg onload="alert(1)">',
  "</text><script>alert(1)</script>",
  "Ana & <b>Ben</b>",
  "Kit' onfocus='x",
] as const;

const WELL_FORMED_TAG = /^\/?[a-zA-Z][\w:-]*(?:\s+[\w:-]+="[^"<>]*")*\s*\/?$/u;

const ATTRIBUTE_NAME = /\s(?<name>[\w:-]+)="/gu;

const looseTags = (markup: string) =>
  markup
    .split("<")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf(">")))
    .filter(
      (tag) =>
        !WELL_FORMED_TAG.test(tag) ||
        [...tag.matchAll(ATTRIBUTE_NAME)].some((attribute) =>
          (attribute.groups?.name ?? "").toLowerCase().startsWith("on")
        )
    );

const hostile = (view: ClosedView): ClosedView => ({
  ...view,
  departed: view.departed.map((person, index) => ({
    ...person,
    avatar: HOSTILE_NAMES[(index + 1) % HOSTILE_NAMES.length] ?? "",
    name: HOSTILE_NAMES[(index + 2) % HOSTILE_NAMES.length] ?? "",
  })),
  members: view.members.map((person, index) => ({
    ...person,
    avatar: HOSTILE_NAMES[(index + 3) % HOSTILE_NAMES.length] ?? "",
    name: HOSTILE_NAMES[index % HOSTILE_NAMES.length] ?? "",
  })),
});

const closedViews = Arbitrary.schema(RoomViewSchema.cases.Closed);

const LOOK = {
  deck: "TwoColour",
  fonts: "",
  frame: "Chat",
  theme: "Light",
} as const;

describe("markup the page draws from what players typed", () => {
  it.prop(
    "keeps every hostile name and face code out of the tags of every shared picture",
    { view: closedViews },
    ({ view }) => {
      const night = hostile(view);
      const settleUp = settleUpSvg(settleUpCardOf(night), LOOK);

      const pictures = [
        settleUp,
        recapSvg(recapCardOf(night), LOOK),
        ...night.recap.moments.map((recapped) =>
          pictureSvg(recapPictureOf(night, recapped), LOOK)
        ),
      ];

      const tagLike = night.settlement.balances.some(({ player }) =>
        nameOf(night, player).startsWith("<")
      );

      expect({
        drawn: !tagLike || settleUp.includes("&lt;"),
        loose: pictures.flatMap(looseTags),
      }).toStrictEqual({ drawn: true, loose: [] });
    }
  );

  it.prop(
    "draws a face from any stored code without any of its text",
    {
      code: Arbitrary.schema(
        Schema.Union([Schema.Literals(HOSTILE_NAMES), Schema.String])
      ),
    },
    ({ code }) => {
      const face = render(avatarFor(code), {
        expression: "Resting",
        size: 64,
        theme: "Dark",
      });

      expect({
        echoed: HOSTILE_NAMES.some((name) => face.includes(name)),
        loose: looseTags(face),
      }).toStrictEqual({ echoed: false, loose: [] });
    }
  );

  it.prop(
    "draws a card face only for a rank and a suit",
    {
      card: Arbitrary.schema(
        Schema.Union([
          Schema.Literals([
            "Ah",
            "Td",
            "2c",
            "Ks",
            "Ahx",
            "1h",
            "Xs",
            "A",
            "h",
          ]),
          Schema.String,
        ])
      ),
    },
    ({ card }) => {
      const face = cardFaceOf(card);

      expect(
        face === undefined
          ? !/^[2-9TJQKA][cdhs]$/u.test(card)
          : looseTags(cardFaceMarks(face)).length === 0 &&
              /^[2-9TJQKA][cdhs]$/u.test(card)
      ).toBe(true);
    }
  );
});
