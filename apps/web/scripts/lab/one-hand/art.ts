import { render } from "@nostakes/avatar";
import type { Avatar, Expression } from "@nostakes/avatar";

import {
  CARD_HEIGHT,
  cardFaceMarks,
  cardFaceOf,
} from "../../../src/features/card-art.js";

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gu;

export interface Themed {
  readonly markup: string;
  readonly pairs: ReadonlyMap<string, readonly [string, string]>;
}

export interface Inks {
  readonly names: Map<string, string>;
}

export const emptyInks = (): Inks => ({ names: new Map() });

const PAIR_BREAK = "|";

export const themed = (inks: Inks, light: string, dark: string): string => {
  const lights = light.match(COLOUR) ?? [];
  const darks = dark.match(COLOUR) ?? [];

  if (
    lights.length !== darks.length ||
    light.replaceAll(COLOUR, "") !== dark.replaceAll(COLOUR, "")
  ) {
    return light;
  }

  const queue = [...darks];

  return light.replaceAll(COLOUR, (found) => {
    const other = queue.shift() ?? found;

    if (other === found) {
      return found;
    }

    const pair = `${found}${PAIR_BREAK}${other}`;
    const name = inks.names.get(pair) ?? `--i${inks.names.size}`;

    inks.names.set(pair, name);

    return `var(${name})`;
  });
};

export const inkRules = (inks: Inks) => {
  const pairs = [...inks.names.entries()].map(
    ([pair, name]) => [name, ...pair.split(PAIR_BREAK)] as const
  );

  const light = pairs.map(([name, value]) => `${name}:${value}`).join(";");

  const dark = pairs
    .map(([name, , value]) => `${name}:${value ?? ""}`)
    .join(";");

  return `:root{${light}}\n@media (prefers-color-scheme:dark){:root{${dark}}}`;
};

const FACE_PX = 76;

const sized = (svg: string) =>
  svg.replace(/ width="[\d.]+" height="[\d.]+"/u, ' aria-hidden="true"');

export const faceSvg = (inks: Inks, avatar: Avatar, expression: Expression) =>
  sized(
    themed(
      inks,
      render(avatar, { expression, size: FACE_PX, theme: "Light" }),
      render(avatar, { expression, size: FACE_PX, theme: "Dark" })
    )
  );

const SHEET_OPEN = /(?=<g class="sheet" style="--sheet:\d+">)/u;

const SVG_OPEN = /^<svg [^>]*>/u;

const sheetsOf = (inks: Inks, avatar: Avatar, expression: Expression) => {
  const draw = (theme: "Dark" | "Light") =>
    render(avatar, { expression, layers: true, size: 180, theme });

  const drawn = themed(inks, draw("Light"), draw("Dark"));
  const open = SVG_OPEN.exec(drawn)?.[0] ?? "<svg>";

  return drawn
    .replace(SVG_OPEN, "")
    .replace(/<\/svg>$/u, "")
    .split(SHEET_OPEN)
    .filter((sheet) => sheet !== "")
    .map(
      (sheet, index) =>
        `${sized(open).replace("<svg ", `<svg class="ly" data-p="ly-${index}" `)}${sheet}</svg>`
    )
    .join("");
};

export const CLOSEUP_SHEETS = 14;

export const closeupMarkup = (
  inks: Inks,
  role: Pick<Role, "avatar" | "city" | "name">,
  expressions: readonly Expression[],
  extra: string
) =>
  [
    '<div class="c closeup">',
    '<i class="sh" data-p="sh"></i>',
    '<div class="panel">',
    '<div class="big">',
    ...expressions.map(
      (expression) =>
        `<div class="stack" data-p="st-${expression}">${sheetsOf(inks, role.avatar, expression)}</div>`
    ),
    "</div>",
    extra,
    `<span class="who-big">${role.name}</span><span class="where">${role.city}</span>`,
    "</div></div>",
  ].join("");

export const ringMarkup = () =>
  `<div class="ring" data-p="ring"><i class="track"></i>${[0, 1, 2, 3]
    .map(
      (side) => `<i class="side side-${side}"><i data-p="ring-${side}"></i></i>`
    )
    .join("")}</div>`;

export const RAIL =
  '<div class="rail"><i class="track"></i><i class="puck" data-p="puck"></i><span class="read" data-p="read"><i>Raise to</i><b>180</b></span></div>';

