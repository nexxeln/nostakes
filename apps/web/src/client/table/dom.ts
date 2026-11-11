import { paintCardFace } from "./markup.js";

const SVG = "http://www.w3.org/2000/svg";

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: ParentNode,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);

  if (className.length > 0) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  parent?.append(node);

  return node;
};

export const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  parent: ParentNode
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);

  parent.append(node);

  return node;
};

export const cardEl = (
  card: string | null,
  width: number,
  up = false
): HTMLDivElement => {
  const node = el("div", up ? "card up" : "card");
  const face = el("div", "face", node);

  node.style.setProperty("--w", `${width}px`);

  if (card !== null) {
    paintCardFace(face, card);
  }

  el("div", "back", node);

  return node;
};

export const toggle = (node: Element, name: string, on: boolean) => {
  if (node.classList.contains(name) !== on) {
    node.classList.toggle(name, on);
  }
};
