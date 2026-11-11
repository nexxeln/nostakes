import { codeFor } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import type { Html, HtmlBuilder } from "foldkit/html";

import { cardFaceOf } from "../card-art.js";
import { learnLink, themeSwitch } from "../chrome.js";
import { face } from "../face-builder.js";
import { BRAND_LINE } from "../link-preview.js";
import { cardMarkup } from "../markup.js";
import { Messages } from "../message.js";
import type { Message } from "../message.js";
import { pageTheme } from "../model.js";
import type { Model, Theme } from "../model.js";
import {
  CAST,
  OPEN_SEATS,
  RING,
  SEATED,
  SECOND_LOOKS,
  TOOTHPICK,
  WARDROBE,
} from "./cast.js";
import type { CastName } from "./cast.js";
import {
  landingElement,
  landingFaceElement,
  landingPictureElement,
} from "./elements.js";
import type { LandingPicture } from "./elements.js";

type H = HtmlBuilder<Message>;

const RING_FACE_PX = 96;

export const LANDING_WORDS = {
  close: "Deal your friends in.",
  gestures: ["Hold to peek", "Drag to raise", "Flick to fold"],
  lede: "Free, no sign-up. Open a room and send the link.",
  open: "Open a room",
  pictures: {
    Moment:
      "The moment card for a bad beat, The cruellest card: Jonas was 95% to win with aces, and Priya took the pot of 2,120 with three kings.",
    SettleUp:
      "The settle-up card: Jonas pays Priya 1,000, Sam pays Priya 250 and Maya 150, and Dev pays Maya 160.",
  },
  quiet:
    "Every deck is sealed before the deal, and nostakes never touches money.",
  rules: {
    headline: "NL hold'em 10/20",
    label: "House rules",
    rest: "Ante 5, straddles, run it twice",
    status: "Bomb pot next hand. Everyone antes 50.",
    tags: [
      "Bomb pots",
      "7-2 bounty",
      "Run it three times",
      "Straddles",
      "Show one card",
      "Muck",
    ],
  },
  said: "poker tonight?",
  shuffle: "Tap for another",
  tiles: {
    face: {
      body: "Sharks, fish, and a whole wardrobe.",
      title: "Make your face.",
    },
    link: {
      body: "No download, no accounts. Up to nine at a table.",
      title: "One link and everyone's in.",
    },
    moment: {
      body: "With a picture and a clip you can keep and send.",
      title: "Big hands get called out.",
    },
    rules: {
      body: "The host sets them, and calls the bomb pots.",
      title: "Your house, your rules.",
    },
    settle: {
      body: "Who pays whom, when the night ends.",
      title: "It settles up.",
    },
    table: {
      body: "No buttons to hunt for. Your hands already know how.",
      title: "It plays like a real table.",
    },
  },
  title: ["Your friends moved.", "Poker night didn't."],
} as const;

type TileName = keyof typeof LANDING_WORDS.tiles;

const later = (
  h: H,
  who: CastName,
  look: {
    readonly expression: Expression;
    readonly shuffles?: boolean;
    readonly theme: Theme;
  },
  className: string
): Html => {
  const lazyFace = landingFaceElement.withMessage(h);

  return lazyFace(
    [
      h.Class(className),
      h.AriaHidden(true),
      lazyFace.Avatar(codeFor(CAST[who])),
      lazyFace.Expression(look.expression),
      lazyFace.Shuffles(look.shuffles ?? false),
      lazyFace.Theme(look.theme),
    ],
    []
  );
};

const openButton = (h: H, place: string): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(`button primary landing-open ${place}`),
      h.OnClick(Messages.ClickedOpenRoom()),
    ],
    [LANDING_WORDS.open]
  );

const seat = (h: H, theme: Theme) => (who: CastName, index: number) =>
  h.div(
    [h.Class(`ring-seat ring-seat-${index}`)],
    [
      h.span(
        [h.Class("ring-tile")],
        [
          face(
            CAST[who],
            "Resting",
            { size: RING_FACE_PX, theme },
            "ring-face",
            h
          ),
          later(
            h,
            who,
            { expression: SECOND_LOOKS[who], theme },
            "ring-face ring-look"
          ),
        ]
      ),
    ]
  );