export interface Role {
  readonly acts: readonly string[];
  readonly avatar: Avatar;
  readonly city: string;
  readonly clock: string;
  readonly expressions: readonly Expression[];
  readonly name: string;
  readonly poke: Expression;
  readonly won: string;
}

export const idOf = (name: string) => name.toLowerCase();

export const actorMarkup = (inks: Inks, role: Role) => {
  const faces = role.expressions
    .map(
      (expression) =>
        `<div class="ex" data-p="ex-${expression}">${faceSvg(inks, role.avatar, expression)}</div>`
    )
    .join("");

  const acts = role.acts
    .map(
      (act, index) =>
        `<span class="act${act.startsWith("All in") ? " hot" : ""}" data-p="act-${index}">${act}</span>`
    )
    .join("");

  return [
    `<div class="c actor" data-poke="${role.poke}">`,
    '<i class="sh" data-p="sh"></i>',
    '<div class="tile" data-p="tile">',
    '<div class="hop">',
    `<div class="frame"></div><div class="pic">${faces}</div>`,
    ringMarkup(),
    role.won === "" ? "" : `<b class="tab" data-p="tab">${role.won}</b>`,
    '<b class="seal-ok" data-p="ok">checked</b>',
    "</div></div>",
    '<div class="label">',
    `<span class="name">${role.name}</span>`,
    '<span class="line">',
    `<span class="place" data-p="place">${role.city}<i>${role.clock}</i></span>`,
    `<span class="city" data-p="city">${role.city}</span>`,
    acts,
    "</span></div></div>",
  ].join("");
};

export const cardMarkup = (card: string, kind: string) => {
  const face = cardFaceOf(card);

  const front =
    face === undefined
      ? ""
      : `<div class="fc suit-${face.suit}" data-p="fc"><svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true">${cardFaceMarks(face)}</svg></div>`;

  return `<div class="c card ${kind}"><i class="sh" data-p="sh"></i><div class="bd" data-p="bd"><div class="bk" data-p="bk"></div>${front}</div></div>`;
};

export const peekCardMarkup = (card: string) => {
  const face = cardFaceOf(card);

  const marks =
    face === undefined
      ? ""
      : `<svg viewBox="0 0 100 ${CARD_HEIGHT}" aria-hidden="true">${cardFaceMarks(face)}</svg>`;

  const suit = face === undefined ? "s" : face.suit;

  return [
    '<div class="c card board river">',
    '<i class="sh" data-p="sh"></i>',
    '<div class="bd" data-p="bd"><div class="bob"><div class="pk">',
    '<div class="bk" data-p="bk"></div>',
    `<div class="fc suit-${suit}" data-p="fc">${marks}</div>`,
    `<div class="fc pv suit-${suit}">${marks}</div>`,
    "</div></div></div>",
    '<b class="hold" data-p="hold"><i>Hold to peek</i></b>',
    '<button class="peek" type="button" data-p="peek" aria-label="Hold to peek at the river card"></button>',
    "</div>",
  ].join("");
};

export const pileMarkup = (amount: string, chip: number) =>
  `<div class="c pile"><i class="dot paper-chip chip-${chip}"></i><span class="amt">${amount}</span></div>`;

export const stackMarkup = (amount: string, chips: readonly number[]) =>
  `<div class="c pile tall">${chips
    .map(
      (chip, index) =>
        `<i class="dot paper-chip chip-${chip}" style="--n:${index}"></i>`
    )
    .join("")}<span class="amt">${amount}</span></div>`;

export const potMarkup = (amounts: readonly string[]) =>
  `<div class="c pot"><span class="k">Pot</span><span class="vs">${amounts
    .map(
      (amount, index) => `<span class="v" data-p="v-${index}">${amount}</span>`
    )
    .join("")}</span></div>`;

export const bubbleMarkup = (who: string, text: string, extra = "") =>
  `<div class="c bubble"><span class="who">${who}</span><span class="say">${text}</span>${extra}</div>`;

export const captionMarkup = (lines: readonly string[]) =>
  `<p class="cap">${lines
    .map((line, index) => `<span class="l${index}">${line}</span>`)
    .join("")}</p>`;

export const sheetMarkup = (kind: string, inner: string) =>
  `<div class="c ${kind}">${inner}</div>`;
