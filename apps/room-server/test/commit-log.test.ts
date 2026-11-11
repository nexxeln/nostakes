import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { commitLogOf } from "../src/commit-log.js";
import { roomCodec } from "../src/room-codec.js";
import { CommitNotes } from "../src/room-host.js";
import type { CommitResult } from "../src/room-host.js";
import { ana } from "./fixtures/toy-host.js";
import {
  ToyCommandSchema,
  ToyMemberCommandSchema,
  toyRoom,
} from "./fixtures/toy-room.js";
import type { ToyTypes } from "./fixtures/toy-room.js";

const MARKER = "Nadia Markerworth";

const joined = ToyCommandSchema.cases.Member.make({
  at: 1000,
  by: ana,
  command: ToyMemberCommandSchema.cases.Join.make({
    avatar: "fox",
    name: MARKER,
  }),
});

const codec = roomCodec(toyRoom);

const resultWith = (
  note: CommitResult<ToyTypes>["note"]
): CommitResult<ToyTypes> => ({
  events: [],
  note,
  reply: codec.reply.cases.Unavailable.make({ reason: "StorageFailed" }),
});

describe("the log line a commit writes", () => {
  it("names a halted batch by its kinds, its sequence numbers, and the invariants it broke, never their detail or the command's contents", () => {
    const halted = commitLogOf(
      toyRoom,
      resultWith(
        CommitNotes.Halted({
          from: 7,
          kinds: ["Joined", "SecretDealt", "Incremented"],
          violations: [`NamesAreDistinct: ${MARKER}, ${MARKER}`],
        })
      ),
      joined
    );

    const failed = commitLogOf(
      toyRoom,
      resultWith(
        CommitNotes.StorageFailed({ cause: "SQLITE_FULL: database is full" })
      ),
      joined
    );

    expect([halted, failed]).toStrictEqual([
      Option.some({
        annotations: {
          command: "Join",
          events: "Joined,SecretDealt,Incremented",
          from: 7,
          invariants: "NamesAreDistinct",
          to: 9,
        },
        level: "Error",
        message: "room halted on an unsound commit",
      }),
      Option.some({
        annotations: {
          cause: "SQLITE_FULL: database is full",
          command: "Join",
        },
        level: "Warning",
        message: "room commit could not be stored",
      }),
    ]);
    expect(JSON.stringify([halted, failed])).not.toContain(MARKER);
  });
});
