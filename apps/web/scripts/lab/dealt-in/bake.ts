import { render } from "@nostakes/avatar";
import type { Theme } from "@nostakes/avatar";

import { FRIEND_IDS, FRIENDS } from "./cast.js";
import type { FriendId } from "./cast.js";
import { stageMarkup } from "./markup.js";
import type { BakedFace } from "./markup.js";

const BASE = "/lab/dealt-in";

const FACE_PX = 96;

const drawn = (id: FriendId, theme: Theme) =>
  render(FRIENDS[id].avatar, { expression: "Resting", size: FACE_PX, theme });

const baked = (id: FriendId): readonly [FriendId, BakedFace] => [
  id,
  { dim: drawn(id, "Dark"), lit: drawn(id, "Light") },
];

const [priya, mara, jonas, bo, kit] = FRIEND_IDS.map(baked);

const FACES = {
  bo: bo?.[1] ?? { dim: "", lit: "" },
  jonas: jonas?.[1] ?? { dim: "", lit: "" },
  kit: kit?.[1] ?? { dim: "", lit: "" },
  mara: mara?.[1] ?? { dim: "", lit: "" },
  priya: priya?.[1] ?? { dim: "", lit: "" },
};

const HEAD = [
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  '<meta name="robots" content="noindex" />',
  '<meta name="color-scheme" content="light dark" />',
  '<meta name="theme-color" content="#f6f1e8" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#16141d" media="(prefers-color-scheme: dark)" />',
  "<title>nostakes: you are dealt in</title>",
  `<link rel="preload" href="${BASE}/figtree.gen.woff2" as="font" type="font/woff2" crossorigin />`,
  `<link rel="preload" href="${BASE}/dm-sans.gen.woff2" as="font" type="font/woff2" crossorigin />`,
  `<link rel="stylesheet" href="${BASE}/page.gen.css" />`,
  `<script src="${BASE}/theme.gen.js"></script>`,
  '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
].join("");

const BAR =
  '<header class="bar"><a class="button" href="/" data-door>Open a room</a></header>';

const MARK = '<a class="mark" href="/" data-door>nostakes</a>';

const said = (id: FriendId, words: string) =>
  `<li class="fact"><span class="who" data-face="${id}"></span><p><b>${FRIENDS[id].name}</b>${words}</p></li>`;

const FACTS = [
  '<section class="facts">',
  '<h2 class="kicker">Poker night with your friends, in the browser.</h2>',
  '<ul class="talk">',
  said("bo", "It is free. I never signed up for anything."),
  said("kit", "Nine seats. I play from Lisbon, they play from home."),
  said(
    "mara",
    "The host sets the house rules. Antes, straddles, run it twice."
  ),
  said("priya", "The deck is sealed before every hand. Every phone checks it."),
  said("jonas", "At the end it says who pays whom. It holds no money."),
  "</ul>",
  '<a class="button big" href="/" data-door>Open a room</a>',
  '<button class="link" type="button" data-again>Deal me another hand</button>',
  "</section>",
].join("");

export const PAGE_HTML = [
  '<!doctype html><html lang="en"><head>',
  HEAD,
  "</head><body>",
  BAR,
  '<main><h1 class="sr">nostakes: poker night with your friends, in the browser</h1>',
  `<section class="stage" aria-label="A hand of poker, dealt to you">${MARK}${stageMarkup(FACES)}</section>`,
  FACTS,
  "</main>",
  `<script type="module" src="${BASE}/page.gen.js"></script>`,
  "</body></html>",
].join("");

export const THEME_SCRIPT =
  '(()=>{try{var t=localStorage.getItem("nostakes.theme");if(t==="Dark"||t==="Light"){document.documentElement.dataset.theme=t.toLowerCase()}}catch(e){}})();';
