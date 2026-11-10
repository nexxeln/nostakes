import { codeFor, DEFAULT_AVATAR, render } from "@nostakes/avatar";
import type { Avatar } from "@nostakes/avatar";
import { Predicate } from "effect";

import "../../src/client/tokens.css";
import { defineTable } from "../../src/client/table/element.js";
import { BRAND_LINE } from "../../src/features/link-preview.js";
import {
  Happenings,
  TABLE_TAG,
  TableIntentSchema,
} from "../../src/features/table/snapshot.js";
import type {
  Happening,
  SeatSnapshot,
  TableIntent,
  TableSnapshot,
} from "../../src/features/table/snapshot.js";

const HAND = 42;

const BIG_BLIND = 20;

const RAISE_FALLBACK = 240;

const BRAND_FACE_PX = 520;

const CAST_FACE_PX = 96;

const plain: Avatar = {
  colour: "YellowRed",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Pucker",
  neck: "None",
  rank: "Two",
  species: "Goldfish",
  suit: "Heart",
};

const CAST = {
  dev: {
    ...plain,
    colour: "RedPink",
    eyes: "Sleepy",
    mouth: "Line",
    rank: "Queen",
    species: "Octopus",
    suit: "Club",
  },
  hero: DEFAULT_AVATAR,
  jonas: {
    ...plain,
    colour: "GreenYellow",
    eyes: "Slits",
    eyewear: "Shades",
    headwear: "Fedora",
    mouth: "Fangs",
    neck: "BowTie",
    rank: "Ace",
    species: "Hammerhead",
    suit: "Spade",
  },
  lou: {
    ...plain,
    colour: "RedYellow",
    eyes: "Beads",
    headwear: "Cowboy",
    mouth: "GoldTooth",
    neck: "Bolo",
    rank: "Jack",
    species: "Piranha",
    suit: "Diamond",
  },
  maya: { ...plain, headwear: "Cap", mouth: "Grin" },
  priya: {
    ...plain,
    colour: "PinkYellow",
    eyewear: "Round",
    rank: "Seven",
    species: "Puffer",
  },
} satisfies Record<string, Avatar>;

const seat = (
  index: number,
  name: string,
  avatar: Avatar,
  stack: number
): SeatSnapshot => ({
  avatar: codeFor(avatar),
  away: false,
  bet: 0,
  cardsHeld: 2,
  name,
  note: "",
  peeking: false,
  seat: index,
  shown: [],
  stack,
  status: "In",
});

const folded = (base: SeatSnapshot): SeatSnapshot => ({
  ...base,
  cardsHeld: 0,
  status: "Folded",
});

const betting = (base: SeatSnapshot, bet: number): SeatSnapshot => ({
  ...base,
  bet,
  stack: base.stack - bet,
});

const collected = (base: SeatSnapshot): SeatSnapshot => ({ ...base, bet: 0 });

const HERO = seat(0, "Sam", CAST.hero, 1340);

const MAYA = seat(1, "Maya", CAST.maya, 860);

const JONAS = seat(2, "Jonas", CAST.jonas, 1180);

const PRIYA = folded(seat(3, "Priya", CAST.priya, 940));

const DEV = folded(seat(4, "Dev", CAST.dev, 1010));

const LOU = seat(5, "Lou", CAST.lou, 840);

const OPENING_POT = 240;

const OPENING_BET = 60;

const BOARD = ["Ah", "Kd", "7s", "2c", "Kc"];

const HERO_CARDS = ["Ad", "Kd"];

const RIVAL_CARDS = ["As", "Qs"];

const opening: TableSnapshot = {
  afterHand: { bothOnly: false, rabbit: false, showable: [] },
  bigBlind: BIG_BLIND,
  boards: [BOARD],
  buttonSeat: 4,
  clock: { key: "hero", remainingMs: 21_000, seat: 0, totalMs: 30_000 },
  events: [
    { happening: Happenings.Start.make({ hand: HAND }), id: 1 },
    { happening: Happenings.Check.make({ seat: 1 }), id: 2 },
  ],
  handId: HAND,
  heroCards: HERO_CARDS,
  heroSeat: 0,
  hostTools: false,
  learned: ["Peek", "Fold", "Raise", "Keys"],
  legal: {
    call: OPENING_BET,
    check: false,
    fold: true,
    muck: false,
    raise: { isBet: false, max: HERO.stack, min: OPENING_BET * 2 },
    show: false,
  },
  pots: [OPENING_POT],
  rabbit: [],
  reactions: [],
  runVote: null,
  seats: [
    HERO,
    MAYA,
    betting(JONAS, OPENING_BET),
    PRIYA,
    DEV,
    betting(LOU, OPENING_BET),
  ],
  toAct: 0,
  waiting: "",
};

