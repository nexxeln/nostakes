import { Option } from "effect";

import { chipsText } from "../moments/captions.js";
import { NAME_FORMS, potTakers } from "../recap.js";
import type { RecapCard } from "../recap.js";
import {
  ON_RED,
  RED,
  cardArt,
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
import { netText } from "./settle-up.js";
import {
  firstFitting,
  firstWrapping,
  fitted,
  textWidth,
  wrapped,
  wrapsWhole,
} from "./text-fit.js";

const LEFT = 90;

const RIGHT = 990;

const MARK_ROOM = 124;

const TITLE = "Tonight";

type RecapMoment = RecapCard["moments"][number];

const textAt = (
  fill: string,
  at: { readonly x: number; readonly y: number },
  text: { readonly size: number; readonly text: string },
  style: {
    readonly anchor?: "end" | "start";
    readonly display?: boolean;
    readonly weight: number;
  }
) =>
  `<text x="${number(at.x)}" y="${number(at.y)}"${style.anchor === "end" ? ' text-anchor="end"' : ""} font-family="${style.display === true ? "DM Sans, Figtree" : "Figtree"}, sans-serif" font-weight="${style.weight}" font-size="${number(text.size)}" fill="${fill}">${escaped(text.text)}</text>`;

const titleArt = (palette: Palette, top: number) => {
  const size = number(titleSize(TITLE, 900, 118));

  const text = (fill: string, dx: number, dy: number) =>
    `<text x="${LEFT + dx}" y="${top + 80 + dy}" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${size}" letter-spacing="${number(-size * 0.035)}" fill="${fill}">${TITLE}</text>`;

  return [text(RED, size * 0.05, size * 0.035), text(palette.ink, 0, 0)].join(
    ""
  );
};

const handsText = (card: RecapCard) => {
  const hands = card.hands === 1 ? "1 hand" : `${card.hands} hands`;

  return card.length.length === 0 ? hands : `${hands} in ${card.length}`;
};

const WINNER_FACE = 180;

const WINNER_NAME = 50;

const WINNER_LINE = 54;

const WINNER_X = LEFT + WINNER_FACE + 40;

const STORY_NAME_SIZES = [WINNER_NAME, 42, 36];

const winnerNames = (
  name: string,
  tall: boolean
): { readonly lines: readonly string[]; readonly size: number } => {
  const size = STORY_NAME_SIZES.find((each) =>
    wrapsWhole(name, each, RIGHT - WINNER_X, 2)
  );

  return tall && size !== undefined
    ? { lines: wrapped(name, size, RIGHT - WINNER_X, 2), size }
    : {
        lines: [
          firstFitting(
            NAME_FORMS.map((form) => form(name)),
            WINNER_NAME,
            RIGHT - WINNER_X
          ).text,
        ],
        size: WINNER_NAME,
      };
};

const winnerHeight = (card: RecapCard, tall: boolean) =>
  Option.match(card.winner, {
    onNone: () => 0,
    onSome: ({ face }) =>
      WINNER_FACE +
      20 +
      (winnerNames(face.name, tall).lines.length - 1) * WINNER_LINE,
  });

const winnerArt = (
  palette: Palette,
  look: PictureLook,
  winner: NonNullable<Option.Option.Value<RecapCard["winner"]>>,
  place: { readonly tall: boolean; readonly top: number }
) => {
  const { top } = place;
  const names = winnerNames(winner.face.name, place.tall);
  const last = top + 100 + (names.lines.length - 1) * WINNER_LINE;

  return [
    faceArt(palette, { ...winner.face, name: "" }, look.theme, {
      size: WINNER_FACE,
      tagged: false,
      x: LEFT,
      y: top,
    }),
    textAt(
      palette.muted,
      { x: WINNER_X, y: top + 40 },
      { size: 34, text: "Took the night" },
      { weight: 600 }
    ),
    ...names.lines.map((name, line) =>
      textAt(
        palette.ink,
        { x: WINNER_X, y: top + 100 + line * WINNER_LINE },
        { size: names.size, text: name },
        { weight: 700 }
      )
    ),
    textAt(
      RED,
      { x: WINNER_X, y: last + 84 },
      { size: 80, text: netText(winner.net) },
      { display: true, weight: 800 }
    ),
  ].join("");
};

const POT_HEIGHT = 120;

const WHO_SIZE = 36;

const whoLines = (
  pot: NonNullable<Option.Option.Value<RecapCard["biggestPot"]>>,
  room: number
): readonly string[] => {
  const names = pot.takers.map(({ name }) => name);

  return firstWrapping(
    NAME_FORMS.map((form) => `${potTakers(names.map(form))}, hand ${pot.hand}`),
    WHO_SIZE,
    room,
    2
  );
};

const potArt = (
  palette: Palette,
  pot: NonNullable<Option.Option.Value<RecapCard["biggestPot"]>>,
  top: number
) => {
  const amount = chipsText(pot.pot);
  const width = 300 + textWidth(amount, 56);
  const after = LEFT + width + 28;
  const lines = whoLines(pot, RIGHT - after);
  const first = lines.length > 1 ? top + 42 : top + 62;

  return [
    sheet(palette, {
      fill: RED,
      height: 96,
      lift: 3,
      radius: 16,
      width,
      x: LEFT,
      y: top,
    }),
    `<text x="${LEFT + 28}" y="${top + 58}" font-family="Figtree, sans-serif" font-weight="800" font-size="26" letter-spacing="2" fill="${ON_RED}">BIGGEST POT</text>`,
    textAt(
      ON_RED,
      { x: LEFT + width - 28, y: top + 68 },
      { size: 56, text: amount },
      { anchor: "end", display: true, weight: 800 }
    ),
    ...lines.map((line, index) =>
      textAt(
        palette.muted,
        { x: after, y: first + index * WHO_SIZE * 1.15 },
        { size: WHO_SIZE, text: line },
        { weight: 600 }
      )
    ),
  ].join("");
};

const momentRow = (
  palette: Palette,
  look: PictureLook,
  moment: RecapMoment,
  place: { readonly height: number; readonly y: number }
) => {
  const face = Math.min(132, place.height * 0.82);
  const cardWidth = Math.min(70, place.height * 0.42);
  const cardsRoom = moment.cards.length > 0 ? cardWidth * 1.85 + 24 : 0;
  const x = LEFT + face + 32;
  const room = RIGHT - x - cardsRoom;
  const titleFont = Math.min(50, place.height * 0.34);
  const lineFont = Math.min(32, place.height * 0.22);
  const lines = firstWrapping(moment.lines, lineFont, room, 2);

  return [
    faceArt(palette, { ...moment.face, name: "" }, look.theme, {
      size: face,
      tagged: false,
      x: LEFT,
      y: place.y,
    }),
    textAt(
      palette.ink,
      { x, y: place.y + face * 0.42 },
      fitted(moment.title, titleFont, room),
      { display: true, weight: 800 }
    ),
    ...lines.map((line, index) =>
      textAt(
        palette.muted,
        { x, y: place.y + face * 0.42 + lineFont * (1.45 + index * 1.2) },
        { size: lineFont, text: line },
        { weight: 600 }
      )
    ),
    ...moment.cards.map((card, index) =>
      cardArt(palette, card, {
        dim: false,
        turn: index === 0 ? -6 : 5,
        width: cardWidth,
        x: RIGHT - cardsRoom + 24 + index * cardWidth * 0.8,
        y: place.y + face * 0.08,
      })
    ),
  ].join("");
};

const STORY_GROWTH = 1.25;

interface Plan {
  readonly momentHeight: number;
  readonly potTop: number;
  readonly shift: number;
  readonly momentsTop: number;
  readonly winnerTop: number;
}

const HEADER = 196;

const GAP = 44;

const planFor = (card: RecapCard, tall: boolean): Plan => {
  const height = tall ? 1920 : 1350;
  const bottom = height - MARK_ROOM;
  const top = 110;

  const winner = Option.isSome(card.winner)
    ? winnerHeight(card, tall) + GAP
    : 0;

  const pot = Option.isSome(card.biggestPot) ? POT_HEIGHT + GAP : 0;
  const rows = Math.max(1, card.moments.length);
  const room = bottom - top - HEADER - winner - pot;
  const momentHeight = Math.min(170 * (tall ? STORY_GROWTH : 1), room / rows);
  const used = HEADER + winner + pot + card.moments.length * momentHeight;
  const shift = tall ? Math.max(0, (bottom - top - used) / 2) : 0;
  const winnerTop = top + HEADER + shift;
  const potTop = winnerTop + winner;

  return {
    momentHeight,
    momentsTop: potTop + pot,
    potTop,
    shift,
    winnerTop,
  };
};

export const recapSvg = (card: RecapCard, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const tall = look.frame === "Story";
  const plan = planFor(card, tall);
  const top = 110 + plan.shift;

  return paperSvg(
    palette,
    look,
    [
      titleArt(palette, top),
      textAt(
        palette.muted,
        { x: 92, y: top + 158 },
        { size: 42, text: handsText(card) },
        { weight: 600 }
      ),
      Option.match(card.winner, {
        onNone: () => "",
        onSome: (winner) =>
          winnerArt(palette, look, winner, { tall, top: plan.winnerTop }),
      }),
      Option.match(card.biggestPot, {
        onNone: () => "",
        onSome: (pot) => potArt(palette, pot, plan.potTop),
      }),
      ...card.moments.map((moment, index) =>
        momentRow(palette, look, moment, {
          height: plan.momentHeight,
          y: plan.momentsTop + index * plan.momentHeight,
        })
      ),
      markArt(palette, { x: 1080 - 92, y: (tall ? 1920 : 1350) - 72 }),
    ].join(""),
    tall
  );
};
