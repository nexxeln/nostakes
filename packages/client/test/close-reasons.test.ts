import { describe, expect, it } from "@effect/vitest";
import { CloseReasonSchema } from "@nostakes/protocol";
import { Option } from "effect";

import { CLOSE_VERDICTS, closeReasonIn } from "../src/index.js";

describe("close reasons", () => {
  it("refuses a bad token, a halted or missing room, a room taken over by the player's newer sockets, a pass the host removed, and anything the client sent wrong", () => {
    const refusals = CloseReasonSchema.literals.filter(
      (reason) => CLOSE_VERDICTS[reason] === "Refuse"
    );

    expect(refusals).toEqual([
      "NotAuthorized",
      "ProtocolViolation",
      "FrameTooLarge",
      "RoomHalted",
      "NotFound",
      "OpenedElsewhere",
      "Removed",
    ]);
  });

  it("reads a close reason from the socket's close text and nothing else", () => {
    expect(closeReasonIn("NotAuthorized")).toEqual(
      Option.some("NotAuthorized")
    );
    expect(closeReasonIn("closed")).toEqual(Option.none());
    expect(closeReasonIn("")).toEqual(Option.none());
  });
});