interface Beat {
  readonly seats: readonly SeatSnapshot[];
  readonly happenings: readonly Happening[];
  readonly clockSeat: number | null;
  readonly pots: readonly number[];
}

const beatsAfterRaise = (raisedTo: number): readonly Beat[] => {
  const hero = betting(HERO, raisedTo);
  const called = betting(JONAS, raisedTo);
  const pot = OPENING_POT + raisedTo * 2 + OPENING_BET;
  const louIn = betting(LOU, OPENING_BET);

  return [
    {
      clockSeat: 1,
      happenings: [
        Happenings.Bet.make({
          added: raisedTo,
          allIn: false,
          seat: 0,
          to: raisedTo,
        }),
      ],
      pots: [OPENING_POT],
      seats: [hero, MAYA, betting(JONAS, OPENING_BET), PRIYA, DEV, louIn],
    },
    {
      clockSeat: 2,
      happenings: [Happenings.Fold.make({ seat: 1 })],
      pots: [OPENING_POT],
      seats: [
        hero,
        folded(MAYA),
        betting(JONAS, OPENING_BET),
        PRIYA,
        DEV,
        louIn,
      ],
    },
    {
      clockSeat: 5,
      happenings: [
        Happenings.Call.make({
          added: raisedTo - OPENING_BET,
          allIn: false,
          seat: 2,
        }),
      ],
      pots: [OPENING_POT],
      seats: [hero, folded(MAYA), called, PRIYA, DEV, louIn],
    },
    {
      clockSeat: null,
      happenings: [
        Happenings.Fold.make({ seat: 5 }),
        Happenings.Collect.make({ street: "River" }),
      ],
      pots: [pot],
      seats: [
        collected(hero),
        folded(MAYA),
        collected(called),
        PRIYA,
        DEV,
        folded(collected(louIn)),
      ],
    },
    {
      clockSeat: null,
      happenings: [
        Happenings.Show.make({
          cards: RIVAL_CARDS,
          label: "Two pair",
          seat: 2,
        }),
        Happenings.Show.make({
          cards: HERO_CARDS,
          label: "Full house",
          seat: 0,
        }),
      ],
      pots: [pot],
      seats: [
        { ...collected(hero), shown: HERO_CARDS },
        folded(MAYA),
        { ...collected(called), shown: RIVAL_CARDS },
        PRIYA,
        DEV,
        folded(collected(louIn)),
      ],
    },
    {
      clockSeat: null,
      happenings: [Happenings.Win.make({ amount: pot, seat: 0 })],
      pots: [],
      seats: [
        {
          ...collected(hero),
          shown: HERO_CARDS,
          stack: hero.stack + pot,
        },
        folded(MAYA),
        { ...collected(called), shown: RIVAL_CARDS },
        PRIYA,
        DEV,
        folded(collected(louIn)),
      ],
    },
  ];
};

