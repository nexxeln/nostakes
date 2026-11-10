import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

export const sha256 = (message: Uint8Array): Uint8Array => nobleSha256(message);

export const hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array =>
  hmac(nobleSha256, key, message);
