import { describe, expect, it } from "@effect/vitest";
import { CardFromText } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { equities, percentOf } from "@nostakes/room";
import { Option, Schema } from "effect";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { ScrollToTop } from "../src/client/commands.js";
import {
  CAST,
  OPEN_SEATS,
  SEATED,
  TOOTHPICK,
} from "../src/features/landing/cast.js";
import {
  BAD_BEAT,
  BOARD,
  FAVOURITE_PERCENT,
  HANDS,
  MONEY_WENT_IN_AFTER,
  POT,
  SETTLE_UP,
} from "../src/features/landing/night.js";
import { landingPictures } from "../src/features/landing/pictures.js";
import { LANDING_WORDS } from "../src/features/landing/view.js";
import { Messages } from "../src/features/message.js";
import type { KnownRoom, Model } from "../src/features/model.js";
import { chipsText } from "../src/features/moments/captions.js";
import { escaped } from "../src/features/pictures/paper.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

import landingStyles from "../src/client/landing.css?raw";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const flags = {
  deck: "TwoColour" as const,
  invite: Option.none(),
  learned: [],
  profile: { avatar: "", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.none(),
  sound: false,
  systemTheme: "Light" as const,
  theme: Option.none(),
};

const known: KnownRoom = {
  player: PLAYER,
  record: {
    closed: false,
    code: CODE,
    door: "Inside",
    left: false,
    others: ["Ben"],
    removed: false,
    seenAt: 1000,
  },
};

const firstVisit = init(flags).model;

const returning = init({ ...flags, rooms: [known] }).model;

const texts = (model: Model, selector: string) => {
  const found: string[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      for (const node of findAll(simulation.html, selector)) {
        found.push(textContent(node));
      }
    })
  );

  return found;
};

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const namesOf = (commands: Issued | undefined) =>
  (commands ?? []).map(({ name }) => name);

describe("the first screen at /", () => {
  it("shows a first-time visitor the landing and nothing of the create form", () => {
    expect(firstVisit.screen._tag).toBe("Welcome");
    expect(texts(firstVisit, "h1")).toStrictEqual([
      LANDING_WORDS.title.join(" "),
    ]);
    expect(texts(firstVisit, ".landing-open")).toStrictEqual([
      "Open a room",
      "Open a room",
    ]);
    expect(texts(firstVisit, ".room-list")).toStrictEqual([]);
    expect(texts(firstVisit, "input")).toStrictEqual([]);
  });

  it("shows a returning player their rooms first and no landing", () => {
    expect(returning.screen._tag).toBe("Home");
    expect(texts(returning, ".landing")).toStrictEqual([]);
    expect(texts(returning, ".room-row-code")).toStrictEqual([CODE]);
  });

  it("never shows the landing to someone who came on a room link", () => {
    const invited = init({ ...flags, invite: Option.some(CODE) }).model;

    expect(invited.screen._tag).toBe("Invited");
    expect(texts(invited, ".landing")).toStrictEqual([]);
  });

  it.each([".hero-open", ".close-open"])(
    "the %s button opens the create form at the top of the page",
    (button) => {
      const fields: string[] = [];

      Scene.scene(
        { update, view },
        Scene.given(firstVisit),
        Scene.click(button),
        Scene.Command.expectHas(ScrollToTop),
        Scene.Command.resolve(ScrollToTop, Messages.ScrolledToTop()),
        Scene.tap((simulation) => {
          for (const field of findAll(simulation.html, ".home .field-label")) {
            fields.push(textContent(field));
          }
        })
      );

      expect(fields[0]).toBe("Your name");
    }
  );

  it("opens a room from the create form with the name and face on the device", () => {
    const form = update(firstVisit, Messages.ClickedOpenRoom()).model;

    expect(form.screen._tag).toBe("Home");
    expect(
      namesOf(update(form, Messages.SubmittedCreate()).commands)
    ).toStrictEqual(["CreateRoom"]);
  });

  it("takes a first-time visitor back from the create form, and offers a returning player no way back", () => {
    const form = update(firstVisit, Messages.ClickedOpenRoom()).model;
    const back = update(form, Messages.ClickedBackToWelcome());

    expect(texts(form, ".bar-button")).toContain("Back");
    expect(back.model.screen._tag).toBe("Welcome");
    expect(texts(returning, ".bar-button")).not.toContain("Back");
    expect(update(returning, Messages.ClickedBackToWelcome())).toStrictEqual({
      model: returning,
    });
  });
});

const blockAfter = (styles: string, opening: string) => {
  const start = styles.indexOf(opening);
  let depth = 0;

  for (let at = start + opening.length - 1; at < styles.length; at += 1) {
    depth += styles[at] === "{" ? 1 : 0;
    depth -= styles[at] === "}" ? 1 : 0;

    if (depth === 0) {
      return { end: at + 1, start };
    }
  }

  return { end: styles.length, start };
};

const withoutBlocks = (styles: string, opening: string): string => {
  if (!styles.includes(opening)) {
    return styles;
  }

  const { end, start } = blockAfter(styles, opening);

  return withoutBlocks(styles.slice(0, start) + styles.slice(end), opening);
};

