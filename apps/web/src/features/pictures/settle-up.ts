import { ExpressionSchema } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import type { PlayerId } from "@nostakes/protocol";
import { Schema } from "effect";

import { chipsText } from "../moments/captions.js";
import { nameOf } from "../room.js";
import type { ClosedView } from "../room.js";
import {
  RED,
  escaped,
  faceArt,
  markArt,
  number,
  paletteFor,
  paperSvg,
  sheet,
  titleSize,
} from "./paper.js";
import type { Palette, PictureLook } from "./paper.js";

export const SettleUpCardSchema = Schema.Struct({
  players: Schema.Array(
    Schema.Struct({
      avatar: Schema.String,
      expression: ExpressionSchema,
      name: Schema.String,
      net: Schema.Int,
    })
  ),
  transfers: Schema.Array(
    Schema.Struct({
      amount: Schema.Int,
      from: Schema.String,
      to: Schema.String,
    })
  ),
});

export type SettleUpCard = typeof SettleUpCardSchema.Type;

type CardPlayer = SettleUpCard["players"][number];

type CardTransfer = SettleUpCard["transfers"][number];

const avatarOf = (view: ClosedView, player: PlayerId) =>
  [...view.members, ...view.departed].find((member) => member.player === player)
    ?.avatar ?? "";

export const expressionFor = (net: number, lowest: number): Expression => {
  if (net > 0) {
    return "Happy";
  }

  return net < 0 && net === lowest ? "Gutted" : "Resting";
};

export const settleUpCardOf = (view: ClosedView): SettleUpCard => {
  const ranked = view.settlement.balances.toSorted(
    (left, right) => right.net - left.net
  );

  const lowest = Math.min(0, ...ranked.map(({ net }) => net));

  return {
    players: ranked.map(({ net, player }) => ({
      avatar: avatarOf(view, player),
      expression: expressionFor(net, lowest),
      name: nameOf(view, player),
      net,
    })),
    transfers: view.settlement.transfers.map(({ amount, from, to }) => ({
      amount,
      from: nameOf(view, from),
      to: nameOf(view, to),
    })),
  };
};

const MINUS = "−";

export const netText = (net: number) => {
  if (net === 0) {
    return "even";
  }

  return `${net > 0 ? "+" : MINUS}${chipsText(Math.abs(net))}`;
};

const NARROW = new Set("iljtfrI.,:;'!|() ");

const WIDE = new Set("mwMW@%");

const glyphWidth = (glyph: string) => {
  if (NARROW.has(glyph)) {
    return 0.34;
  }

  if (WIDE.has(glyph)) {
    return 0.92;
  }

  return glyph.toUpperCase() === glyph && glyph.toLowerCase() !== glyph
    ? 0.7
    : 0.6;
};

export const textWidth = (text: string, size: number) => {
  let total = 0;

  for (const glyph of text) {
    total += glyphWidth(glyph);
  }

  return total * size;
};

const ELLIPSIS = "\u2026";

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

export interface Fitted {
  readonly size: number;
  readonly text: string;
}

export const fitted = (text: string, size: number, room: number): Fitted => {
  if (textWidth(text, size) <= room) {
    return { size, text };
  }

  const letters = Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
  let kept = letters.length;

  while (
    kept > 1 &&
    textWidth(`${letters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`, size) >
      room
  ) {
    kept -= 1;
  }

  return {
    size,
    text: `${letters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`,
  };
};

const LEFT = 90;

const RIGHT = 990;

const MARK_ROOM = 124;

const RECEIPT_INSET = 36;

const GAP = 34;

const textAt = (
  fill: string,
  at: { readonly x: number; readonly y: number },
  fit: Fitted,
  style: {
    readonly anchor?: "end" | "start";
    readonly display?: boolean;
    readonly weight: number;
  }
) =>
  `<text x="${number(at.x)}" y="${number(at.y)}"${style.anchor === "end" ? ' text-anchor="end"' : ""} font-family="${style.display === true ? "DM Sans, Figtree" : "Figtree"}, sans-serif" font-weight="${style.weight}" font-size="${number(fit.size)}" fill="${fill}">${escaped(fit.text)}</text>`;

