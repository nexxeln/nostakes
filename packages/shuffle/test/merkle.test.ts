import { describe, expect, it } from "@effect/vitest";
import { Option, Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  inclusionPath,
  leafHash,
  provenTree,
  rootFromInclusion,
  treeHead,
} from "../src/index.js";
import { between, bytesOfLength } from "./arbitraries.js";

const rfc6962Leaves = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map((hex) => leafHash(Result.getOrThrow(Hex.decode(hex))));

const rfc6962Roots = [
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
  "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
  "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
  "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
  "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
  "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
  "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
];

const leavesOf = (size: number) =>
  Array.from({ length: size }, (_, index) => leafHash(Uint8Array.of(index)));

const rootsAgree = (
  computed: Option.Option<Uint8Array>,
  expected: Uint8Array
) =>
  Option.match(computed, {
    onNone: () => "no root",
    onSome: (root) => Hex.encode(root),
  }) === Hex.encode(expected);

describe("merkle tree (RFC 6962 hashing, RFC 9162 proof checks)", () => {
  it("matches the Certificate Transparency reference roots for one to eight leaves", () => {
    expect(
      rfc6962Roots.map((_, index) =>
        Hex.encode(treeHead(rfc6962Leaves.slice(0, index + 1)))
      )
    ).toEqual(rfc6962Roots);
  });

  it.each([
    [
      0,
      8,
      [
        "96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7",
        "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
        "6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4",
      ],
    ],
    [
      5,
      8,
      [
        "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
        "ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0",
        "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
      ],
    ],
    [
      2,
      3,
      ["fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125"],
    ],
    [
      1,
      5,
      [
        "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
        "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
        "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
      ],
    ],
  ])(
    "gives the reference inclusion path for leaf %i of %i",
    (index, size, path) => {
      expect(
        inclusionPath(index, rfc6962Leaves.slice(0, size)).map((node) =>
          Hex.encode(node)
        )
      ).toEqual(path);
    }
  );

  it("proves every leaf of every tree from one to sixty-four leaves", () => {
    for (let size = 1; size <= 64; size += 1) {
      const leaves = leavesOf(size);
      const root = treeHead(leaves);

      for (const [index, leaf] of leaves.entries()) {
        expect(
          rootsAgree(
            rootFromInclusion(index, size, leaf, inclusionPath(index, leaves)),
            root
          )
        ).toBe(true);
      }
    }
  });

  it("precomputes the same root and paths as the RFC 6962 definition for every tree from one to sixty-four leaves", () => {
    for (let size = 1; size <= 64; size += 1) {
      const leaves = leavesOf(size);
      const tree = provenTree(leaves);

      expect(Hex.encode(tree.head)).toBe(Hex.encode(treeHead(leaves)));

      expect(
        tree.paths.map((path) => path.map((node) => Hex.encode(node)))
      ).toEqual(
        leaves.map((_, index) =>
          inclusionPath(index, leaves).map((node) => Hex.encode(node))
        )
      );
    }
  });

  it.prop(
    "rejects a proof with one byte of one path node changed, a path cut short or padded, or the wrong index",
    {
      flip: between(1, 255),
      index: between(0, 51),
      node: between(0, 5),
      other: between(0, 51),
      padding: bytesOfLength(32),
      spot: between(0, 31),
    },
    ({ flip, index, node, other, padding, spot }) => {
      const leaves = leavesOf(52);
      const root = treeHead(leaves);
      const leaf = leaves[index] ?? new Uint8Array(0);
      const path = inclusionPath(index, leaves);

      const damaged = path.map((step, at) =>
        at === node % path.length
          ? step.map((byte, place) =>
              place === spot ? (byte + flip) % 256 : byte
            )
          : step
      );

      expect(
        rootsAgree(rootFromInclusion(index, 52, leaf, damaged), root)
      ).toBe(false);

      expect(
        rootsAgree(rootFromInclusion(index, 52, leaf, path.slice(1)), root)
      ).toBe(false);

      expect(
        rootsAgree(rootFromInclusion(index, 52, leaf, [...path, padding]), root)
      ).toBe(false);

      expect(rootsAgree(rootFromInclusion(other, 52, leaf, path), root)).toBe(
        other === index
      );
    }
  );
});
