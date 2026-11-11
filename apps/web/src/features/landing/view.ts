import { codeFor } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import type { Html, HtmlBuilder } from "foldkit/html";

import { cardFaceOf } from "../card-art.js";
import { themeSwitch } from "../chrome.js";
import { face } from "../face-builder.js";
import { cardMarkup } from "../markup.js";
import { Messages } from "../message.js";
import type { Message } from "../message.js";
import { pageTheme } from "../model.js";
import type { Model, Theme } from "../model.js";
import { CAST, FLOP, PREVIEW_CAST, RING, TABLE } from "./cast.js";
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
  beats: [
    { line: "Sam drops the link in the group chat.", time: "9:02 pm" },
    { line: "Everyone sits down, wherever they live now.", time: "9:10 pm" },
    {
      line: "Priya cracks Jonas's aces. Someone keeps the clip.",
      time: "11:48 pm",
    },
    {
      line: "Jonas pays Priya 1,000. nostakes only keeps the count.",
      time: "1:20 am",
    },
  ],
  close: "Deal your friends in.",
  finePrint: [
    { label: "Price", value: "Free" },
    { label: "Sign-up", value: "None" },
    { label: "Players", value: "Up to 9" },
    { label: "House rules", value: "The host's" },
    { label: "The deck", value: "Sealed, checked on every phone" },
    { label: "Money", value: "Never touches it" },
  ],
  lede: "Poker night with your friends, in the browser.",
  open: "Open a room",
  title: "Sharks and fish welcome.",
  under: "Free, and nobody signs up.",
} as const;

const later = (
  h: H,
  who: CastName,
  expression: Expression,
  theme: Theme,
  className: string
): Html => {
  const lazyFace = landingFaceElement.withMessage(h);

  return lazyFace(
    [
      h.Class(className),
      h.AriaHidden(true),
      lazyFace.Avatar(codeFor(CAST[who])),
      lazyFace.Expression(expression),
      lazyFace.Theme(theme),
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
          later(h, who, "LookingDown", theme, "ring-face ring-look"),
        ]
      ),
    ]
  );

const hero = (h: H, theme: Theme): Html =>
  h.section(
    [h.Class("hero"), h.DataAttribute("scene", "hero")],
    [
      h.div(
        [h.Class("hero-felt")],
        [
          ...RING.map(seat(h, theme)),
          h.h1([h.Class("hero-title")], [LANDING_WORDS.title]),
        ]
      ),
      h.div(
        [h.Class("hero-pitch")],
        [
          h.p([h.Class("hero-lede")], [LANDING_WORDS.lede]),
          openButton(h, "hero-open"),
          h.p([h.Class("hero-under")], [LANDING_WORDS.under]),
        ]
      ),
    ]
  );

const chatPiece = (h: H, theme: Theme): Html =>
  h.div(
    [h.Class("chat")],
    [
      h.div(
        [h.Class("chat-row")],
        [
          later(h, "Maya", "Resting", theme, "chat-face"),
          h.p([h.Class("chat-bubble")], ["poker tonight?"]),
        ]
      ),
      h.div(
        [h.Class("chat-row chat-sent")],
        [
          later(h, "Sam", "Happy", theme, "chat-face"),
          h.div(
            [h.Class("chat-bubble chat-link landing-move")],
            [
              h.div(
                [h.Class("preview")],
                [
                  later(h, "Sam", "Resting", theme, "preview-face"),
                  h.div(
                    [h.Class("preview-words")],
                    [
                      h.span([h.Class("preview-brand")], ["nostakes"]),
                      h.span(
                        [h.Class("preview-line")],
                        ["Poker night. Pull up a chair."]
                      ),
                      h.span(
                        [h.Class("preview-cast")],
                        PREVIEW_CAST.map((who) =>
                          later(h, who, "Resting", theme, "preview-cast-face")
                        )
                      ),
                    ]
                  ),
                ]
              ),
              h.p([h.Class("link-title")], ["Poker night. Pull up a chair."]),
              h.p([h.Class("link-host")], ["nostakes.club"]),
            ]
          ),
        ]
      ),
    ]
  );

const cardFace = (h: H, card: string, className: string): Html => {
  const drawn = cardFaceOf(card);

  return drawn === undefined
    ? h.empty
    : h.span(
        [
          h.Class(`deal-card deal-up suit-${drawn.suit} ${className}`),
          cardMarkup(h, drawn),
        ],
        []
      );
};

const dealSeat = (h: H, theme: Theme) => (who: CastName, index: number) =>
  h.div(
    [h.Class(`deal-seat deal-seat-${index}`)],
    [later(h, who, "LookingDown", theme, "deal-face")]
  );

const dealHole = (h: H) => (_who: CastName, index: number) =>
  h.div(
    [h.Class(`deal-hole deal-hole-${index}`)],
    [
      h.span([h.Class("deal-card deal-back")], []),
      h.span([h.Class("deal-card deal-back")], []),
    ]
  );

const dealPiece = (h: H, theme: Theme): Html =>
  h.div(
    [h.Class("deal")],
    [
      h.div(
        [h.Class("deal-felt")],
        [
          ...TABLE.map(dealHole(h)),
          ...TABLE.map(dealSeat(h, theme)),
          h.div(
            [h.Class("deal-board")],
            FLOP.map((card, index) => cardFace(h, card, `deal-flop-${index}`))
          ),
        ]
      ),
    ]
  );

const picture = (h: H, which: LandingPicture, theme: Theme): Html => {
  const drawn = landingPictureElement.withMessage(h);

  return drawn(
    [
      h.Class("landing-picture"),
      h.Role("img"),
      h.AriaLabel(
        which === "Moment"
          ? "The bad beat card: Jonas was 81% to win with aces, and Priya took the pot of 2,000 with kings."
          : "The settle-up card: Jonas pays Priya 1,000, Sam pays Priya 250 and Maya 150, Dev pays Maya 160."
      ),
      drawn.Picture(which),
      drawn.Theme(theme),
    ],
    []
  );
};

const beat = (h: H, index: number, piece: Html): Html => {
  const words = LANDING_WORDS.beats[index];

  return words === undefined
    ? h.empty
    : h.article(
        [h.Class(`beat beat-${index}`), h.DataAttribute("scene", "beat")],
        [
          h.div(
            [h.Class("beat-words")],
            [
              h.p([h.Class("beat-time")], [words.time]),
              h.h2([h.Class("beat-line")], [words.line]),
            ]
          ),
          h.div([h.Class("beat-piece")], [piece]),
        ]
      );
};

const close = (h: H): Html =>
  h.section(
    [h.Class("close"), h.DataAttribute("scene", "close")],
    [
      h.h2([h.Class("close-title")], [LANDING_WORDS.close]),
      h.dl(
        [h.Class("fine-print")],
        LANDING_WORDS.finePrint.flatMap(({ label, value }) => [
          h.dt([], [label]),
          h.dd([], [value]),
        ])
      ),
      openButton(h, "close-open"),
      h.footer(
        [h.Class("reading-links")],
        [
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
            [h.Class("night"), h.AriaLabel("One night of poker")],
            [
              beat(h, 0, chatPiece(h, theme)),
              beat(h, 1, dealPiece(h, theme)),
              beat(h, 2, picture(h, "Moment", theme)),
              beat(h, 3, picture(h, "SettleUp", theme)),
            ]
          ),
          close(h),
        ]
      ),
    ]
  );
};
