import { cardText } from "@nostakes/engine";
import type { SeatIndex } from "@nostakes/engine";
import { ReplaySteps } from "@nostakes/room";
import type { Replay, ReplayStep } from "@nostakes/room";
import { Option } from "effect";
import type { Types } from "effect";

import type { Theme } from "../model.js";
import {
  RED,
  cardArt,
  faceArt,
  markArt,
  number,
  paletteFor,
  paperSvg,
} from "../pictures/paper.js";
import type { Palette, PictureLook } from "../pictures/paper.js";
import { fitted, wrapped } from "../pictures/text-fit.js";
import { chipsText } from "./captions.js";
import type { MomentHand } from "./element.js";
import {
  cardBackArt,
  DISPLAY,
  signedText,
  tabArt,
  textArt,
} from "./picture.js";
import { replayFor } from "./scene.js";
import type { MomentPicture } from "./schema.js";

export interface SlipStreet {
  readonly action: string;
  readonly cards: readonly string[];
  readonly name: string;
  readonly pot: number;
}

export interface SlipPlayer {
  readonly avatar: string;
  readonly backs: number;
  readonly cards: readonly string[];
  readonly hand: string;
  readonly name: string;
  readonly net: number | null;
  readonly won: boolean;
}

export interface Slip {
  readonly headline: string;
  readonly number: number;
  readonly players: readonly SlipPlayer[];
  readonly stakes: string;
  readonly stamp: string;
  readonly streets: readonly SlipStreet[];
  readonly total: string;
}

const ACTS = {
  Bet: "bets",
  Call: "calls",
  Check: "checks",
  Fold: "folds",
  Raise: "raises to",
} as const;

type Acted = Types.ExtractTag<ReplayStep, "Acted">;

const actionOf = (step: Acted, nameOf: (seat: SeatIndex) => string) => {
  const who = nameOf(step.seat);

  if (step.allIn && step.act === "Call") {
    return `${who} calls all in`;
  }

  if (step.allIn && (step.act === "Bet" || step.act === "Raise")) {
    return `${who} all in ${chipsText(step.to)}`;
  }

  return step.act === "Bet" || step.act === "Raise"
    ? `${who} ${ACTS[step.act]} ${chipsText(step.to)}`
    : `${who} ${ACTS[step.act]}`;
};

const actionLine = (
  acted: readonly Acted[],
  nameOf: (seat: SeatIndex) => string
) => {
  const folds = acted.filter((step) => step.act === "Fold").length;

  const shown = acted.flatMap((step) =>
    step.act === "Fold" ? [] : [actionOf(step, nameOf)]
  );

  const folded =
    folds === 0
      ? []
      : [folds === 1 ? "1 player folds" : `${folds} players fold`];

  return [...shown, ...folded].join(" · ");
};

interface Building {
  acted: Acted[];
  cards: string[];
  name: string;
  paid: number;
}

const streetsOf = (
  replay: Replay,
  nameOf: (seat: SeatIndex) => string
): readonly SlipStreet[] => {
  const done: SlipStreet[] = [];
  const open: Building = { acted: [], cards: [], name: "PREFLOP", paid: 0 };

  const close = () => {
    done.push({
      action: actionLine(open.acted, nameOf),
      cards: open.cards,
      name: open.name,
      pot: open.paid,
    });
  };

  for (const step of replay.steps) {
    if (ReplaySteps.$is("Acted")(step)) {
      open.acted.push(step);
      open.paid += step.added;
    } else if (ReplaySteps.$is("Posted")(step)) {
      open.paid += step.amount;
    } else if (ReplaySteps.$is("Returned")(step)) {
      open.paid -= step.amount;
    } else if (ReplaySteps.$is("StreetDealt")(step)) {
      close();
      open.acted = [];
      open.cards = step.cards.map(cardText);
      open.name = `${step.street.toUpperCase()}${step.run > 1 ? ` ${step.run}` : ""}`;
    }
  }

  close();

  return done.filter(
    (street, index) =>
      index === 0 || street.cards.length > 0 || street.action.length > 0
  );
};

const nameAt = (hand: MomentHand, seat: SeatIndex) => {
  const player = hand.lastHand.dealtIn.find(
    (dealt) => dealt.seat === seat
  )?.player;

  return (
    hand.people.find((person) => person.player === player)?.name ?? "Someone"
  );
};

export const slipOf = (
  hand: MomentHand,
  picture: MomentPicture
): Option.Option<Slip> =>
  replayFor(hand.record).pipe(
    Option.map((replay) => {
      const winners = picture.seats.filter((seat) => seat.won);
      const [first] = winners;

      return {
        headline: picture.line.length > 0 ? picture.line : picture.title,
        number: picture.hand,
        players: picture.seats.toReversed().map((seat) => ({
          avatar: seat.avatar,
          backs: seat.backs,
          cards: seat.cards,
          hand: seat.hand,
          name: seat.name,
          net: seat.swing,
          won: seat.won,
        })),
        stakes: picture.meta.replace(/^Hand \d+ · /u, ""),
        stamp: picture.kicker,
        streets: streetsOf(replay, (seat) => nameAt(hand, seat)),
        total:
          winners.length === 1 && first !== undefined
            ? `${chipsText(picture.pot)} → ${first.name}`
            : `${chipsText(picture.pot)} split`,
      };
    })
  );

