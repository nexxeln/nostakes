import { concatBytes, uint32, utf8 } from "./bytes.js";
import { sha256 } from "./sha256.js";

export const DOMAIN = "nostakes/shuffle/v1";

export const framed = (fields: readonly Uint8Array[]): Uint8Array =>
  concatBytes(fields.flatMap((field) => [uint32(field.length), field]));

export const taggedHash = (
  purpose: string,
  fields: readonly Uint8Array[]
): Uint8Array => sha256(framed([utf8(`${DOMAIN}/${purpose}`), ...fields]));
