import type { Box } from "../../features/moments/clip-plan.js";

export interface PartBox {
  readonly box: Box;
  readonly index: number;
  readonly role: string;
}

const SVG = "http://www.w3.org/2000/svg";

const PART = "[data-part]";

export const isGraphic = (node: Element): node is SVGGraphicsElement =>
  node.namespaceURI === SVG && "getBBox" in node && "transform" in node;

export const topParts = (root: Element): readonly SVGGraphicsElement[] =>
  [...root.querySelectorAll(PART)]
    .filter((part) => part.parentElement?.closest(PART) === null)
    .filter(isGraphic);

export const roleOf = (part: SVGElement) => part.dataset.part ?? "";

export const indexOf = (part: SVGElement) => Number(part.dataset.index ?? "0");

export const measureParts = (root: Element): readonly PartBox[] =>
  topParts(root).map((part) => {
    const box = part.getBBox();

    return {
      box: { height: box.height, width: box.width, x: box.x, y: box.y },
      index: indexOf(part),
      role: roleOf(part),
    };
  });
