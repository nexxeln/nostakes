import { Option } from "effect";

import { concatBytes } from "./bytes.js";
import { sha256 } from "./sha256.js";

const LEAF_PREFIX = Uint8Array.of(0);

const NODE_PREFIX = Uint8Array.of(1);

export const leafHash = (data: Uint8Array): Uint8Array =>
  sha256(concatBytes([LEAF_PREFIX, data]));

export const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array =>
  sha256(concatBytes([NODE_PREFIX, left, right]));

const largestPowerOfTwoBelow = (size: number) => {
  let split = 1;

  while (split * 2 < size) {
    split *= 2;
  }

  return split;
};

export const treeHead = (leaves: readonly Uint8Array[]): Uint8Array => {
  const [only] = leaves;

  if (leaves.length === 0 || only === undefined) {
    return sha256(new Uint8Array(0));
  }

  if (leaves.length === 1) {
    return only;
  }

  const split = largestPowerOfTwoBelow(leaves.length);

  return nodeHash(
    treeHead(leaves.slice(0, split)),
    treeHead(leaves.slice(split))
  );
};

export const inclusionPath = (
  index: number,
  leaves: readonly Uint8Array[]
): readonly Uint8Array[] => {
  if (leaves.length <= 1) {
    return [];
  }

  const split = largestPowerOfTwoBelow(leaves.length);

  return index < split
    ? [
        ...inclusionPath(index, leaves.slice(0, split)),
        treeHead(leaves.slice(split)),
      ]
    : [
        ...inclusionPath(index - split, leaves.slice(split)),
        treeHead(leaves.slice(0, split)),
      ];
};

const isOdd = (value: number) => value % 2 === 1;

const half = (value: number) => Math.floor(value / 2);

export const rootFromInclusion = (
  index: number,
  size: number,
  leaf: Uint8Array,
  path: readonly Uint8Array[]
): Option.Option<Uint8Array> => {
  if (index < 0 || index >= size) {
    return Option.none();
  }

  let node = index;
  let last = size - 1;
  let root = leaf;

  for (const sibling of path) {
    if (last === 0) {
      return Option.none();
    }

    if (isOdd(node) || node === last) {
      root = nodeHash(sibling, root);

      while (!isOdd(node) && node !== 0) {
        node = half(node);
        last = half(last);
      }
    } else {
      root = nodeHash(root, sibling);
    }

    node = half(node);
    last = half(last);
  }

  return last === 0 ? Option.some(root) : Option.none();
};
