const SVG = "http://www.w3.org/2000/svg";

const SUIT_PATHS = {
  c: "M50 8A21 21 0 1 1 49.9 8ZM29 38A21 21 0 1 1 28.9 38ZM71 38A21 21 0 1 1 70.9 38ZM45 56C45 78 38 90 28 96L72 96C62 90 55 78 55 56Z",
  d: "M50 2C58 20 72 38 88 50C72 62 58 80 50 98C42 80 28 62 12 50C28 38 42 20 50 2Z",
  h: "M50 94C40 80 6 60 6 32C6 14 20 5 33 6C42 7 48 14 50 22C52 14 58 7 67 6C80 5 94 14 94 32C94 60 60 80 50 94Z",
  s: "M50 4C42 20 8 36 8 60C8 78 30 86 45 72C43 84 37 92 28 96L72 96C63 92 57 84 55 72C70 86 92 78 92 60C92 36 58 20 50 4Z",
} as const;

type SuitLetter = keyof typeof SUIT_PATHS;

const isSuitLetter = (letter: string): letter is SuitLetter =>
  Object.hasOwn(SUIT_PATHS, letter);

const CARD_HEIGHT = 140;

const INDEX_SIZE = 46;

const pip = (suit: SuitLetter, x: number, y: number, size: number) =>
  `<path d="${SUIT_PATHS[suit]}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})"/>`;

const faceArt = (rank: string, suit: SuitLetter) =>
  `<svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true"><text x="12" y="50" font-size="${INDEX_SIZE}"${rank.length > 1 ? ` letter-spacing="${-INDEX_SIZE * 0.09}"` : ""}>${rank}</text>${pip(suit, 24, 70, 24)}${pip(suit, 64, CARD_HEIGHT * 0.73, 50)}</svg>`;

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

const RANKS = "23456789TJQKA";

const fillFace = (face: HTMLElement, card: string) => {
  const letter = card.charAt(0);
  const rank = letter === "T" ? "10" : letter;
  const suit = card.charAt(1);

  if (RANKS.includes(letter) && letter !== "" && isSuitLetter(suit)) {
    face.className = `face suit-${suit}`;
    face.innerHTML = faceArt(rank, suit);
  }
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
