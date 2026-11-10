import type { PlayerId } from "@nostakes/protocol";
import { Option, Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import type { Credential } from "./room-storage.js";

export interface HashedCredential {
  readonly player: PlayerId;
  readonly hash: Uint8Array;
}

export const hashedCredential = (credential: Credential): HashedCredential => ({
  hash: Result.getOrElse(Hex.decode(credential.hash), () => new Uint8Array()),
  player: credential.player,
});

const differenceOf = (left: Uint8Array, right: Uint8Array) => {
  let difference = (left.length - right.length) ** 2;

  for (let index = 0; index < left.length; index += 1) {
    difference += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  }

  return difference;
};

export const matchCredential = (
  credentials: readonly HashedCredential[],
  hash: Uint8Array
): Option.Option<PlayerId> => {
  let found = Option.none<PlayerId>();

  for (const credential of credentials) {
    const difference = differenceOf(credential.hash, hash);

    found = difference === 0 ? Option.some(credential.player) : found;
  }

  return found;
};
