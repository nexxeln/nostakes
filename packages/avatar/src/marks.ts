import type { Tattoo } from "./avatar.js";
import { TATTOO_RED } from "./palette.js";
import { at, line, num, tattooInk } from "./pen.js";
import type { Pen, Point } from "./pen.js";
import { spadeAt } from "./wardrobe.js";

export interface Skinline {
  readonly pen: Pen;
  readonly eye: Point;
  readonly scale: number;
  readonly cheek: Point;
  readonly neck: Point;
}

const HEART =
  "M0 4.2C-3.6 1.6 -5 -0.4 -5 -2C-5 -4 -2.4 -5 0 -2.6C2.4 -5 5 -4 5 -2C5 -0.4 3.6 1.6 0 4.2Z";

const DIAMOND = "M0 -5L3.6 0L0 5L-3.6 0Z";

const CLUB =
  "M0 -5A2.3 2.3 0 0 1 1.7 -1A2.3 2.3 0 1 1 1.2 2.6L2 4.8H-2L-1.2 2.6A2.3 2.3 0 1 1 -1.7 -1A2.3 2.3 0 0 1 0 -5Z";

const suitAt = (path: string, centre: Point, size: number, fill: string) =>
  `<path d="${path}" transform="translate(${at(centre)}) scale(${num(size / 10)})" fill="${fill}"/>`;

const rightCheek = (mark: Skinline): Point => ({
  x: 100 - mark.cheek.x + 1.5,
  y: mark.cheek.y + 1,
});

const banner = (mark: Skinline, words: string) => {
  const { pen } = mark;
  const y = mark.neck.y - 6;
  const ink = tattooInk(pen);
  const ribbon = `M29 ${num(y - 4.6)}Q50 ${num(y - 8.6)} 71 ${num(y - 4.6)}L69 ${num(y + 0.6)}L71.4 ${num(y + 5.6)}Q50 ${num(y + 1.6)} 28.6 ${num(y + 5.6)}L31 ${num(y + 0.6)}Z`;

  const text = pen.small
    ? `<path d="M37 ${num(y - 0.6)}Q50 ${num(y - 3)} 63 ${num(y - 0.6)}" ${line(pen, "#fffdf6", 2.4)}/>`
    : `<text x="50" y="${num(y + 1.6)}" font-family="Impact, 'Arial Black', 'Helvetica Neue', sans-serif" font-size="7.4" font-weight="900" letter-spacing="0.3" text-anchor="middle" fill="#fffdf6">${words}</text>`;

  return `<path d="${ribbon}" fill="${TATTOO_RED}" stroke="${ink}" stroke-width="${pen.width(1.6)}" stroke-linejoin="round"/>${text}`;
};

export const TATTOO_ART: Readonly<Record<Tattoo, (mark: Skinline) => string>> =
  {
    AllIn: (mark) => banner(mark, "ALL IN"),
    Anchor: (mark) => {
      const c = rightCheek(mark);
      const ink = tattooInk(mark.pen);

      return `<g transform="translate(${at(c)}) rotate(-14) scale(1.45)"><path d="M0 -3.6V4.6M-2.8 -1.6H2.8M-4.4 1.4Q-4 5.2 0 5.2Q4 5.2 4.4 1.4" ${line(mark.pen, ink, 1.3)}/><circle cx="0" cy="-4.8" r="1.3" ${line(mark.pen, ink, 1.1)}/></g>`;
    },
    Chip: (mark) => {
      const c = rightCheek(mark);
      const ink = tattooInk(mark.pen);

      return `<circle cx="${num(c.x)}" cy="${num(c.y)}" r="6" fill="${TATTOO_RED}" stroke="${ink}" stroke-width="${mark.pen.width(1.5)}"/><circle cx="${num(c.x)}" cy="${num(c.y)}" r="6" ${line(mark.pen, "#fffdf6", 1.6)} stroke-dasharray="2.1 2.6"/><circle cx="${num(c.x)}" cy="${num(c.y)}" r="2.8" fill="#fffdf6" stroke="${ink}" stroke-width="${mark.pen.width(1)}"/>`;
    },
    Dice: (mark) => {
      const c = rightCheek(mark);
      const ink = tattooInk(mark.pen);

      return `<g transform="translate(${at(c)}) rotate(14)"><rect x="-5.4" y="-5.4" width="10.8" height="10.8" rx="2.2" fill="#fffdf6" stroke="${ink}" stroke-width="${mark.pen.width(1.5)}"/><circle cx="-2.4" cy="-2.4" r="1.3" fill="${ink}"/><circle cx="0" cy="0" r="1.3" fill="${TATTOO_RED}"/><circle cx="2.4" cy="2.4" r="1.3" fill="${ink}"/></g>`;
    },
    NoFold: (mark) => banner(mark, "NO FOLD"),
    None: () => "",
    Scar: (mark) => {
      const centre = { x: 100 - mark.eye.x, y: mark.eye.y };
      const s = mark.scale;
      const from = { x: centre.x - 5 * s, y: centre.y - 14 * s };
      const to = { x: centre.x + 5.4 * s, y: centre.y + 11 * s };

      return `<path d="M${at(from)}L${at(to)}" ${line(mark.pen, "#ffc2cc", 3.4)}/><path d="M${at(from)}L${at(to)}" ${line(mark.pen, "#e05a78", 1.3)}/><path d="M${num(centre.x - 6.6 * s)} ${num(centre.y - 9.8 * s)}l4.4 1.4M${num(centre.x + 2.2 * s)} ${num(centre.y + 6.2 * s)}l4.4 1.4" ${line(mark.pen, "#e05a78", 1.3)}/>`;
    },
    Spade: (mark) => spadeAt(rightCheek(mark), 12, tattooInk(mark.pen)),
    Suits: (mark) => {
      const ink = tattooInk(mark.pen);
      const start = { x: mark.cheek.x - 4.4, y: mark.cheek.y - 1 };

      const step = (index: number): Point => ({
        x: start.x + index * 6,
        y: start.y + index * 0.9,
      });

      return (
        spadeAt(step(0), 5.8, ink) +
        suitAt(HEART, step(1), 5.8, TATTOO_RED) +
        suitAt(DIAMOND, step(2), 5.8, TATTOO_RED) +
        suitAt(CLUB, step(3), 5.8, ink)
      );
    },
    Teardrop: (mark) => {
      const s = mark.scale;
      const x = mark.eye.x - 3 * s;
      const y = mark.eye.y + 8.4 * s;

      return `<path d="M${num(x)} ${num(y)}C${num(x - 2.8)} ${num(y + 3.8)} ${num(x - 3)} ${num(y + 6.8)} ${num(x)} ${num(y + 6.8)}C${num(x + 3)} ${num(y + 6.8)} ${num(x + 2.8)} ${num(y + 3.8)} ${num(x)} ${num(y)}Z" fill="${tattooInk(mark.pen)}"/>`;
    },
  };
