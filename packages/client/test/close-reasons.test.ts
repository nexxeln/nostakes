import { describe, expect, it } from "@effect/vitest";
import { CloseReasonSchema } from "@nostakes/protocol";
import { Option } from "effect";

import { CLOSE_VERDICTS, closeReasonIn } from "../src/index.js";

describe("close reasons", () => {
  it("refuses a bad token, a halted or missing room, and anything the client sent wrong", () => {
    const refusals = CloseReasonSchema.literals.filter(
      (reason) => CLOSE_VERDICTS[reason] === "Refuse"
    );

    expect(refusals).toEqual([
      "NotAuthorized",
      "ProtocolViolation",
      "FrameTooLarge",
      "RoomHalted",
      "NotFound",
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