const SLIP_WIDTH = 560;

const PAD = 34;

const SLIP_PAPER = "#ffffff";

const SLIP_INK = "#1d1c24";

const SLIP_MUTED = "#716a79";

const mini = (
  palette: Palette,
  cards: readonly string[],
  x: number,
  y: number
) =>
  cards
    .map((card, index) =>
      cardArt(palette, card, {
        dim: false,
        lift: 0.03,
        turn: 0,
        width: 42,
        x: x + index * 48,
        y,
      })
    )
    .join("");

const miniBacks = (palette: Palette, count: number, x: number, y: number) =>
  Array.from({ length: count }, (_, index) =>
    cardBackArt(palette, { turn: 0, width: 42, x: x + index * 48, y })
  ).join("");

const rule = (y: number, double = false) =>
  [0, ...(double ? [7] : [])]
    .map(
      (dy) =>
        `<line x1="${PAD}" y1="${y + dy}" x2="${SLIP_WIDTH - PAD}" y2="${y + dy}" stroke="${SLIP_MUTED}" stroke-width="2.5" stroke-dasharray="${double ? "0" : "9 8"}" opacity="0.7"/>`
    )
    .join("");

interface Row {
  readonly height: number;
  readonly svg: string;
}

const ink = (size: number, weight = 800) => ({
  fill: SLIP_INK,
  size,
  weight,
});

const muted = (size: number) => ({ fill: SLIP_MUTED, size, weight: 600 });

const headRows = (slip: Slip): readonly Row[] => [
  {
    height: 78,
    svg: [
      `<text x="${PAD}" y="44" font-family="${DISPLAY}" font-weight="800" font-size="32" letter-spacing="-1"><tspan fill="${SLIP_INK}">nostakes</tspan><tspan fill="${SLIP_MUTED}">.club</tspan></text>`,
      textArt(SLIP_WIDTH - PAD, 42, `HAND ${slip.number}`, {
        ...ink(22),
        anchor: "end",
        spacing: 2,
      }).svg,
      textArt(
        PAD,
        72,
        fitted(slip.stakes, 21, SLIP_WIDTH - PAD * 2).text,
        muted(21)
      ).svg,
    ].join(""),
  },
  { height: 22, svg: rule(12) },
];

const streetRow = (palette: Palette, street: SlipStreet): Row => {
  const cards = street.cards.length > 0;
  const room = SLIP_WIDTH - PAD * 2;
  const lines = wrapped(street.action, 22, room, 2);

  return {
    height: (cards ? 110 : 76) + (lines.length - 1) * 28,
    svg: [
      textArt(PAD, cards ? 46 : 28, street.name, { ...ink(21), spacing: 2.4 })
        .svg,
      cards ? mini(palette, street.cards, PAD + 132, 6) : "",
      textArt(SLIP_WIDTH - PAD, cards ? 46 : 28, chipsText(street.pot), {
        ...ink(28),
        anchor: "end",
        family: DISPLAY,
      }).svg,
      ...lines.map(
        (line, index) =>
          textArt(PAD, (cards ? 96 : 60) + index * 28, line, muted(22)).svg
      ),
    ].join(""),
  };
};

const playerRow = (palette: Palette, player: SlipPlayer): Row => ({
  height: 74,
  svg: [
    mini(palette, player.cards, PAD, 4),
    miniBacks(palette, player.backs, PAD + player.cards.length * 48, 4),
    textArt(PAD + 108, 30, fitted(player.name, 25, 260).text, ink(25)).svg,
    textArt(PAD + 108, 58, fitted(player.hand, 21, 260).text, muted(21)).svg,
    textArt(
      SLIP_WIDTH - PAD,
      44,
      player.net === null ? "" : signedText(player.net),
      {
        ...ink(30),
        anchor: "end",
        family: DISPLAY,
        fill: player.won ? RED : SLIP_INK,
      }
    ).svg,
  ].join(""),
});

const stampArt = (text: string) => {
  const size = 46;
  const wide = text.length * size * 0.62 + 50;
  const cx = SLIP_WIDTH - PAD - wide / 2 + 6;
  const cy = 58;

  return `<g transform="rotate(-8 ${number(cx)} ${cy})" opacity="0.94"><rect x="${number(cx - wide / 2)}" y="${cy - 40}" width="${number(wide)}" height="80" rx="13" fill="none" stroke="${RED}" stroke-width="6.5"/><rect x="${number(cx - wide / 2 + 10)}" y="${cy - 30}" width="${number(wide - 20)}" height="60" rx="6" fill="none" stroke="${RED}" stroke-width="2.2"/>${textArt(cx + 2, cy + 16, text, { anchor: "middle", family: DISPLAY, fill: RED, size, spacing: 3, weight: 800 }).svg}</g>`;
};

