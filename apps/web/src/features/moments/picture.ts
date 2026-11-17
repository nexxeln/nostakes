import type { Theme } from "../model.js";
import {
  CARD_RATIO,
  FRAME_SIZES,
  ON_RED,
  RED,
  cardArt,
  escaped,
  fanFor,
  faceArt,
  markArt,
  number,
  paletteFor,
  paperSvg,
  part,
  sheet,
} from "../pictures/paper.js";
import type { KeptFrame, Palette, PictureLook } from "../pictures/paper.js";
import { fitted, textWidth, wrapped } from "../pictures/text-fit.js";
import { chipsText } from "./captions.js";
import type { Box } from "./film.js";
import type { MomentPicture, PictureSeat } from "./schema.js";

export type { MomentPicture, PictureSeat } from "./schema.js";

export type { PictureLook } from "../pictures/paper.js";

export const DISPLAY = "DM Sans, Figtree, sans-serif";

export const BODY = "Figtree, sans-serif";

const DISPLAY_WIDTH = 0.93;

const PAD = 14;

export interface Drawn {
  readonly box: Box;
  readonly svg: string;
}

export interface PicturePart extends Drawn {
  readonly index: number;
  readonly role: string;
}

export interface TextStyle {
  readonly anchor?: "end" | "middle" | "start";
  readonly family?: string;
  readonly fill: string;
  readonly size: number;
  readonly spacing?: number;
  readonly weight?: number;
}

const widthOf = (text: string, style: TextStyle) =>
  textWidth(text, style.size) * (style.family === DISPLAY ? DISPLAY_WIDTH : 1) +
  (style.spacing ?? 0) * text.length;

const leftOf = (x: number, width: number, anchor: TextStyle["anchor"]) => {
  if (anchor === "middle") {
    return x - width / 2;
  }

  return anchor === "end" ? x - width : x;
};

export const padded = (box: Box, by = PAD): Box => ({
  height: Math.ceil(box.height + by * 2),
  width: Math.ceil(box.width + by * 2),
  x: Math.floor(box.x - by),
  y: Math.floor(box.y - by),
});

export const joined = (boxes: readonly Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return { height: bottom - top, width: right - left, x: left, y: top };
};

export const textArt = (
  x: number,
  y: number,
  text: string,
  style: TextStyle
): Drawn => {
  const width = widthOf(text, style);

  return {
    box: padded({
      height: style.size * 1.3,
      width,
      x: leftOf(x, width, style.anchor),
      y: y - style.size * 1.02,
    }),
    svg:
      text.length === 0
        ? ""
        : `<text x="${number(x)}" y="${number(y)}" text-anchor="${style.anchor ?? "start"}" font-family="${style.family ?? BODY}" font-weight="${style.weight ?? 700}" font-size="${number(style.size)}" letter-spacing="${number(style.spacing ?? 0)}" fill="${style.fill}" xml:space="preserve">${escaped(text)}</text>`,
  };
};

export const linesArt = (
  x: number,
  y: number,
  lines: readonly string[],
  style: TextStyle & { readonly leading: number }
): Drawn => {
  const drawn = lines.map((line, index) =>
    textArt(x, y + index * style.leading, line, style)
  );

  return {
    box: joined(drawn.map((each) => each.box)),
    svg: drawn.map((each) => each.svg).join(""),
  };
};

export const tabArt = (
  palette: Palette,
  place: {
    readonly anchor?: "end" | "middle" | "start";
    readonly fill?: string;
    readonly ink?: string;
    readonly size: number;
    readonly text: string;
    readonly turn?: number;
    readonly x: number;
    readonly y: number;
  }
): Drawn => {
  const { size } = place;
  const spacing = size * 0.06;
  const style = { fill: place.ink ?? ON_RED, size, spacing, weight: 800 };
  const width = widthOf(place.text, style) + size * 1.1;
  const height = size * 1.7;
  const x = leftOf(place.x, width, place.anchor);
  const turn = place.turn ?? 0;

  return {
    box: padded({ height, width, x, y: place.y }, PAD + width * 0.05),
    svg: [
      `<g transform="rotate(${turn} ${number(x + width / 2)} ${number(place.y + height / 2)})">`,
      sheet(palette, {
        fill: place.fill ?? RED,
        height: number(height),
        lift: 3,
        radius: number(size * 0.42),
        width: number(width),
        x: number(x),
        y: place.y,
      }),
      textArt(x + width / 2, place.y + height * 0.7, place.text, {
        ...style,
        anchor: "middle",
      }).svg,
      "</g>",
    ].join(""),
  };
};

