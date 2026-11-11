import { codeFor, randomAvatar } from "@nostakes/avatar";
import type { Avatar } from "@nostakes/avatar";

import {
  bigFace,
  commit,
  cornerIndex,
  doneButton,
  el,
  faceInto,
  flourish,
  mirror,
  mount,
  nameOf,
  nextSeed,
  onPaint,
  paint,
  rove,
  same,
  say,
  shown,
  state,
  themeSwitch,
  undoButton,
  wall,
  wearing,
} from "./lib.js";
import type { PartKey } from "./lib.js";

interface Hold {
  readonly key: string;
  readonly label: string;
  readonly parts: readonly PartKey[];
  readonly covers: string;
}

const HOLDS: readonly Hold[] = [
  { covers: "The fish", key: "fish", label: "Fish", parts: ["species"] },
  { covers: "Its colours", key: "colour", label: "Colour", parts: ["colour"] },
  {
    covers: "The card and its suit",
    key: "card",
    label: "Card",
    parts: ["rank", "suit"],
  },
  {
    covers: "Eyes, mouth, and mark",
    key: "face",
    label: "Face",
    parts: ["eyes", "mouth", "mark"],
  },
  {
    covers: "Hat, glasses, neck, and extra",
    key: "outfit",
    label: "Outfit",
    parts: ["headwear", "eyewear", "neck", "extra"],
  },
];

const WORN: readonly PartKey[] = [
  "headwear",
  "eyewear",
  "neck",
  "mark",
  "extra",
];

const wide = matchMedia("(min-width: 900px) and (min-height: 560px)");

const held = new Set<string>();

let hand: readonly Avatar[] = [];

let round = 0;

let tuning = false;

const describe = (avatar: Avatar) =>
  [
    nameOf("species", avatar.species),
    nameOf("colour", avatar.colour).toLowerCase(),
    ...WORN.flatMap((part) =>
      avatar[part] === "None" ? [] : [nameOf(part, avatar[part]).toLowerCase()]
    ),
  ].join(", ");

const table = el("div", {
  "aria-label": "Dealt faces",
  class: "c-table",
  role: "radiogroup",
});

rove(table, ".c-card");

const CARD_GAP = 12;

const CARD_RATIO = 1.2;

const EARLIER_ROOM = 110;

const handSize = () => {
  const columns = wide.matches ? 5 : 3;
  const deck = table.parentElement;
  const across = table.clientWidth;

  if (deck === null || across === 0) {
    return columns * 2;
  }

  const high = ((across - 32) / columns) * CARD_RATIO;

  const room = wide.matches
    ? deck.clientHeight - table.offsetTop - EARLIER_ROOM
    : table.clientHeight;

  const rows = Math.floor((room + CARD_GAP) / (high + CARD_GAP));

  return columns * Math.min(Math.max(rows, 2), 3);
};

const MOST_TRIES = 900;

const PATIENT_TRIES = 500;

const FISH_KINDS = 8;

const keeping = (rolled: Avatar): Avatar => {
  let face = rolled;

  for (const hold of HOLDS) {
    if (held.has(hold.key)) {
      for (const part of hold.parts) {
        face = wearing(face, part, state.avatar[part]);
      }
    }
  }

  return face;
};

const deal = () => {
  if (held.size === HOLDS.length) {
    return;
  }

  const size = handSize();
  const seen = new Set([codeFor(state.avatar)]);
  const fish = new Set<string>();
  const next: Avatar[] = [];

  for (let tries = 0; next.length < size && tries < MOST_TRIES; tries += 1) {
    const rolled = randomAvatar(nextSeed());
    const patient = tries < PATIENT_TRIES;

    const fits = held.has("fish")
      ? rolled.species === state.avatar.species || !patient
      : !fish.has(rolled.species) || fish.size >= FISH_KINDS || !patient;

    const made = keeping(rolled);

    if (fits && !seen.has(codeFor(made))) {
      seen.add(codeFor(made));
      fish.add(rolled.species);
      next.push(made);
    }
  }

  hand = next;
  round += 1;
  say(`${next.length} faces dealt`);
  paint();
};

const take = (avatar: Avatar) => {
  flourish();
  commit(avatar, describe(avatar));
};

const TILTS = [-0.9, 0.6, -0.4, 0.8, -0.7, 0.5, 0.9, -0.6, 0.4, -0.8];

const dealtCard = (avatar: Avatar, index: number) => {
  const art = el("span", { "aria-hidden": "true", class: "c-card-art" });

  const button = el(
    "button",
    {
      "aria-label": describe(avatar),
      class: "c-card",
      role: "radio",
      style: `--i:${index};--tilt:${TILTS[index % TILTS.length] ?? 0}deg`,
      type: "button",
    },
    cornerIndex(avatar),
    art
  );

  button.addEventListener("click", () => {
    take(avatar);
  });

  return { art, avatar, button };
};

let cards: readonly ReturnType<typeof dealtCard>[] = [];

let drawn = -1;