const keyframesOpening = /@keyframes [\w-]+ \{/u;

const withoutKeyframes = (styles: string): string => {
  const found = keyframesOpening.exec(styles);

  return found === null
    ? styles
    : withoutKeyframes(withoutBlocks(styles, found[0]));
};

describe("the landing under reduced motion", () => {
  it("moves nothing outside the no-preference block, so every scene is simply there", () => {
    const still = withoutKeyframes(
      withoutBlocks(
        landingStyles,
        "@media (prefers-reduced-motion: no-preference) {"
      )
    );

    expect(still).not.toMatch(/animation|transition|view-timeline/u);
    expect(landingStyles).toContain(
      "@media (prefers-reduced-motion: no-preference) {"
    );
  });
});

const TILES = Object.values(LANDING_WORDS.tiles);

describe("the landing's tiles", () => {
  it("shows six features, each with a title and a line, in the order the page tells them", () => {
    expect(texts(firstVisit, ".tile-title")).toStrictEqual([
      LANDING_WORDS.tiles.link.title,
      LANDING_WORDS.tiles.face.title,
      LANDING_WORDS.tiles.table.title,
      LANDING_WORDS.tiles.rules.title,
      LANDING_WORDS.tiles.moment.title,
      LANDING_WORDS.tiles.settle.title,
    ]);
    expect(texts(firstVisit, ".tile-body")).toHaveLength(TILES.length);
  });

  it("gives no tile to the sealed deck or to money, and says both once, quietly, at the end", () => {
    for (const { body, title } of TILES) {
      expect(`${title} ${body}`).not.toMatch(/seal|shuffl|beacon|money/iu);
    }

    expect(texts(firstVisit, ".close-quiet")).toStrictEqual([
      LANDING_WORDS.quiet,
    ]);
  });

  it("seats five friends at the link's table and leaves four seats open, nine in all", () => {
    expect(SEATED.length + OPEN_SEATS).toBe(9);
    expect(texts(firstVisit, ".link-seat")).toHaveLength(9);
    expect(texts(firstVisit, ".link-seat-open")).toHaveLength(OPEN_SEATS);
  });

  it("puts the toothpick on the face a visitor can shuffle", () => {
    expect(CAST[TOOTHPICK].extra).toBe("Toothpick");
    expect(texts(firstVisit, ".face-shuffle")).toStrictEqual([
      LANDING_WORDS.shuffle,
    ]);
  });
});

const sampleCards = Schema.decodeSync(Schema.Array(CardFromText));

describe("the landing's two pictures", () => {
  const drawn = landingPictures();

  it("says in words what the moment card shows", () => {
    const odds = equities(
      [sampleCards(HANDS.Jonas), sampleCards(HANDS.Priya)],
      sampleCards(BOARD.slice(0, MONEY_WENT_IN_AFTER))
    );

    expect(percentOf(odds, 0)).toBe(FAVOURITE_PERCENT);
    expect(LANDING_WORDS.pictures.Moment).toContain(BAD_BEAT.title);
    expect(LANDING_WORDS.pictures.Moment).toContain(
      `${FAVOURITE_PERCENT}% to win`
    );
    expect(LANDING_WORDS.pictures.Moment).toContain(chipsText(POT));
    expect(drawn.Moment).toContain(escaped(BAD_BEAT.line));
  });

  it("says in words every payment the settle-up card shows, and the card squares", () => {
    for (const { amount, from, to } of SETTLE_UP.transfers) {
      expect(LANDING_WORDS.pictures.SettleUp).toContain(from);
      expect(LANDING_WORDS.pictures.SettleUp).toContain(to);
      expect(LANDING_WORDS.pictures.SettleUp).toContain(chipsText(amount));
    }

    const paid = new Map<string, number>();

    for (const { amount, from, to } of SETTLE_UP.transfers) {
      paid.set(from, (paid.get(from) ?? 0) - amount);
      paid.set(to, (paid.get(to) ?? 0) + amount);
    }

    expect(SETTLE_UP.players.map(({ name, net }) => [name, net])).toStrictEqual(
      SETTLE_UP.players.map(({ name }) => [name, paid.get(name) ?? 0])
    );
  });

  it("draws each once for both themes, with every theme colour as a variable and no size of its own", () => {
    for (const picture of Object.values(drawn)) {
      expect(picture).toMatch(/^<svg xmlns="[^"]+" viewBox="[\d. ]+" /u);
      expect(picture).toContain("var(--landing-ink-0)");
      expect(picture).toContain(':root[data-theme="dark"]');
      expect(picture).not.toMatch(/<script|\son[a-z]+=/iu);
    }
  });
});

describe("the landing's words", () => {
  const all = [
    ...LANDING_WORDS.title,
    LANDING_WORDS.lede,
    LANDING_WORDS.close,
    LANDING_WORDS.open,
    LANDING_WORDS.quiet,
    LANDING_WORDS.said,
    LANDING_WORDS.shuffle,
    ...LANDING_WORDS.gestures,
    ...Object.values(LANDING_WORDS.pictures),
    ...Object.values(LANDING_WORDS.rules).flat(),
    ...TILES.flatMap(({ body, title }) => [title, body]),
  ];

  it.each(all)(
    "%s has no exclamation mark and none of the words we never use",
    (words) => {
      expect(words).not.toMatch(
        /!|seamless|elevate|experience|revolutionary|win money|real money|prize/iu
      );
    }
  );
});