const titleArt = (palette: Palette) => {
  const title = "Settle up";
  const size = number(titleSize(title, 900, 118));

  const text = (fill: string, dx: number, dy: number) =>
    `<text x="${LEFT + dx}" y="${190 + dy}" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${size}" letter-spacing="${number(-size * 0.035)}" fill="${fill}">${title}</text>`;

  return [text(RED, size * 0.05, size * 0.035), text(palette.ink, 0, 0)].join(
    ""
  );
};

const paymentsLine = (count: number) => {
  if (count === 0) {
    return "Everyone is square.";
  }

  return count === 1
    ? "One payment squares the night."
    : `${count} payments square the night.`;
};

const netFill = (palette: Palette, player: CardPlayer, best: number) => {
  if (player.net > 0 && player.net === best) {
    return RED;
  }

  return player.net > 0 ? palette.ink : palette.muted;
};

const playerRow = (
  palette: Palette,
  look: PictureLook,
  player: CardPlayer,
  place: {
    readonly best: number;
    readonly height: number;
    readonly stacked: boolean;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const face = Math.round(
    Math.min(place.height * 0.84, place.stacked ? 116 : 150)
  );

  const net = netText(player.net);
  const nameX = place.x + face + place.height * 0.2;
  const right = place.x + place.width;
  const middle = place.y + face / 2;
  const fill = netFill(palette, player, place.best);

  const faceTile = faceArt(palette, { ...player, name: "" }, look.theme, {
    size: face,
    tagged: false,
    x: place.x,
    y: place.y,
  });

  if (place.stacked) {
    const nameSize = Math.min(42, place.height * 0.32);
    const netSize = Math.min(48, place.height * 0.36);

    return [
      faceTile,
      textAt(
        palette.ink,
        { x: nameX, y: place.y + face * 0.44 },
        fitted(player.name, nameSize, right - nameX),
        { weight: 700 }
      ),
      textAt(
        fill,
        { x: nameX, y: place.y + face * 0.9 },
        { size: netSize, text: net },
        { display: true, weight: 800 }
      ),
    ].join("");
  }

  const netSize = Math.min(64, place.height * 0.44);

  return [
    faceTile,
    textAt(
      palette.ink,
      { x: nameX, y: middle + place.height * 0.14 },
      fitted(
        player.name,
        Math.min(52, place.height * 0.36),
        right - nameX - textWidth(net, netSize) - place.height * 0.3
      ),
      { weight: 700 }
    ),
    textAt(
      fill,
      { x: right, y: middle + place.height * 0.16 },
      { size: netSize, text: net },
      { anchor: "end", display: true, weight: 800 }
    ),
  ].join("");
};

const playersArt = (
  palette: Palette,
  look: PictureLook,
  players: readonly CardPlayer[],
  box: {
    readonly columns: number;
    readonly rowHeight: number;
    readonly y: number;
  }
) => {
  const rows = Math.ceil(players.length / box.columns);
  const gutter = 44;
  const width = (RIGHT - LEFT - gutter * (box.columns - 1)) / box.columns;
  const best = Math.max(0, ...players.map(({ net }) => net));

  return players
    .map((player, index) =>
      playerRow(palette, look, player, {
        best,
        height: box.rowHeight,
        stacked: box.columns > 1,
        width,
        x: LEFT + Math.floor(index / rows) * (width + gutter),
        y: box.y + (index % rows) * box.rowHeight,
      })
    )
    .join("");
};

const transferRow = (
  palette: Palette,
  transfer: CardTransfer,
  place: {
    readonly height: number;
    readonly inset: number;
    readonly y: number;
  }
) => {
  const size = Math.min(40, place.height * 0.6);
  const amountSize = size * 1.1;
  const amount = chipsText(transfer.amount);
  const left = LEFT + place.inset;
  const right = RIGHT - place.inset;
  const pays = " pays ";
  const free = right - left - textWidth(amount, amountSize) - size;
  const nameRoom = (free - textWidth(pays, size)) / 2;
  const from = fitted(transfer.from, size, nameRoom);
  const to = fitted(transfer.to, size, nameRoom);
  const baseline = place.y + place.height * 0.68;

  return [
    `<text x="${number(left)}" y="${number(baseline)}" font-family="Figtree, sans-serif" font-size="${number(size)}" xml:space="preserve">`,
    `<tspan font-weight="700" fill="${palette.cardInk}">${escaped(from.text)}</tspan>`,
    `<tspan font-weight="500" fill="${palette.cardMuted}">${pays}</tspan>`,
    `<tspan font-weight="700" fill="${palette.cardInk}">${escaped(to.text)}</tspan>`,
    "</text>",
    textAt(
      palette.cardInk,
      { x: right, y: baseline },
      { size: amountSize, text: amount },
      { anchor: "end", display: true, weight: 800 }
    ),
  ].join("");
};

const receiptArt = (
  palette: Palette,
  transfers: readonly CardTransfer[],
  box: { readonly rowHeight: number; readonly y: number }
) => {
  const inset = RECEIPT_INSET;
  const height = transfers.length * box.rowHeight + inset * 1.2;

  return [
    sheet(palette, {
      fill: palette.card,
      height,
      lift: 4,
      radius: 26,
      width: RIGHT - LEFT,
      x: LEFT,
      y: box.y,
    }),
    ...transfers.map((transfer, index) =>
      transferRow(palette, transfer, {
        height: box.rowHeight,
        inset,
        y: box.y + inset * 0.6 + index * box.rowHeight,
      })
    ),
  ].join("");
};

const STORY_GROWTH = 1.3;

const HEADER_TOP = 110;

const HEADER_BOTTOM = 304;

interface Plan {
  readonly columns: number;
  readonly payHeight: number;
  readonly playersTop: number;
  readonly receiptTop: number;
  readonly rowHeight: number;
  readonly shift: number;
}

const planFor = (card: SettleUpCard, tall: boolean): Plan => {
  const growth = tall ? STORY_GROWTH : 1;
  const columns = card.players.length > 4 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(card.players.length / columns));
  const transfers = card.transfers.length;
  const payHeight = (transfers > 4 ? 52 : 70) * growth;

  const receipt =
    transfers === 0 ? 0 : transfers * payHeight + RECEIPT_INSET * 1.2 + GAP;

  const bottom = (tall ? 1920 : 1350) - MARK_ROOM;
  const playersRoom = bottom - HEADER_BOTTOM - receipt;

  const rowHeight = Math.min(
    (columns === 1 ? 136 : 124) * growth,
    playersRoom / rows
  );

  const block = HEADER_BOTTOM - HEADER_TOP + rows * rowHeight + receipt;
  const shift = tall ? Math.max(0, (bottom - HEADER_TOP - block) / 2) : 0;
  const playersTop = HEADER_BOTTOM + shift;

  return {
    columns,
    payHeight,
    playersTop,
    receiptTop: playersTop + rows * rowHeight + GAP,
    rowHeight,
    shift,
  };
};

export const settleUpSvg = (card: SettleUpCard, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const tall = look.frame === "Story";
  const plan = planFor(card, tall);

  return paperSvg(
    palette,
    look,
    [
      `<g transform="translate(0 ${number(plan.shift)})">`,
      titleArt(palette),
      `<text x="92" y="268" font-family="Figtree, sans-serif" font-weight="600" font-size="42" fill="${palette.muted}">${paymentsLine(card.transfers.length)}</text>`,
      "</g>",
      playersArt(palette, look, card.players, {
        columns: plan.columns,
        rowHeight: plan.rowHeight,
        y: plan.playersTop,
      }),
      card.transfers.length === 0
        ? ""
        : receiptArt(palette, card.transfers, {
            rowHeight: plan.payHeight,
            y: plan.receiptTop,
          }),
      markArt(palette, { x: 1080 - 92, y: (tall ? 1920 : 1350) - 72 }),
    ].join(""),
    tall
  );
};
