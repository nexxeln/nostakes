import { INK, SNOW, TATTOO_INK, TATTOO_LIGHT } from "./palette.js";
import type { Skin } from "./palette.js";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Pen {
  readonly skin: Skin;
  readonly small: boolean;
  readonly width: (base: number) => string;
}

export const BOLD_BELOW_PX = 64;

export const num = (value: number) => String(Number(value.toFixed(2)));

export const at = (point: Point) => `${num(point.x)} ${num(point.y)}`;

export const mirror = (body: string) =>
  `<g transform="matrix(-1 0 0 1 100 0)">${body}</g>`;

export const pair = (body: string) => body + mirror(body);

export const rightOf = (left: Point): Point => ({
  x: 100 - left.x,
  y: left.y,
});

export const outlined = (pen: Pen, width: number) =>
  `stroke="${INK}" stroke-width="${pen.width(width)}" stroke-linejoin="round" stroke-linecap="round"`;

export const stroked = (pen: Pen, colour: string, width: number) =>
  `stroke="${colour}" stroke-width="${pen.width(width)}" stroke-linecap="round" stroke-linejoin="round"`;

export const line = (pen: Pen, colour: string, width: number) =>
  `fill="none" ${stroked(pen, colour, width)}`;

export const featureInk = (pen: Pen) => (pen.skin.dark ? SNOW : INK);

export const tattooInk = (pen: Pen) =>
  pen.skin.dark ? TATTOO_LIGHT : TATTOO_INK;

export const moved = (by: Point, body: string) =>
  by.x === 0 && by.y === 0
    ? body
    : `<g transform="translate(${at(by)})">${body}</g>`;

export const nothing = () => "";