const slipRows = (palette: Palette, slip: Slip): readonly Row[] => [
  ...headRows(slip),
  ...slip.streets.map((street) => streetRow(palette, street)),
  { height: 26, svg: rule(12) },
  ...slip.players.map((player) => playerRow(palette, player)),
  { height: 30, svg: rule(12, true) },
  {
    height: 64,
    svg: [
      textArt(PAD, 40, "TOTAL", { ...ink(26), spacing: 2.4 }).svg,
      textArt(SLIP_WIDTH - PAD, 42, fitted(slip.total, 34, 340).text, {
        ...ink(34),
        anchor: "end",
        family: DISPLAY,
        spacing: -1,
      }).svg,
    ].join(""),
  },
  {
    height: 118,
    svg: [
      textArt(PAD, 52, "Dealt at nostakes.club", muted(20)).svg,
      textArt(PAD, 80, "Thanks for playing", muted(20)).svg,
      stampArt(slip.stamp),
    ].join(""),
  },
];

const zigzag = (width: number, height: number) => {
  const teeth = 20;
  const step = width / teeth;
  const points = ["0,0", `${width},0`, `${width},${height}`];

  for (let index = teeth - 1; index >= 0; index -= 1) {
    points.push(
      `${number(index * step + step / 2)},${height + 14}`,
      `${number(index * step)},${height}`
    );
  }

  return points.join(" ");
};

const paperOf = (
  palette: Palette,
  slip: Slip,
  place: {
    readonly scale: number;
    readonly turn: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const rows = slipRows(palette, slip);
  const body: string[] = [];
  let y = 14;

  for (const row of rows) {
    body.push(`<g transform="translate(0 ${y})">${row.svg}</g>`);
    y += row.height;
  }

  const height = y + 10;
  const outline = zigzag(SLIP_WIDTH, height);

  return {
    height: (height + 14) * place.scale,
    svg: [
      `<g transform="translate(${place.x} ${place.y}) rotate(${place.turn}) scale(${place.scale})">`,
      `<polygon points="${outline}" fill="${palette.shadow}" transform="translate(5 9)"/>`,
      `<polygon points="${outline}" fill="${SLIP_PAPER}"/>`,
      ...body,
      "</g>",
    ].join(""),
  };
};

export const slipAloneSvg = (
  slip: Slip,
  look: { readonly deck: PictureLook["deck"]; readonly theme: Theme }
) => {
  const palette = paletteFor(look.theme, look.deck);
  const paper = paperOf(palette, slip, { scale: 1, turn: 0, x: 6, y: 2 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIP_WIDTH + 18} ${number(paper.height + 12)}" width="100%">${paper.svg}</svg>`;
};

const personArt = (
  palette: Palette,
  theme: Theme,
  player: SlipPlayer,
  place: { readonly size: number; readonly x: number; readonly y: number }
) => {
  const { size, x, y } = place;
  const label = fitted(player.name, size * 0.13, size).text;

  return [
    faceArt(
      palette,
      {
        avatar: player.avatar,
        expression: player.won ? "Happy" : "Gutted",
        name: "",
      },
      theme,
      { ...place, tagged: false }
    ),
    player.won
      ? tabArt(palette, {
          anchor: "middle",
          size: size * 0.13,
          text: label,
          x: x + size / 2,
          y: y + size + size * 0.06,
        }).svg
      : textArt(x + size / 2, y + size + size * 0.22, label, {
          anchor: "middle",
          fill: palette.ink,
          size: size * 0.13,
          weight: 700,
        }).svg,
  ].join("");
};

export const slipSvg = (slip: Slip, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const story = look.frame === "Story";
  const size = story ? 84 : 68;
  const lines = wrapped(slip.headline, size * 0.93, 888, story ? 3 : 2);
  const top = story ? 320 : 160;
  const bottom = top + (lines.length - 1) * size * 1.02;
  const natural = paperOf(palette, slip, { scale: 1, turn: 0, x: 0, y: 0 });
  const room = (story ? 1700 : 1270) - (bottom + 50);
  const scale = Math.min(story ? 1.16 : 0.98, room / natural.height);

  const paper = paperOf(palette, slip, {
    scale,
    turn: -1.5,
    x: 92,
    y: bottom + 50,
  });

  const column = story
    ? { size: 190, x: 806, y: bottom + 120 }
    : { size: 250, x: 706, y: bottom + 96 };

  const gap = story ? 300 : 360;

  const winner =
    slip.players.find((player) => player.won) ?? slip.players.at(-1);

  const loser = slip.players.find((player) => player !== winner);

  return paperSvg(
    palette,
    look,
    [
      ...lines.map(
        (line, index) =>
          textArt(94, top + index * size * 1.02, line, {
            family: DISPLAY,
            fill: palette.ink,
            size,
            spacing: -size * 0.035,
            weight: 800,
          }).svg
      ),
      paper.svg,
      winner === undefined
        ? ""
        : personArt(palette, look.theme, winner, column),
      loser === undefined
        ? ""
        : personArt(palette, look.theme, loser, {
            ...column,
            y: column.y + gap,
          }),
      markArt(palette, { x: 984, y: story ? 1820 : 1262 }),
    ].join(""),
    story
  );
};
