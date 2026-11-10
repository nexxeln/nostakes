/* oxlint-disable no-bitwise -- SHA-256 (FIPS 180-4) and HMAC (RFC 2104) are defined on 32-bit words and bytes with xor, and, not, shifts, and rotations. This file is the in-repo stand-in for an audited synchronous library such as @noble/hashes until the owner signs one off; swap the bodies of sha256 and hmacSha256 and keep their signatures. */

import { concatBytes } from "./bytes.js";

const BLOCK_BYTES = 64;

const LENGTH_BYTES = 8;

const DIGEST_WORDS = 8;

const SCHEDULE_WORDS = 64;

const ROUND_CONSTANTS = Uint32Array.of(
  0x42_8a_2f_98,
  0x71_37_44_91,
  0xb5_c0_fb_cf,
  0xe9_b5_db_a5,
  0x39_56_c2_5b,
  0x59_f1_11_f1,
  0x92_3f_82_a4,
  0xab_1c_5e_d5,
  0xd8_07_aa_98,
  0x12_83_5b_01,
  0x24_31_85_be,
  0x55_0c_7d_c3,
  0x72_be_5d_74,
  0x80_de_b1_fe,
  0x9b_dc_06_a7,
  0xc1_9b_f1_74,
  0xe4_9b_69_c1,
  0xef_be_47_86,
  0x0f_c1_9d_c6,
  0x24_0c_a1_cc,
  0x2d_e9_2c_6f,
  0x4a_74_84_aa,
  0x5c_b0_a9_dc,
  0x76_f9_88_da,
  0x98_3e_51_52,
  0xa8_31_c6_6d,
  0xb0_03_27_c8,
  0xbf_59_7f_c7,
  0xc6_e0_0b_f3,
  0xd5_a7_91_47,
  0x06_ca_63_51,
  0x14_29_29_67,
  0x27_b7_0a_85,
  0x2e_1b_21_38,
  0x4d_2c_6d_fc,
  0x53_38_0d_13,
  0x65_0a_73_54,
  0x76_6a_0a_bb,
  0x81_c2_c9_2e,
  0x92_72_2c_85,
  0xa2_bf_e8_a1,
  0xa8_1a_66_4b,
  0xc2_4b_8b_70,
  0xc7_6c_51_a3,
  0xd1_92_e8_19,
  0xd6_99_06_24,
  0xf4_0e_35_85,
  0x10_6a_a0_70,
  0x19_a4_c1_16,
  0x1e_37_6c_08,
  0x27_48_77_4c,
  0x34_b0_bc_b5,
  0x39_1c_0c_b3,
  0x4e_d8_aa_4a,
  0x5b_9c_ca_4f,
  0x68_2e_6f_f3,
  0x74_8f_82_ee,
  0x78_a5_63_6f,
  0x84_c8_78_14,
  0x8c_c7_02_08,
  0x90_be_ff_fa,
  0xa4_50_6c_eb,
  0xbe_f9_a3_f7,
  0xc6_71_78_f2
);

const INITIAL_HASH = Uint32Array.of(
  0x6a_09_e6_67,
  0xbb_67_ae_85,
  0x3c_6e_f3_72,
  0xa5_4f_f5_3a,
  0x51_0e_52_7f,
  0x9b_05_68_8c,
  0x1f_83_d9_ab,
  0x5b_e0_cd_19
);

const word = (words: Uint32Array, index: number) => words[index] ?? 0;

const rotateRight = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

const padded = (message: Uint8Array) => {
  const blocks = Math.ceil((message.length + 1 + LENGTH_BYTES) / BLOCK_BYTES);
  const bytes = new Uint8Array(blocks * BLOCK_BYTES);
  const view = new DataView(bytes.buffer);
  const bits = message.length * 8;

  bytes.set(message);
  bytes[message.length] = 0x80;
  view.setUint32(bytes.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(bytes.length - 4, bits % 2 ** 32);

  return view;
};

const expandSchedule = (
  schedule: Uint32Array,
  view: DataView,
  offset: number
) => {
  for (let round = 0; round < 16; round += 1) {
    schedule[round] = view.getUint32(offset + round * 4);
  }

  for (let round = 16; round < SCHEDULE_WORDS; round += 1) {
    const early = word(schedule, round - 15);
    const late = word(schedule, round - 2);

    const sigma0 =
      rotateRight(early, 7) ^ rotateRight(early, 18) ^ (early >>> 3);

    const sigma1 =
      rotateRight(late, 17) ^ rotateRight(late, 19) ^ (late >>> 10);

    schedule[round] =
      (word(schedule, round - 16) +
        sigma0 +
        word(schedule, round - 7) +
        sigma1) >>>
      0;
  }
};

const compress = (hash: Uint32Array, schedule: Uint32Array) => {
  let [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = hash;

  for (let round = 0; round < SCHEDULE_WORDS; round += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);

    const first =
      h + sum1 + choice + word(ROUND_CONSTANTS, round) + word(schedule, round);

    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);

    h = g;
    g = f;
    f = e;
    e = (d + first) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (first + sum0 + majority) >>> 0;
  }

  for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) {
    hash[index] = (word(hash, index) + value) >>> 0;
  }
};

export const sha256 = (message: Uint8Array): Uint8Array => {
  const view = padded(message);
  const hash = Uint32Array.from(INITIAL_HASH);
  const schedule = new Uint32Array(SCHEDULE_WORDS);

  for (let offset = 0; offset < view.byteLength; offset += BLOCK_BYTES) {
    expandSchedule(schedule, view, offset);
    compress(hash, schedule);
  }

  const digest = new Uint8Array(DIGEST_WORDS * 4);
  const out = new DataView(digest.buffer);

  for (let index = 0; index < DIGEST_WORDS; index += 1) {
    out.setUint32(index * 4, word(hash, index));
  }

  return digest;
};

const HMAC_BLOCK_BYTES = 64;

const INNER_PAD = 0x36;

const OUTER_PAD = 0x5c;

export const hmacSha256 = (
  key: Uint8Array,
  message: Uint8Array
): Uint8Array => {
  const block = new Uint8Array(HMAC_BLOCK_BYTES);

  block.set(key.length > HMAC_BLOCK_BYTES ? sha256(key) : key);

  const inner = block.map((byte) => byte ^ INNER_PAD);
  const outer = block.map((byte) => byte ^ OUTER_PAD);

  return sha256(concatBytes([outer, sha256(concatBytes([inner, message]))]));
};