const hero = (h: H, theme: Theme): Html =>
  h.section(
    [h.Class("hero")],
    [
      h.div(
        [h.Class("hero-felt")],
        [
          ...RING.map(seat(h, theme)),
          h.h1(
            [h.Class("hero-title")],
            [
              h.span([], [LANDING_WORDS.title[0]]),
              " ",
              h.span([], [LANDING_WORDS.title[1]]),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class("hero-pitch")],
        [
          h.p([h.Class("hero-lede")], [LANDING_WORDS.lede]),
          openButton(h, "hero-open"),
        ]
      ),
    ]
  );

const linkPiece = (h: H, theme: Theme): Html =>
  h.div(
    [h.Class("piece piece-link")],
    [
      h.p([h.Class("link-said")], [LANDING_WORDS.said]),
      h.div(
        [h.Class("link-card")],
        [
          later(h, "Sam", { expression: "Resting", theme }, "link-face"),
          h.span(
            [h.Class("link-words")],
            [
              h.span([h.Class("link-brand")], ["nostakes"]),
              h.span([h.Class("link-line")], [BRAND_LINE]),
              h.span([h.Class("link-host")], ["nostakes.club"]),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class("link-seats")],
        [
          ...SEATED.map((who) =>
            h.span(
              [h.Class("link-seat")],
              [later(h, who, { expression: "Happy", theme }, "link-seat-face")]
            )
          ),
          ...Array.from({ length: OPEN_SEATS }, () =>
            h.span([h.Class("link-seat link-seat-open")], [])
          ),
        ]
      ),
    ]
  );

const facePiece = (h: H, theme: Theme): Html =>
  h.div(
    [h.Class("piece piece-face")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("face-shuffle"),
          h.AriaLabel("Shuffle the face"),
        ],
        [
          later(
            h,
            TOOTHPICK,
            { expression: "Resting", shuffles: true, theme },
            "face-big"
          ),
          h.span([h.Class("face-tab")], [LANDING_WORDS.shuffle]),
        ]
      ),
      h.div(
        [h.Class("face-wardrobe")],
        WARDROBE.map((who) =>
          h.span(
            [h.Class("face-small")],
            [later(h, who, { expression: "Resting", theme }, "face-small-art")]
          )
        )
      ),
    ]
  );

const playingCard = (h: H, card: string, className: string): Html => {
  const drawn = cardFaceOf(card);

  return drawn === undefined
    ? h.span([h.Class(`playing-card card-back ${className}`)], [])
    : h.span(
        [
          h.Class(`playing-card card-up suit-${drawn.suit} ${className}`),
          cardMarkup(h, drawn),
        ],
        []
      );
};

const gesture = (h: H, name: string, word: string, piece: readonly Html[]) =>
  h.div(
    [h.Class(`gesture gesture-${name}`)],
    [
      h.div([h.Class("gesture-piece")], piece),
      h.span([h.Class("gesture-word")], [word]),
    ]
  );

const tablePiece = (h: H): Html => {
  const [peek, raise, fold] = LANDING_WORDS.gestures;

  return h.div(
    [h.Class("piece piece-table")],
    [
      gesture(h, "peek", peek, [
        playingCard(h, "As", "card-first"),
        playingCard(h, "Ks", "card-second"),
      ]),
      gesture(h, "raise", raise, [
        h.span([h.Class("rail")], []),
        h.span([h.Class("rail-fill")], []),
        h.span([h.Class("puck")], []),
        h.span([h.Class("raise-to")], ["180"]),
      ]),
      gesture(h, "fold", fold, [
        h.span([h.Class("fold-trail")], []),
        playingCard(h, "", "card-first"),
        playingCard(h, "", "card-second"),
      ]),
    ]
  );
};

const rulesPiece = (h: H): Html =>
  h.div(
    [h.Class("piece piece-rules")],
    [
      h.p([h.Class("rules-status")], [LANDING_WORDS.rules.status]),
      h.div(
        [h.Class("rules-card landing-rules-card")],
        [
          h.span([h.Class("rules-card-label")], [LANDING_WORDS.rules.label]),
          h.span(
            [h.Class("rules-card-headline")],
            [LANDING_WORDS.rules.headline]
          ),
          h.span([h.Class("rules-card-rest")], [LANDING_WORDS.rules.rest]),
        ]
      ),
      h.ul(
        [h.Class("rule-tags")],
        LANDING_WORDS.rules.tags.map((tag) => h.li([], [tag]))
      ),
    ]
  );

const picturePiece = (h: H, which: LandingPicture): Html => {
  const drawn = landingPictureElement.withMessage(h);

  return h.div(
    [h.Class("piece piece-picture")],
    [
      drawn(
        [
          h.Class("landing-picture"),
          h.Role("img"),
          h.AriaLabel(LANDING_WORDS.pictures[which]),
          drawn.Picture(which),
        ],
        []
      ),
    ]
  );
};

const tile = (h: H, name: TileName, piece: Html): Html =>
  h.article(
    [h.Class(`tile tile-${name}`)],
    [
      piece,
      h.div(
        [h.Class("tile-words")],
        [
          h.h2([h.Class("tile-title")], [LANDING_WORDS.tiles[name].title]),
          h.p([h.Class("tile-body")], [LANDING_WORDS.tiles[name].body]),
        ]
      ),
    ]
  );

const close = (h: H): Html =>
  h.section(
    [h.Class("close")],
    [
      h.h2([h.Class("close-title")], [LANDING_WORDS.close]),
      openButton(h, "close-open"),
      h.p([h.Class("close-quiet")], [LANDING_WORDS.quiet]),
      h.footer(
        [h.Class("reading-links")],
        [
          learnLink(h),
          h.a([h.Href("/privacy")], ["Privacy"]),
          h.a([h.Href("/terms")], ["Terms"]),
        ]
      ),
    ]
  );

export const landingView = (model: Model, h: H): Html => {
  const theme = pageTheme(model);
  const landing = landingElement.withMessage(h);

  return landing(
    [h.Class("landing")],
    [
      h.header(
        [h.Class("bar landing-bar")],
        [
          h.span([h.Class("brand small")], ["nostakes"]),
          h.span([h.Class("bar-end")], [themeSwitch(h)]),
        ]
      ),
      h.main(
        [h.Class("landing-main")],
        [
          hero(h, theme),
          h.section(
            [h.Class("tiles"), h.AriaLabel("What a night on nostakes has")],
            [
              tile(h, "link", linkPiece(h, theme)),
              tile(h, "face", facePiece(h, theme)),
              tile(h, "table", tablePiece(h)),
              tile(h, "rules", rulesPiece(h)),
              tile(h, "moment", picturePiece(h, "Moment")),
              tile(h, "settle", picturePiece(h, "SettleUp")),
            ]
          ),
          close(h),
        ]
      ),
    ]
  );
};
