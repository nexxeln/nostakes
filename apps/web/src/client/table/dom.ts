const SVG = "http://www.w3.org/2000/svg";

const SUITS = new Map([
  ["c", { red: false, symbol: "♣" }],
  ["d", { red: true, symbol: "♦" }],
  ["h", { red: true, symbol: "♥" }],
  ["s", { red: false, symbol: "♠" }],
]);

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

const fillFace = (face: HTMLElement, card: string) => {
  const rank = card.startsWith("T") ? "10" : card.charAt(0);
  const suit = SUITS.get(card.charAt(1)) ?? { red: false, symbol: "" };
  const index = el("div", "ix", face);

  face.className = suit.red ? "face red" : "face";
  el("div", "r", index, rank);
  el("div", "s", index, suit.symbol);
  el("div", "pip", face, suit.symbol);
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
    fillFace(face, card);
  }

  el("div", "back", node);

  return node;
};

export const toggle = (node: Element, name: string, on: boolean) => {
  if (node.classList.contains(name) !== on) {
    node.classList.toggle(name, on);
  }
};
