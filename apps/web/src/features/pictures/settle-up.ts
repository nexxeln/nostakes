import { ExpressionSchema } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import type { PlayerId } from "@nostakes/protocol";
import { Schema } from "effect";

import { chipsText } from "../moments/captions.js";
import { isolated } from "../names.js";
import { nameOf, peopleOf } from "../room.js";
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
import { fitted, textWidth, wrapped } from "./text-fit.js";
import type { Fitted } from "./text-fit.js";

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
  peopleOf(view).find((member) => member.player === player)?.avatar ?? "";

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

interface Slot {
  readonly face: number;
  readonly height: number;
  readonly names: readonly string[];
  readonly nameSize: number;
  readonly netSize: number;
  readonly stacked: boolean;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const playerRow = (
  palette: Palette,
  look: PictureLook,
  player: CardPlayer,
  place: Slot & { readonly best: number }
) => {
  const { face, nameSize, names, netSize } = place;
  const net = netText(player.net);
  const nameX = place.x + face + Math.min(32, face * 0.24);
  const right = place.x + place.width;
  const fill = netFill(palette, player, place.best);
  const step = nameSize * 1.1;

  const faceTile = faceArt(palette, { ...player, name: "" }, look.theme, {
    size: face,
    tagged: false,
    x: place.x,
    y: place.y,
  });

  if (place.stacked) {
    const first = place.y + face * 0.44;

    return [
      faceTile,
      textAt(
        palette.ink,
        { x: nameX, y: first },
        { size: nameSize, text: names[0] ?? "" },
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

  const middle = place.y + face / 2;
  const first = middle + nameSize * 0.36 - ((names.length - 1) * step) / 2;

  return [
    faceTile,
    ...names.map((name, line) =>
      textAt(
        palette.ink,
        { x: nameX, y: first + line * step },
        { size: nameSize, text: name },
        { weight: 700 }
      )
    ),
    textAt(
      fill,
      { x: right, y: middle + netSize * 0.36 },
      { size: netSize, text: net },
      { anchor: "end", display: true, weight: 800 }
    ),
  ].join("");
};

const PAYS = " pays ";

const BROKEN_ROW = 1.75;

const RECEIPT_ROOM = RIGHT - LEFT - RECEIPT_INSET * 2;

const firstNameOf = (name: string) => name.split(" ")[0] ?? name;

const uniqueFirstName = (players: readonly CardPlayer[]) => {
  const counts = new Map<string, number>();

  for (const { name } of players) {
    const first = firstNameOf(name);

    counts.set(first, (counts.get(first) ?? 0) + 1);
  }

  return (name: string) => {
    const first = firstNameOf(name);

    return first !== name && counts.get(first) === 1 ? [name, first] : [name];
  };
};

interface PayLine {
  readonly amount: string;
  readonly amountSize: number;
  readonly from: string;
  readonly lines: number;
  readonly size: number;
  readonly to: string;
}

const payLineOf = (
  transfer: CardTransfer,
  forms: (name: string) => readonly string[],
  place: { readonly height: number; readonly tall: boolean }
): PayLine => {
  const size = Math.min(40, place.height * 0.6);
  const amountSize = size * 1.1;
  const amount = chipsText(transfer.amount);
  const free = RECEIPT_ROOM - textWidth(amount, amountSize) - size;
  const pays = textWidth(PAYS, size);
  const froms = forms(transfer.from);
  const tos = forms(transfer.to);

  const pairs = froms.flatMap((from) => tos.map((to) => [from, to] as const));

  const fits = pairs.find(
    ([from, to]) => textWidth(from, size) + pays + textWidth(to, size) <= free
  );

  if (fits !== undefined) {
    return { amount, amountSize, from: fits[0], lines: 1, size, to: fits[1] };
  }

  if (place.tall) {
    return {
      amount,
      amountSize,
      from: fitted(transfer.from, size, free).text,
      lines: 2,
      size,
      to: fitted(transfer.to, size, free - pays).text,
    };
  }

  const [from = transfer.from, to = transfer.to] = pairs.at(-1) ?? [];
  const half = (free - pays) / 2;

  const fromFit = fitted(
    from,
    size,
    Math.max(half, free - pays - textWidth(to, size))
  );

  return {
    amount,
    amountSize,
    from: fromFit.text,
    lines: 1,
    size,
    to: fitted(to, size, free - pays - textWidth(fromFit.text, size)).text,
  };
};

const paysAt = (
  palette: Palette,
  at: { readonly x: number; readonly y: number },
  size: number,
  parts: readonly (readonly [string, boolean])[]
) =>
  [
    `<text x="${number(at.x)}" y="${number(at.y)}" font-family="Figtree, sans-serif" font-size="${number(size)}" xml:space="preserve">`,
    ...parts.map(
      ([text, name]) =>
        `<tspan font-weight="${name ? 700 : 500}" fill="${name ? palette.cardInk : palette.cardMuted}">${escaped(name ? isolated(text) : text)}</tspan>`
    ),
    "</text>",
  ].join("");

const transferRow = (
  palette: Palette,
  line: PayLine,
  place: { readonly height: number; readonly y: number }
) => {
  const left = LEFT + RECEIPT_INSET;
  const baseline = place.y + place.height * 0.68;

  const amountArt = textAt(
    palette.cardInk,
    { x: RIGHT - RECEIPT_INSET, y: baseline },
    { size: line.amountSize, text: line.amount },
    { anchor: "end", display: true, weight: 800 }
  );

  if (line.lines > 1) {
    return [
      paysAt(palette, { x: left, y: baseline }, line.size, [[line.from, true]]),
      paysAt(palette, { x: left, y: baseline + line.size * 1.2 }, line.size, [
        [PAYS.trimStart(), false],
        [line.to, true],
      ]),
      amountArt,
    ].join("");
  }

  return [
    paysAt(palette, { x: left, y: baseline }, line.size, [
      [line.from, true],
      [PAYS, false],
      [line.to, true],
    ]),
    amountArt,
  ].join("");
};

const rowHeightOf = (line: PayLine, height: number) =>
  line.lines > 1 ? height * BROKEN_ROW : height;

const receiptHeight = (lines: readonly PayLine[], height: number) => {
  let total = RECEIPT_INSET * 1.2;

  for (const line of lines) {
    total += rowHeightOf(line, height);
  }

  return total;
};

const receiptArt = (
  palette: Palette,
  lines: readonly PayLine[],
  box: { readonly rowHeight: number; readonly y: number }
) => {
  let top = box.y + RECEIPT_INSET * 0.6;

  const rows = lines.map((line) => {
    const art = transferRow(palette, line, { height: box.rowHeight, y: top });

    top += rowHeightOf(line, box.rowHeight);

    return art;
  });

  return [
    sheet(palette, {
      fill: palette.card,
      height: receiptHeight(lines, box.rowHeight),
      lift: 4,
      radius: 26,
      width: RIGHT - LEFT,
      x: LEFT,
      y: box.y,
    }),
    ...rows,
  ].join("");
};

const STORY_GROWTH = 1.3;

const HEADER_TOP = 110;

const HEADER_BOTTOM = 304;

interface Plan {
  readonly payHeight: number;
  readonly payLines: readonly PayLine[];
  readonly receiptTop: number;
  readonly shift: number;
  readonly slots: readonly Slot[];
}

const chatSlots = (
  card: SettleUpCard,
  room: number,
  top: number
): readonly Slot[] => {
  const columns = card.players.length > 4 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(card.players.length / columns));
  const gutter = 44;
  const width = (RIGHT - LEFT - gutter * (columns - 1)) / columns;
  const height = Math.min(columns === 1 ? 136 : 124, room / rows);
  const stacked = columns > 1;
  const face = Math.round(Math.min(height * 0.84, stacked ? 116 : 150));

  const nameSize = stacked
    ? Math.min(42, height * 0.32)
    : Math.min(52, height * 0.36);

  const netSize = stacked
    ? Math.min(48, height * 0.36)
    : Math.min(64, height * 0.44);

  const nameX = face + Math.min(32, face * 0.24);

  return card.players.map((player, index) => {
    const netRoom = stacked
      ? 0
      : textWidth(netText(player.net), netSize) + height * 0.3;

    return {
      face,
      height,
      nameSize,
      names: [fitted(player.name, nameSize, width - nameX - netRoom).text],
      netSize,
      stacked,
      width,
      x: LEFT + Math.floor(index / rows) * (width + gutter),
      y: top + (index % rows) * height,
    };
  });
};

const STORY_UNITS = [150, 140, 130, 120, 112, 104, 96, 90, 84, 78, 72];

const storySlots = (
  card: SettleUpCard,
  unit: number,
  top: number
): readonly Slot[] => {
  const face = Math.round(unit * 0.74);
  const nameSize = Math.min(46, unit * 0.36);
  const netSize = Math.min(56, unit * 0.42);
  const width = RIGHT - LEFT;
  const nameX = face + Math.min(32, face * 0.24);
  let y = top;

  return card.players.map((player) => {
    const room = width - nameX - textWidth(netText(player.net), netSize) - 24;
    const names = wrapped(player.name, nameSize, room, 2);
    const height = unit + (names.length - 1) * nameSize * 1.1;

    const slot = {
      face,
      height,
      nameSize,
      names,
      netSize,
      stacked: false,
      width,
      x: LEFT,
      y,
    };

    y += height;

    return slot;
  });
};

const slotsBottom = (slots: readonly Slot[], top: number) =>
  Math.max(top, ...slots.map(({ height, y }) => y + height));

const planFor = (card: SettleUpCard, tall: boolean): Plan => {
  const growth = tall ? STORY_GROWTH : 1;
  const payHeight = (card.transfers.length > 4 ? 52 : 70) * growth;
  const forms = uniqueFirstName(card.players);

  const payLines = card.transfers.map((transfer) =>
    payLineOf(transfer, forms, { height: payHeight, tall })
  );

  const receipt =
    payLines.length === 0 ? 0 : receiptHeight(payLines, payHeight) + GAP;

  const bottom = (tall ? 1920 : 1350) - MARK_ROOM;
  const room = bottom - HEADER_BOTTOM - receipt;

  const slots = tall
    ? (STORY_UNITS.map((unit) => storySlots(card, unit, HEADER_BOTTOM)).find(
        (laid) => slotsBottom(laid, HEADER_BOTTOM) <= HEADER_BOTTOM + room
      ) ?? storySlots(card, STORY_UNITS.at(-1) ?? 72, HEADER_BOTTOM))
    : chatSlots(card, room, HEADER_BOTTOM);

  const used = slotsBottom(slots, HEADER_BOTTOM) - HEADER_TOP + receipt;
  const shift = tall ? Math.max(0, (bottom - HEADER_TOP - used) / 2) : 0;

  return {
    payHeight,
    payLines,
    receiptTop: slotsBottom(slots, HEADER_BOTTOM) + shift + GAP,
    shift,
    slots: slots.map((slot) => ({ ...slot, y: slot.y + shift })),
  };
};

export const settleUpSvg = (card: SettleUpCard, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const tall = look.frame === "Story";
  const plan = planFor(card, tall);
  const best = Math.max(0, ...card.players.map(({ net }) => net));

  return paperSvg(
    palette,
    look,
    [
      `<g transform="translate(0 ${number(plan.shift)})">`,
      titleArt(palette),
      `<text x="92" y="268" font-family="Figtree, sans-serif" font-weight="600" font-size="42" fill="${palette.muted}">${paymentsLine(card.transfers.length)}</text>`,
      "</g>",
      ...card.players.map((player, index) => {
        const slot = plan.slots[index];

        return slot === undefined
          ? ""
          : playerRow(palette, look, player, { ...slot, best });
      }),
      plan.payLines.length === 0
        ? ""
        : receiptArt(palette, plan.payLines, {
            rowHeight: plan.payHeight,
            y: plan.receiptTop,
          }),
      markArt(palette, { x: 1080 - 92, y: (tall ? 1920 : 1350) - 72 }),
    ].join(""),
    tall
  );
};