onPaint(() => {
  if (drawn !== round) {
    drawn = round;
    cards = hand.map(dealtCard);
    table.replaceChildren(...cards.map((card) => card.button));
  }

  const mine = cards.findIndex((card) => same(card.avatar, state.avatar));

  for (const [index, { art, avatar, button }] of cards.entries()) {
    const size = art.getBoundingClientRect().width;

    button.setAttribute("aria-checked", String(index === mine));
    button.tabIndex = index === mine || (mine === -1 && index === 0) ? 0 : -1;

    if (size > 0) {
      faceInto(art, avatar, { size });
    }
  }
});

const toggle = (hold: Hold) => {
  if (held.has(hold.key)) {
    held.delete(hold.key);
  } else {
    held.add(hold.key);
  }

  say(`${hold.label} ${held.has(hold.key) ? "held" : "not held"}`);
  paint();
};

const holdButtons = HOLDS.map((hold, index) => {
  const button = el(
    "button",
    {
      "aria-keyshortcuts": String(index + 1),
      class: "c-hold",
      title: `${hold.covers} (${index + 1})`,
      type: "button",
    },
    el("span", { "aria-hidden": "true", class: "c-pin" }),
    hold.label
  );

  button.addEventListener("click", () => {
    toggle(hold);
  });

  return { button, hold };
});

const dealButton = (name: string) => {
  const button = el("button", {
    "aria-keyshortcuts": "D",
    class: `button c-deal ${name}`,
    type: "button",
  });

  button.addEventListener("click", deal);
  onPaint(() => {
    button.textContent = held.size === 0 ? "Deal" : "Deal the rest";
    button.disabled = held.size === HOLDS.length;
  });

  return button;
};

const tuneButton = el(
  "button",
  { "aria-expanded": "false", class: "button quiet c-tune", type: "button" },
  "Fine tune"
);

const closeTune = el(
  "button",
  { class: "button c-tune-close", type: "button" },
  "Back to the deal"
);

const tuneFace = el("span", { "aria-hidden": "true", class: "c-tune-face" });

const tunePanel = el(
  "section",
  { "aria-label": "Fine tune", class: "c-fine", hidden: true },
  el("header", { class: "c-fine-head" }, tuneFace, closeTune),
  el("div", { class: "c-fine-wall wall-box" }, wall({ previews: true }))
);

const setTuning = (open: boolean) => {
  tuning = open;
  tunePanel.toggleAttribute("hidden", !open);
  paint();
  (open ? closeTune : tuneButton).focus();
};

tuneButton.addEventListener("click", () => {
  setTuning(true);
});

closeTune.addEventListener("click", () => {
  setTuning(false);
});

const earlier = el("div", {
  "aria-label": "Earlier faces",
  class: "c-earlier-row",
  role: "group",
});

const earlierBox = el(
  "div",
  { class: "c-earlier", hidden: true },
  el("p", { class: "group-label" }, "Earlier"),
  earlier
);

const EARLIER_SHOWN = 9;

const EARLIER_PX = 52;

const TUNE_FACE_PX = 72;

const earlierFace = (avatar: Avatar) => {
  const art = el("span", { "aria-hidden": "true", class: "c-earlier-art" });

  const button = el(
    "button",
    {
      "aria-label": describe(avatar),
      class: "c-earlier-face",
      title: "Take this one back",
      type: "button",
    },
    art
  );

  faceInto(art, avatar, { size: EARLIER_PX });
  button.addEventListener("click", () => {
    take(avatar);
  });

  return button;
};

onPaint(() => {
  for (const { button, hold } of holdButtons) {
    button.setAttribute("aria-pressed", String(held.has(hold.key)));
  }

  tuneButton.setAttribute("aria-expanded", String(tuning));

  if (tuning) {
    faceInto(tuneFace, shown(), {
      expression: state.expression,
      layers: true,
      size: TUNE_FACE_PX,
    });
  }

  const past = state.past.slice(-EARLIER_SHOWN).toReversed();

  earlier.replaceChildren(...past.map(earlierFace));
  earlierBox.toggleAttribute("hidden", past.length === 0);
});

const page = el(
  "div",
  { class: "c-page" },
  el("header", { class: "stage" }, bigFace(), mirror()),
  el(
    "section",
    { class: "c-deck" },
    el(
      "div",
      { class: "c-holds" },
      el(
        "div",
        { class: "c-holds-head" },
        el("p", { class: "group-label", id: "hold-label" }, "Hold"),
        tuneButton,
        themeSwitch()
      ),
      el(
        "div",
        { "aria-labelledby": "hold-label", class: "c-hold-row", role: "group" },
        ...holdButtons.map((each) => each.button),
        dealButton("is-wide")
      )
    ),
    table,
    earlierBox,
    tunePanel
  ),
  el(
    "footer",
    { class: "foot bar" },
    undoButton(),
    dealButton("is-narrow"),
    doneButton()
  )
);

const holdKeys = Object.fromEntries(
  HOLDS.map((hold, index) => [
    String(index + 1),
    () => {
      toggle(hold);
    },
  ])
);

mount(page, {
  ...holdKeys,
  " ": () => {
    if (document.activeElement === document.body) {
      deal();
    }
  },
  d: deal,
  escape: () => {
    if (tuning) {
      setTuning(false);
    }
  },
  s: deal,
});

deal();

wide.addEventListener("change", deal);
