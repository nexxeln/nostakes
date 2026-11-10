import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import * as Hex from "effect/encoding/Hex";

import { hmacSha256, sha256 } from "../src/index.js";
import { between, bytesOfLength, bytesUpTo } from "./arbitraries.js";

const text = (value: string) => new TextEncoder().encode(value);

const webCryptoHmac = (key: Uint8Array, message: Uint8Array) =>
  Effect.gen(function* signWithWebCrypto() {
    const imported = yield* Effect.promise(() =>
      globalThis.crypto.subtle.importKey(
        "raw",
        Uint8Array.from(key),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign"]
      )
    );

    const mac = yield* Effect.promise(() =>
      globalThis.crypto.subtle.sign("HMAC", imported, Uint8Array.from(message))
    );

    return Hex.encode(new Uint8Array(mac));
  });

const webCryptoDigest = (message: Uint8Array) =>
  Effect.promise(() =>
    globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(message))
  ).pipe(Effect.map((digest) => Hex.encode(new Uint8Array(digest))));

describe("sha256", () => {
  it.each([
    [
      "the empty message",
      text(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ],
    [
      "abc, the FIPS 180-2 one-block example",
      text("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ],
    [
      "the FIPS 180-2 448-bit two-block example",
      text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
    [
      "the FIPS 180-2 896-bit example",
      text(
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"
      ),
      "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    ],
    [
      "one million repetitions of a",
      new Uint8Array(1_000_000).fill(0x61),
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    ],
  ])("matches the published digest of %s", (_, message, digest) => {
    expect(Hex.encode(sha256(message))).toBe(digest);
  });

  it.effect(
    "matches Web Crypto at every length around the padding boundaries",
    () =>
      Effect.gen(function* paddingBoundaries() {
        for (let length = 0; length <= 192; length += 1) {
          const message = Uint8Array.from({ length }, (_, index) => index);
          const expected = yield* webCryptoDigest(message);

          expect(Hex.encode(sha256(message))).toBe(expected);
        }
      })
  );

  it.effect.prop(
    "matches Web Crypto on random messages",
    { message: bytesUpTo(1000) },
    ({ message }) =>
      Effect.gen(function* againstWebCrypto() {
        const expected = yield* webCryptoDigest(message);

        expect(Hex.encode(sha256(message))).toBe(expected);
      }),
    { arbitrary: { runs: 500 } }
  );
});

describe("hmacSha256", () => {
  it.each([
    [
      "RFC 4231 case 1",
      new Uint8Array(20).fill(0x0b),
      text("Hi There"),
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    ],
    [
      "RFC 4231 case 2",
      text("Jefe"),
      text("what do ya want for nothing?"),
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    ],
    [
      "RFC 4231 case 6, a key longer than one block",
      new Uint8Array(131).fill(0xaa),
      text("Test Using Larger Than Block-Size Key - Hash Key First"),
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    ],
  ])("matches %s", (_, key, message, mac) => {
    expect(Hex.encode(hmacSha256(key, message))).toBe(mac);
  });

  it.effect.prop(
    "matches Web Crypto HMAC on random non-empty keys and messages",
    {
      key: between(1, 150).pipe(Arbitrary.flatMap(bytesOfLength)),
      message: bytesUpTo(300),
    },
    ({ key, message }) =>
      Effect.gen(function* againstWebCryptoHmac() {
        const expected = yield* webCryptoHmac(key, message);

        expect(Hex.encode(hmacSha256(key, message))).toBe(expected);
      }),
    { arbitrary: { runs: 300 } }
  );
});