const STAGE_CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--color-page); }
#stage { position: fixed; inset: 0; }
#stage nostakes-table { position: absolute; inset: 0; display: block; }
.brand-card {
  position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; gap: 6vw;
  background: var(--color-page); color: var(--color-ink); font-family: var(--font-body); pointer-events: none;
  transition: opacity 400ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.brand-card.off { opacity: 0; }
.brand-face, .brand-cast span {
  position: relative; flex: none; line-height: 0; border-radius: var(--radius-face); background: var(--color-face);
  box-shadow: -0.1vw -0.12vw 0 var(--color-sheet-edge), 0 0 0 0.08vw var(--color-sheet-gap), 0.5vw 0.9vw 0 var(--color-sheet-shadow);
}
.brand-face { width: 28.6vw; height: 28.6vw; }
.brand-face svg, .brand-cast svg { position: absolute; left: 0; top: -5%; width: 100%; height: 100%; display: block; overflow: visible; }
.brand-words { display: flex; flex-direction: column; gap: 1.5vw; }
.brand-word, .corner-word {
  font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display);
  letter-spacing: var(--tracking-display); line-height: 1; color: var(--color-brand); text-shadow: 0.045em 0.055em 0 var(--color-brand-shadow);
}
.brand-word { font-size: 9.3vw; }
.brand-line { font-size: 3.2vw; color: var(--color-ink-muted); letter-spacing: -0.01em; }
.brand-cast { display: flex; gap: 1.1vw; margin-top: 2.2vw; }
.brand-cast span { width: 5.4vw; height: 5.4vw; box-shadow: var(--shadow-sheet-1); }
.corner-word { position: absolute; z-index: 9; left: 2.4vw; top: 2vw; font-size: 2.2vw; pointer-events: none; }
`;

const faceSpan = (avatar: Avatar, size: number, className: string) => {
  const span = document.createElement("span");

  span.className = className;
  span.innerHTML = render(avatar, {
    expression: "Resting",
    size,
    theme: "Light",
  });

  return span;
};

const textDiv = (className: string, text: string) => {
  const div = document.createElement("div");

  div.className = className;
  div.textContent = text;

  return div;
};

const brandCard = () => {
  const card = document.createElement("div");
  const words = document.createElement("div");
  const cast = document.createElement("div");

  card.className = "brand-card";
  words.className = "brand-words";
  cast.className = "brand-cast";
  cast.append(
    ...[CAST.maya, CAST.jonas, CAST.priya, CAST.dev, CAST.lou].map((avatar) =>
      faceSpan(avatar, CAST_FACE_PX, "")
    )
  );
  words.append(
    textDiv("brand-word", "nostakes"),
    textDiv("brand-line", BRAND_LINE),
    cast
  );
  card.append(faceSpan(CAST.hero, BRAND_FACE_PX, "brand-face"), words);

  return card;
};

interface TableHost extends HTMLElement {
  snapshot: TableSnapshot | null;
  sound: boolean;
}

const isTableHost = (node: Element): node is TableHost =>
  node.tagName.toLowerCase() === TABLE_TAG;

const isTableIntent = (event: Event): event is CustomEvent<TableIntent> =>
  event instanceof CustomEvent;

export const STAGE_CUE = "nostakes-stage";

const isCue = (event: Event): event is CustomEvent<string> =>
  event instanceof CustomEvent && Predicate.isString(event.detail);

const mount = () => {
  defineTable();

  const style = document.createElement("style");
  const root = document.querySelector<HTMLElement>("#stage");
  const table = document.createElement(TABLE_TAG);
  const card = brandCard();

  style.textContent = STAGE_CSS;
  document.head.append(style);

  if (root === null || !isTableHost(table)) {
    throw new Error("The brand stage needs a #stage element and the table.");
  }

  let raisedTo: number | null = null;
  let beat = 0;
  let current = opening;

  const advance = () => {
    const step = beatsAfterRaise(raisedTo ?? RAISE_FALLBACK)[beat];

    if (step === undefined) {
      return;
    }

    const lastId = current.events.at(-1)?.id ?? 0;

    beat += 1;
    current = {
      ...current,
      clock:
        step.clockSeat === null
          ? null
          : {
              key: `seat-${step.clockSeat}`,
              remainingMs: 24_000,
              seat: step.clockSeat,
              totalMs: 30_000,
            },
      events: [
        ...current.events,
        ...step.happenings.map((happening, index) => ({
          happening,
          id: lastId + index + 1,
        })),
      ],
      legal: null,
      pots: step.pots,
      seats: step.seats,
      toAct: step.clockSeat,
    };
    table.snapshot = current;
  };

  table.sound = false;
  table.addEventListener("intent", (event) => {
    if (isTableIntent(event) && TableIntentSchema.guards.Raise(event.detail)) {
      raisedTo = event.detail.to;
      root.dataset.raised = String(event.detail.to);
    }
  });
  globalThis.addEventListener(STAGE_CUE, (event) => {
    if (!isCue(event)) {
      return;
    }

    if (event.detail === "next") {
      advance();
    } else {
      card.classList.toggle("off", event.detail === "brand-off");
    }
  });
  root.append(table, textDiv("corner-word", "nostakes"), card);
  table.snapshot = current;
  root.dataset.ready = "true";
};

mount();
