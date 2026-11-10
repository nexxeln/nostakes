import { describe, expect, it } from "@effect/vitest";
import { RejectionSchema } from "@nostakes/engine";
import {
  RoomRejectionSchema,
  RoomViewSchema,
  TableRejected,
} from "@nostakes/room";
import type { RoomRejection } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { rejectionText } from "../src/features/rejections.js";

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const roomTags = RoomRejectionSchema.members.map((member) =>
  Arbitrary.schema(member)
);

const tableTags = RejectionSchema.members.map((member) =>
  Arbitrary.schema(member)
);

const rejectionJson = Schema.fromJsonString(
  Schema.toCodecJson(RoomRejectionSchema)
);

const encodeRejection = Schema.encodeSync(rejectionJson);

const decodeRejection = Schema.decodeSync(rejectionJson);

const MARKED = "zz-player-id-zz";

const PLAYER_FIELD = /"(?<field>player|host|occupant)":"(?:[^"\\]|\\.)*"/gu;

const withMarkedPlayers = (rejection: RoomRejection) =>
  decodeRejection(
    encodeRejection(rejection).replaceAll(
      PLAYER_FIELD,
      (_, field: string) => `"${field}":"${MARKED}"`
    )
  );

const isTableRejection = Schema.is(TableRejected);

const tagsIn = (rejection: RoomRejection) =>
  isTableRejection(rejection)
    ? [rejection._tag, rejection.rejection._tag]
    : [rejection._tag];

const plain = (sentence: string, rejection: RoomRejection) => {
  expect(sentence.length).toBeGreaterThan(0);
  expect(sentence).toMatch(/[.!]$/u);

  for (const tag of tagsIn(rejection)) {
    expect(sentence).not.toContain(tag);
  }

  expect(sentence).not.toMatch(/undefined|NaN|\[object/u);

  expect(sentence).not.toContain(MARKED);
};

describe("a refusal in plain words", () => {
  it.prop(
    "has a sentence for every rejection the room can send, naming players by name and never by id",
    {
      rejections: Arbitrary.all(roomTags),
      view: views,
    },
    ({ rejections, view }) => {
      for (const generated of rejections) {
        const rejection = withMarkedPlayers(generated);

        plain(rejectionText(rejection, Option.some(view)), rejection);
        plain(rejectionText(rejection, Option.none()), rejection);
      }
    },
    { arbitrary: { runs: 40 } }
  );

  it.prop(
    "has a sentence for every rejection the table can send inside the room's",
    {
      rejections: Arbitrary.all(tableTags),
      view: views,
    },
    ({ rejections, view }) => {
      for (const inner of rejections) {
        const rejection = withMarkedPlayers(
          new TableRejected({ rejection: inner })
        );

        plain(rejectionText(rejection, Option.some(view)), rejection);
      }
    },
    { arbitrary: { runs: 40 } }
  );
});
