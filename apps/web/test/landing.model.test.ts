import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Option } from "effect";
import { Scene } from "foldkit";
import { findAll, textContent } from "foldkit/scene";

import { ScrollToTop } from "../src/client/commands.js";
import { LANDING_WORDS } from "../src/features/landing/view.js";
import { Messages } from "../src/features/message.js";
import type { KnownRoom, Model } from "../src/features/model.js";
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
    expect(texts(firstVisit, "h1")).toStrictEqual([LANDING_WORDS.title]);
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

describe("the landing's words", () => {
  const all = [
    LANDING_WORDS.title,
    LANDING_WORDS.lede,
    LANDING_WORDS.under,
    LANDING_WORDS.close,
    LANDING_WORDS.open,
    ...LANDING_WORDS.beats.flatMap(({ line, time }) => [line, time]),
    ...LANDING_WORDS.finePrint.flatMap(({ label, value }) => [label, value]),
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
