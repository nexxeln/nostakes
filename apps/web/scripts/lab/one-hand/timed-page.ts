import { DESK_QUERY } from "./film.js";
import type { TimedFilm } from "./timed-film.js";
import { TIMED_BEATS, TIMED_LENGTH, TIMED_STILL } from "./timed-score.js";

export const TIMED_BASE = "/lab/one-hand-2";

const FIRST_BASE = "/lab/one-hand/";

const FONT_FACE = /@font-face\s*\{[^}]*\}\s*/gu;

const PARTS = [".sp", ".plane", "[data-p]", ".stage"];

const within = (root: string) =>
  PARTS.map((part) => `${root} ${part}`).join(",");

const PLAYER = `
@keyframes clock{from{outline-offset:0}to{outline-offset:0}}
${within(".reel")}{animation-duration:${TIMED_LENGTH}ms;animation-timing-function:linear;animation-fill-mode:both;animation-play-state:paused}
${within(".reel.run")}{animation-play-state:running}
.reel .stage{animation-name:clock}
.reel:not(.run) .who:not(.tapped) .hop,.reel:not(.run) .hold i,.reel.ended .hold i{animation-play-state:paused}
.reel.peeked .card .hold{visibility:visible}
.reel.peeked .card .hold i{animation:none;visibility:hidden}
@media (prefers-reduced-motion:reduce){
${within(".reel")}{animation-delay:-${TIMED_STILL}ms}
.reel .marks,.reel .hint{display:none}
}
`;

const UNSCRIPTED = `@media (prefers-reduced-motion:no-preference){${within(".reel")}{animation-play-state:running}}`;

const FACTS: readonly {
  readonly body: string;
  readonly prop: string;
  readonly title: string;
}[] = [
  {
    body: "Open a room and drop the link in the group chat. Up to nine friends sit down. Nobody downloads anything and nobody signs up.",
    prop: '<span class="mini link"><b>nostakes</b><i></i><i></i></span>',
    title: "One link.",
  },
  {
    body: "Hold your cards to peek. Drag a chip to raise. Flick them away to fold.",
    prop: '<span class="mini hand"><i></i><i></i></span>',
    title: "It feels like cards.",
  },
  {
    body: "The host sets them: antes, straddles, run it twice or three times, show one card or muck. It plays the way your table already plays.",
    prop: '<span class="mini slip"><b>House rules</b><i></i><i></i><i></i></span>',
    title: "Your house rules.",
  },
  {
    body: "Every deck is sealed before the deal, and every phone checks the cards it was shown.",
    prop: '<span class="mini deck"><i></i><i></i><b>Sealed</b></span>',
    title: "A deck you can check.",
  },
  {
    body: "A bad beat or a bluff shown gets its own picture and a clip to keep.",
    prop: '<span class="mini shot"><i></i><i></i><i></i></span>',
    title: "The hand you will hear about.",
  },
  {
    body: "When the night ends it lists the fewest payments that square everyone. It keeps the count and never touches money.",
    prop: '<span class="mini bill"><i></i><b>1,000</b><i></i><b>250</b></span>',
    title: "Who pays whom.",
  },
];

const facts = () =>
  FACTS.map(
    ({ body, prop, title }) =>
      `<li class="fact"><span class="prop">${prop}</span><div><h3>${title}</h3><p>${body}</p></div></li>`
  ).join("\n");

export const timedStylesheet = (
  tokens: string,
  shared: string,
  layout: string,
  film: TimedFilm
) =>
  [
    tokens.replaceAll(FONT_FACE, ""),
    shared.replaceAll(FIRST_BASE, `${TIMED_BASE}/`),
    layout.replaceAll("@media (--desk)", `@media ${DESK_QUERY}`),
    PLAYER,
    film.css,
  ].join("\n");

export const timedPageOf = (film: TimedFilm) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f1e8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16141d" media="(prefers-color-scheme: dark)">
<title>nostakes: poker night with your friends</title>
<link rel="preload" href="${TIMED_BASE}/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${TIMED_BASE}/dm-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${TIMED_BASE}/film.gen.css">
<script src="${TIMED_BASE}/film.gen.js" defer></script>
<noscript><style>${UNSCRIPTED}</style></noscript>
</head>
<body class="timed">
<main class="first">
<header class="bar"><p class="brand">nostakes</p></header>
<h1 class="promise"><span>Your friends moved.</span> <span>Poker night didn't.</span></h1>
<p class="lede">Poker night with your friends, in the browser.</p>
<section class="reel" id="reel" aria-label="One hand of poker between five friends" data-length="${TIMED_LENGTH}" data-beats="${TIMED_BEATS.join(",")}">
<div class="stage" id="stage">
<div class="scene">
<div class="plane" id="back">
${film.layers.back}
</div>
<div class="plane" id="world">
${film.layers.world}
</div>
<div class="plane over">
${film.layers.over}
</div>
<div class="plane talk">
${film.layers.talk}
</div>
</div>
<p class="hint"><span class="waits">Paused. Tap to step.</span><span class="over">Play it again</span></p>
</div>
<div class="strip">
<div class="says">
${film.captions}
</div>
<div class="marks">
<button class="play" type="button" aria-label="Pause"><i></i></button>
${film.marks}
</div>
</div>
</section>
<div class="cta">
<a class="open" href="/"><span>Open a room</span></a>
<p class="fine">Free. Nobody signs up.</p>
</div>
</main>
<section class="facts">
<h2>The short version</h2>
<ul>
${facts()}
</ul>
<div class="cta again">
<a class="open" href="/"><span>Open a room</span></a>
<p class="fine">Free. Nobody signs up.</p>
</div>
<p class="small"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></p>
</section>
</body>
</html>
`;
