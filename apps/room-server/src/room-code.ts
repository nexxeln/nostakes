import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomCodeSchema,
} from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import { Option } from "effect";

export const CODE_DRAW_BYTES = 16;

export const MAX_CODE_ATTEMPTS = 8;

const usableBelow =
  Math.floor(256 / ROOM_CODE_ALPHABET.length) * ROOM_CODE_ALPHABET.length;

export const codeFromBytes = (bytes: Uint8Array): Option.Option<RoomCode> => {
  const letters = [...bytes]
    .filter((byte) => byte < usableBelow)
    .slice(0, ROOM_CODE_LENGTH)
    .map((byte) => ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length));

  return letters.length === ROOM_CODE_LENGTH
    ? Option.some(RoomCodeSchema.make(letters.join("")))
    : Option.none();
};

export const bytesForCode = (code: RoomCode) =>
  Uint8Array.from(code, (letter) => ROOM_CODE_ALPHABET.indexOf(letter));
