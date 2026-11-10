import { describe, expect, it } from "@effect/vitest";
import { Inspectable, Option, Redacted, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  CLOSE_CODES,
  CloseReasonSchema,
  clientFrame,
  clientMessage,
  closingFrame,
  PING_FRAME,
  PONG_FRAME,
  ROOM_CODE_ALPHABET,
  RoomCodeSchema,
  serverFrame,
  serverMessage,
  TokenTextSchema,
} from "../src/index.js";

const SampleCommand = Schema.TaggedUnion({
  Bump: { by: Schema.Int },
  Say: { text: Schema.String },
});

const SampleEvent = Schema.TaggedUnion({
  Bumped: { by: Schema.Int },
  Hidden: { secret: Schema.OptionFromNullOr(Schema.String) },
});

const SampleView = Schema.Struct({
  count: Schema.Int,
  mine: Schema.OptionFromNullOr(Schema.String),
});

const SampleRejection = Schema.Struct({ reason: Schema.String });

const schemas = {
  event: SampleEvent,
  rejection: SampleRejection,
  view: SampleView,
};

const ClientMessages = clientMessage(SampleCommand);

const ServerMessages = serverMessage(schemas);

const ClientFrames = clientFrame(SampleCommand);

const ServerFrames = serverFrame(schemas);

const tokenText = "Y2hpcHMgYXJlIGludGVnZXJzIGFuZCBzbyBhcmUgdGs";

describe("frames", () => {
  it.prop(
    "every server message survives a trip through its JSON frame",
    { message: Arbitrary.schema(ServerMessages) },
    ({ message }) => {
      const text = Schema.encodeSync(ServerFrames)(message);

      expect(
        Schema.encodeSync(ServerFrames)(Schema.decodeSync(ServerFrames)(text))
      ).toBe(text);
    }
  );

  it.prop(
    "every command and ping frame survives a trip through JSON",
    {
      message: Arbitrary.schema(
        Schema.Union([ClientMessages.cases.Command, ClientMessages.cases.Ping])
      ),
    },
    ({ message }) => {
      const text = Schema.encodeSync(ClientFrames)(message);

      expect(
        Schema.encodeSync(ClientFrames)(Schema.decodeSync(ClientFrames)(text))
      ).toBe(text);
    }
  );

  it("reads a hello and keeps its token out of every printed form", () => {
    const hello = Schema.decodeSync(ClientFrames)(
      `{"_tag":"Hello","after":41,"token":"${tokenText}"}`
    );

    expect(ClientMessages.guards.Hello(hello)).toBe(true);

    if (!ClientMessages.guards.Hello(hello)) {
      return;
    }

    expect(hello.after).toEqual(Option.some(41));
    expect(Redacted.value(hello.token)).toBe(tokenText);
    expect(Inspectable.toStringUnknown(hello)).not.toContain(tokenText);
    expect(JSON.stringify(hello)).not.toContain(tokenText);
    expect(
      Schema.encodeSync(ClientFrames)(
        ClientMessages.cases.Hello.make({
          after: Option.none(),
          token: hello.token,
        })
      )
    ).toBe(`{"_tag":"Hello","after":null,"token":"${tokenText}"}`);
  });

  it("refuses a hello whose token is not 32 bytes of base64url", () => {
    for (const token of [
      tokenText.slice(1),
      `${tokenText}A`,
      `${tokenText.slice(1)}+`,
    ]) {
      expect(
        Result.isFailure(
          Schema.decodeResult(ClientFrames)(
            `{"_tag":"Hello","after":null,"token":"${token}"}`
          )
        )
      ).toBe(true);
    }
  });

  it("refuses frames that are not JSON, have an unknown tag, or a bad command", () => {
    for (const text of [
      "not json",
      '{"_tag":"Shout"}',
      '{"_tag":"Command","command":{"_tag":"Bump"},"id":"a"}',
      '{"_tag":"Command","command":{"_tag":"Bump","by":1},"id":""}',
      `{"_tag":"Hello","after":-1,"token":"${tokenText}"}`,
    ]) {
      expect(Result.isFailure(Schema.decodeResult(ClientFrames)(text))).toBe(
        true
      );
    }
  });
});

describe("closing frames", () => {
  it("encode every close reason exactly as the server message union does, whatever the room's schemas", () => {
    const encodeServer = Schema.encodeSync(ServerFrames);

    expect(
      CloseReasonSchema.literals.map((reason) => closingFrame(reason))
    ).toEqual(
      CloseReasonSchema.literals.map((reason) =>
        encodeServer(ServerMessages.cases.Closing.make({ reason }))
      )
    );
    expect(closingFrame("NotFound")).toBe(
      '{"_tag":"Closing","reason":"NotFound"}'
    );
  });

  it("ping and pong encode to the exact texts a runtime can answer without waking the room", () => {
    expect(
      Schema.encodeSync(ClientFrames)(ClientMessages.cases.Ping.make({}))
    ).toBe(PING_FRAME);
    expect(
      Schema.encodeSync(ServerFrames)(ServerMessages.cases.Pong.make({}))
    ).toBe(PONG_FRAME);
  });

  it("give each reason its own close code, all in the ranges a server may send", () => {
    const codes = CloseReasonSchema.literals.map(
      (reason) => CLOSE_CODES[reason]
    );

    expect(new Set(codes).size).toBe(codes.length);
    expect(
      codes.every((code) => code === 1009 || (code >= 4000 && code <= 4999))
    ).toBe(true);
  });
});

describe("room codes", () => {
  it("use six characters from an alphabet without 0, O, 1, I, or L", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(/[0O1IL]/u.test(ROOM_CODE_ALPHABET)).toBe(false);
    expect(Schema.is(RoomCodeSchema)("K7P2XZ")).toBe(true);

    for (const code of [
      "K7P2X",
      "K7P2XZQ",
      "K0P2XZ",
      "KOP2XZ",
      "k7p2xz",
      "KLP2XZ",
    ]) {
      expect(Schema.is(RoomCodeSchema)(code)).toBe(false);
    }
  });

  it("token text is exactly 43 base64url characters", () => {
    expect(Schema.is(TokenTextSchema)(tokenText)).toBe(true);
    expect(tokenText).toHaveLength(43);
  });
});