export const cardBackArt = (
  palette: Palette,
  place: {
    readonly turn: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const { width, x, y } = place;
  const height = width * CARD_RATIO;
  const inset = width * 0.07;

  return [
    `<g transform="rotate(${place.turn} ${number(x + width / 2)} ${number(y + height / 2)})">`,
    sheet(palette, {
      fill: palette.card,
      height,
      lift: width * 0.035,
      radius: width * 0.11,
      width,
      x,
      y,
    }),
    `<rect x="${number(x + inset)}" y="${number(y + inset)}" width="${number(width - inset * 2)}" height="${number(height - inset * 2)}" rx="${number(width * 0.06)}" fill="${palette.cardBack}"/>`,
    `<rect x="${number(x + inset * 2)}" y="${number(y + inset * 2)}" width="${number(width - inset * 4)}" height="${number(height - inset * 4)}" rx="${number(width * 0.04)}" fill="none" stroke="${palette.cardBackLine}" stroke-width="${number(width * 0.025)}"/>`,
    "</g>",
  ].join("");
};

const PAIR_TURNS = [-7, 6];

export const holeArt = (
  palette: Palette,
  seat: Pick<PictureSeat, "backs" | "cards" | "playing">,
  place: {
    readonly faceDown: boolean;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
): Drawn => {
  const count = seat.cards.length + seat.backs;

  const fan = fanFor(count, {
    step: place.width * 0.8,
    turns: PAIR_TURNS,
    width: place.width,
  });

  const picksSome = count > 2 && seat.playing.length > 0;

  const cards = Array.from({ length: count }, (_, index) => {
    const at = {
      turn: fan.turns[index] ?? 0,
      width: fan.width,
      x: place.x + index * fan.step,
      y: place.y + (index === 0 ? place.width * 0.05 : 0),
    };

    const card = place.faceDown ? undefined : seat.cards[index];

    return card === undefined
      ? cardBackArt(palette, at)
      : cardArt(palette, card, {
          ...at,
          dim: picksSome && !seat.playing.includes(card),
        });
  });

  const span = fan.width + fan.step * Math.max(0, count - 1);

  return {
    box: padded(
      {
        height: place.width * CARD_RATIO + place.width * 0.1,
        width: span,
        x: place.x,
        y: place.y,
      },
      PAD + place.width * 0.12
    ),
    svg: cards.join(""),
  };
};

export const potArt = (
  palette: Palette,
  place: { readonly pot: number; readonly x: number; readonly y: number }
): Drawn => {
  const amount = chipsText(place.pot);

  const amountWidth = widthOf(amount, {
    family: DISPLAY,
    fill: ON_RED,
    size: 58,
  });

  const width = 132 + amountWidth * 1.12;
  const height = 96;

  return {
    box: padded({ height, width, x: place.x, y: place.y }),
    svg: [
      sheet(palette, {
        fill: RED,
        height,
        lift: 3,
        radius: 16,
        width: number(width),
        x: place.x,
        y: place.y,
      }),
      textArt(place.x + 28, place.y + 58, "POT", {
        fill: ON_RED,
        size: 26,
        spacing: 2,
        weight: 800,
      }).svg,
      textArt(place.x + 100, place.y + 68, amount, {
        family: DISPLAY,
        fill: ON_RED,
        size: 58,
        weight: 800,
      }).svg,
    ].join(""),
  };
};

export const signedText = (amount: number) =>
  `${amount < 0 ? "−" : "+"}${chipsText(Math.abs(amount))}`;

interface Geometry {
  readonly board: {
    readonly double: { readonly gap: number; readonly width: number };
    readonly gap: number;
    readonly width: number;
    readonly y: number;
  };
  readonly foot: number;
  readonly line: {
    readonly gap: number;
    readonly leading: number;
    readonly size: number;
  };
  readonly panels: readonly Box[];
  readonly solo: Box;
  readonly tall: boolean;
  readonly title: {
    readonly gap: number;
    readonly largest: number;
    readonly lines: number;
  };
  readonly top: number;
  readonly verb: {
    readonly size: number;
    readonly x: number;
    readonly y: number;
  };
}

const CHAT: Geometry = {
  board: { double: { gap: 12, width: 100 }, gap: 16, width: 144, y: 950 },
  foot: 1182,
  line: { gap: 58, leading: 46, size: 36 },
  panels: [
    { height: 388, width: 426, x: 96, y: 470 },
    { height: 388, width: 426, x: 558, y: 470 },
  ],
  solo: { height: 330, width: 888, x: 96, y: 500 },
  tall: false,
  title: { gap: 172, largest: 122, lines: 1 },
  top: 96,
  verb: { size: 26, x: 540, y: 444 },
};

const STORY: Geometry = {
  board: { double: { gap: 14, width: 112 }, gap: 18, width: 160, y: 1326 },
  foot: 1586,
  line: { gap: 66, leading: 52, size: 40 },
  panels: [
    { height: 290, width: 888, x: 96, y: 624 },
    { height: 290, width: 888, x: 96, y: 962 },
  ],
  solo: { height: 330, width: 888, x: 96, y: 790 },
  tall: true,
  title: { gap: 190, largest: 132, lines: 2 },
  top: 250,
  verb: { size: 30, x: 780, y: 912 },
};

export const geometryOf = (frame: PictureLook["frame"]): Geometry =>
  frame === "Story" ? STORY : CHAT;

interface Shown {
  readonly faceDown: boolean;
  readonly result: boolean;
}

const SHOWN: Shown = { faceDown: false, result: true };

export interface PanelArt {
  readonly face: Drawn;
  readonly hand: Drawn;
  readonly hole: Drawn;
  readonly name: Drawn;
  readonly note: Drawn;
  readonly panel: Drawn;
  readonly swing: Drawn;
  readonly wins: Drawn;
}

export const panelArt = (
  palette: Palette,
  theme: Theme,
  seat: PictureSeat,
  place: {
    readonly box: Box;
    readonly tall: boolean;
    readonly tagged: boolean;
  },
  shown: Shown = SHOWN
): PanelArt => {
  const { box, tall } = place;
  const { height, width, x, y } = box;
  const faceSize = tall ? height - 60 : 190;
  const cardWidth = tall ? 124 : 96;
  const faceX = x + (tall ? 30 : 24);
  const faceY = y + (tall ? 30 : 28);
  const cardsX = faceX + faceSize + (tall ? 34 : 18);
  const cardsY = y + (tall ? 44 : 52);
  const swingFill = seat.won ? RED : palette.muted;
  const swing = seat.swing === null ? "" : signedText(seat.swing);
  const handFill = seat.won ? palette.ink : palette.muted;

  const faceTile = faceArt(
    palette,
    {
      avatar: seat.avatar,
      expression: shown.result ? seat.expression : "Resting",
      name: "",
    },
    theme,
    { size: faceSize, tagged: false, x: faceX, y: faceY }
  );

  const words = (() => {
    if (tall) {
      const left = cardsX + cardWidth * 1.8 + 34;
      const room = x + width - 30 - left;
      const nameFit = fitted(seat.name, 54, room);
      const handFit = fitted(seat.hand, 36, room);
      const noteFit = fitted(seat.note, 26, room);

      return {
        hand: textArt(left, y + 146, handFit.text, {
          fill: handFill,
          size: 36,
          weight: 700,
        }),
        name: textArt(left, y + 96, nameFit.text, {
          family: DISPLAY,
          fill: palette.ink,
          size: 54,
          spacing: -1.5,
          weight: 800,
        }),
        note: textArt(left, y + 262, noteFit.text, {
          fill: palette.muted,
          size: 26,
          weight: 600,
        }),
        swing: textArt(left, y + 226, swing, {
          family: DISPLAY,
          fill: swingFill,
          size: 68,
          spacing: -2,
          weight: 800,
        }),
      };
    }

    const swingStyle = {
      anchor: "end" as const,
      family: DISPLAY,
      fill: swingFill,
      size: 46,
      spacing: -1.5,
      weight: 800,
    };

    const nameRoom = width - 56 - widthOf(swing, swingStyle) - 16;

    return {
      hand: textArt(x + 28, y + 324, fitted(seat.hand, 31, width - 56).text, {
        fill: handFill,
        size: 31,
        weight: 700,
      }),
      name: textArt(x + 28, y + 278, fitted(seat.name, 42, nameRoom).text, {
        family: DISPLAY,
        fill: palette.ink,
        size: 42,
        spacing: -1,
        weight: 800,
      }),
      note: textArt(x + 28, y + 362, fitted(seat.note, 25, width - 56).text, {
        fill: palette.muted,
        size: 25,
        weight: 600,
      }),
      swing: textArt(x + width - 28, y + 280, swing, swingStyle),
    };
  })();

  return {
    face: {
      box: padded(
        { height: faceSize, width: faceSize, x: faceX, y: faceY },
        PAD + faceSize * 0.12
      ),
      svg: faceTile,
    },
    hand: words.hand,
    hole: holeArt(palette, seat, {
      faceDown: shown.faceDown,
      width: cardWidth,
      x: cardsX,
      y: cardsY,
    }),
    name: words.name,
    note: words.note,
    panel: {
      box: padded(box),
      svg: sheet(palette, {
        fill: palette.panel,
        height,
        lift: 4,
        radius: 28,
        width,
        x,
        y,
      }),
    },
    swing: words.swing,
    wins:
      seat.won && place.tagged
        ? tabArt(palette, {
            size: tall ? 28 : 24,
            text: "WINS",
            x: x + 22,
            y: y - 22,
          })
        : { box: padded({ height: 0, width: 0, x, y }), svg: "" },
  };
};

export interface BoardSpot {
  readonly board: number;
  readonly card: string;
  readonly index: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export const boardSpots = (
  picture: Pick<MomentPicture, "boards">,
  geometry: Geometry
): readonly BoardSpot[] => {
  const rows = picture.boards.filter((board) => board.length > 0);
  const double = rows.length > 1;
  const { gap, width } = double ? geometry.board.double : geometry.board;
  const span = width * 5 + gap * 4;
  const left = (FRAME_SIZES.Chat.width - span) / 2;
  const rowHeight = width * CARD_RATIO + gap;
  const top = double ? geometry.board.y - 70 : geometry.board.y;

  return rows.flatMap((board, row) =>
    board.map((card, index) => ({
      board: row + 1,
      card,
      index: row * 5 + index,
      width,
      x: left + index * (width + gap),
      y: top + row * rowHeight,
    }))
  );
};

export const boardBottom = (spots: readonly BoardSpot[]) =>
  Math.max(0, ...spots.map((spot) => spot.y + spot.width * CARD_RATIO));

export const boardCardArt = (
  palette: Palette,
  picture: Pick<MomentPicture, "flag" | "lifted">,
  spot: BoardSpot,
  result: boolean
): Drawn => {
  const lifted =
    result &&
    picture.flag !== null &&
    picture.flag.card === spot.card &&
    picture.flag.board === spot.board;

  const dim =
    result && picture.lifted.length > 0 && !picture.lifted.includes(spot.card);

  const y = spot.y - (lifted ? spot.width * 0.14 : 0);

  return {
    box: padded({
      height: spot.width * CARD_RATIO,
      width: spot.width,
      x: spot.x,
      y,
    }),
    svg: cardArt(palette, spot.card, {
      dim,
      turn: 0,
      width: spot.width,
      x: spot.x,
      y,
    }),
  };
};

export const flagArt = (
  palette: Palette,
  picture: Pick<MomentPicture, "flag">,
  spots: readonly BoardSpot[]
): Drawn => {
  const spot = spots.find(
    (each) =>
      picture.flag !== null &&
      each.card === picture.flag.card &&
      each.board === picture.flag.board
  );

  if (spot === undefined || picture.flag === null) {
    return { box: { height: 0, width: 0, x: 0, y: 0 }, svg: "" };
  }

  return tabArt(palette, {
    anchor: "middle",
    size: Math.max(20, spot.width * 0.17),
    text: picture.flag.word.toUpperCase(),
    turn: -3,
    x: spot.x + spot.width / 2,
    y: spot.y - spot.width * 0.14 - spot.width * 0.24,
  });
};

const HEAD_ROOM = 888;

const titleStyleOf = (size: number, fill: string) => ({
  family: DISPLAY,
  fill,
  size,
  spacing: -size * 0.035,
  weight: 800,
});

export const headLayout = (
  picture: Pick<MomentPicture, "line" | "title">,
  geometry: Geometry
) => {
  const fitsOn = (size: number) =>
    wrapped(
      picture.title,
      size * DISPLAY_WIDTH,
      HEAD_ROOM,
      geometry.title.lines
    );

  let size = geometry.title.largest;

  while (
    size > 56 &&
    (fitsOn(size).join(" ") !== picture.title ||
      fitsOn(size).some(
        (line) => widthOf(line, titleStyleOf(size, "")) > HEAD_ROOM
      ))
  ) {
    size -= 4;
  }

  const titleLines = fitsOn(size);
  const titleY = geometry.top + geometry.title.gap;
  const titleBottom = titleY + (titleLines.length - 1) * size * 1.02;
  const lineLines = wrapped(picture.line, geometry.line.size, HEAD_ROOM, 2);
  const lineY = titleBottom + geometry.line.gap;

  return {
    bottom: lineY + Math.max(0, lineLines.length - 1) * geometry.line.leading,
    lineLines,
    lineY,
    size,
    titleLines,
    titleY,
  };
};

const PANEL_CLEARANCE = 70;

export const geometryFor = (
  picture: Pick<MomentPicture, "line" | "title">,
  frame: PictureLook["frame"]
): Geometry => {
  const base = geometryOf(frame);
  const head = headLayout(picture, base);
  const top = Math.min(...base.panels.map((panel) => panel.y));
  const shift = Math.max(0, Math.ceil(head.bottom + PANEL_CLEARANCE - top));

  if (shift === 0) {
    return base;
  }

  const moved = (box: Box): Box => ({ ...box, y: box.y + shift });

  return {
    ...base,
    board: { ...base.board, y: base.board.y + shift },
    foot: base.foot + shift,
    panels: base.panels.map(moved),
    solo: moved(base.solo),
    verb: { ...base.verb, y: base.verb.y + shift },
  };
};

export const headArt = (
  palette: Palette,
  picture: Pick<MomentPicture, "kicker" | "line" | "meta" | "title">,
  geometry: Geometry
) => {
  const { top } = geometry;
  const head = headLayout(picture, geometry);

  return {
    kicker: tabArt(palette, { size: 28, text: picture.kicker, x: 96, y: top }),
    line: linesArt(96, head.lineY, head.lineLines, {
      fill: palette.muted,
      leading: geometry.line.leading,
      size: geometry.line.size,
      weight: 600,
    }),
    meta: textArt(984, top + 36, picture.meta, {
      anchor: "end",
      fill: palette.muted,
      size: 28,
      weight: 600,
    }),
    title: linesArt(92, head.titleY, head.titleLines, {
      ...titleStyleOf(head.size, palette.ink),
      leading: head.size * 1.02,
    }),
  };
};

export const footY = (geometry: Geometry, spots: readonly BoardSpot[]) =>
  Math.max(geometry.foot, boardBottom(spots) + 30);

export const markPart = (palette: Palette, y: number): Drawn => ({
  box: padded({ height: 52, width: 260, x: 984 - 260, y: y - 42 }),
  svg: markArt(palette, { x: 984, y }),
});

export const verbArt = (
  palette: Palette,
  picture: Pick<MomentPicture, "verb">,
  geometry: Geometry
): Drawn =>
  tabArt(palette, {
    anchor: "middle",
    fill: palette.ink,
    ink: palette.page,
    size: geometry.verb.size,
    text: picture.verb,
    turn: -4,
    x: geometry.verb.x,
    y: geometry.verb.y,
  });

export const panelBoxes = (picture: MomentPicture, geometry: Geometry) =>
  picture.seats.length >= 2 ? geometry.panels : [geometry.solo];

export const pictureParts = (
  picture: MomentPicture,
  look: {
    readonly deck: PictureLook["deck"];
    readonly frame: PictureLook["frame"];
    readonly theme: Theme;
  }
): readonly PicturePart[] => {
  const palette = paletteFor(look.theme, look.deck);
  const geometry = geometryFor(picture, look.frame);
  const head = headArt(palette, picture, geometry);
  const boxes = panelBoxes(picture, geometry);
  const winners = picture.seats.filter((seat) => seat.won).length;
  const spots = boardSpots(picture, geometry);
  const foot = footY(geometry, spots);
  const solo = picture.seats.length < 2;

  const panels = picture.seats.slice(0, 2).flatMap((seat, index) => {
    const box = boxes[index] ?? geometry.solo;

    const drawn = panelArt(palette, look.theme, seat, {
      box,
      tall: geometry.tall || solo,
      tagged: winners === 1,
    });

    return (
      [
        ["panel", drawn.panel],
        ["face", drawn.face],
        ["hole", drawn.hole],
        ["name", drawn.name],
        ["hand", drawn.hand],
        ["swing", drawn.swing],
        ["note", drawn.note],
        ["wins", drawn.wins],
      ] as const
    ).map(([role, art]) => ({ ...art, index, role }));
  });

  const pot = potArt(palette, { pot: picture.pot, x: 96, y: foot });

  const parts: readonly PicturePart[] = [
    { ...head.kicker, index: 0, role: "kicker" },
    { ...head.meta, index: 0, role: "meta" },
    { ...head.title, index: 0, role: "title" },
    { ...head.line, index: 0, role: "line" },
    ...panels,
    ...(solo
      ? []
      : [{ ...verbArt(palette, picture, geometry), index: 0, role: "verb" }]),
    ...spots.map((spot) => ({
      ...boardCardArt(palette, picture, spot, true),
      index: spot.index,
      role: "board",
    })),
    { ...flagArt(palette, picture, spots), index: 0, role: "flag" },
    { ...pot, index: 0, role: "pot" },
    {
      ...textArt(
        pot.box.x + pot.box.width + 8,
        foot + 60,
        picture.blinds > 0 ? `${chipsText(picture.blinds)} big blinds` : "",
        {
          fill: palette.muted,
          size: 32,
          weight: 700,
        }
      ),
      index: 0,
      role: "blinds",
    },
    {
      ...textArt(984, foot + 34, picture.foot, {
        anchor: "end",
        fill: palette.muted,
        size: 28,
        weight: 600,
      }),
      index: 0,
      role: "foot",
    },
    { ...markPart(palette, foot + 86), index: 0, role: "mark" },
  ];

  return parts.filter((each) => each.svg.length > 0);
};

export const isTallFrame = (frame: KeptFrame | PictureLook["frame"]) =>
  frame === "Story";

export const pictureSvg = (picture: MomentPicture, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);

  return paperSvg(
    palette,
    look,
    pictureParts(picture, look)
      .map((each) => part(each.role, each.index, each.svg))
      .join(""),
    isTallFrame(look.frame)
  );
};
