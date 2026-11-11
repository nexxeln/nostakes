import { DESK_QUERY } from "./film.js";
import type { Filmed } from "./film.js";

export const BASE = "/lab/one-hand";

export const BEATS = [
  0, 44, 108, 170, 212, 262, 298, 328, 388, 444, 470, 490, 548, 600, 660, 716,
  754, 806, 838, 866, 922, 962, 1000,
];

export const STILLS = [
  0, 100, 170, 258, 328, 372, 426, 600, 670, 750, 806, 922, 1000,
];

const FONT_FACE = /@font-face\s*\{[^}]*\}\s*/gu;

const MODES = `
.mark{position:absolute;left:0;width:1px;pointer-events:none}
.stepped .film .sp,.stepped .film .plane,.stepped .film [data-p]{animation-duration:100s;animation-timeline:auto;animation-play-state:paused}
.pinned{display:none}
.stills .film{height:auto}
.stills .reel{display:grid;justify-content:center;gap:28px;padding:24px 16px 120px}
.stills .reel .stage{position:relative;inset:auto;width:var(--still-w);height:calc(var(--still-w) * 610 / 360);border-radius:18px;background:var(--color-page);box-shadow:var(--shadow-sheet-2)}
.stills .reel .foot{display:none}
.stills .reel .caps{bottom:16em}
.stills .reel .scene{top:44em;bottom:56em}
.stills .film{--still-w:min(100vw - 32px,420px);--u:calc(var(--still-w) / 360);--v:var(--u)}
.stills .pinned{position:fixed;left:16px;right:16px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2;display:grid;place-items:center;height:52px;max-width:420px;margin:0 auto;font-size:1px}
@media ${DESK_QUERY}{
.stills .film{--still-w:min(100vw - 64px,1100px);--u:calc(var(--still-w) / 1280)}
.stills .reel .stage{height:calc(var(--still-w) * 720 / 1280)}
.stills .reel .scene{top:0;bottom:0}
.stills .reel .caps{bottom:auto}
}
@media (prefers-reduced-motion:reduce){
.film{height:auto}
.film .stage{position:relative;height:100svh}
.film .sp,.film .plane,.film [data-p]{animation-duration:100s;animation-timeline:auto;animation-play-state:paused}
}
`;

export const stylesheet = (tokens: string, page: string, film: Filmed) =>
  [tokens.replaceAll(FONT_FACE, ""), page, MODES, film.css].join("\n");

export const pageOf = (film: Filmed) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f1e8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16141d" media="(prefers-color-scheme: dark)">
<title>nostakes: one hand</title>
<link rel="preload" href="${BASE}/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${BASE}/dm-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}/film.gen.css">
<script src="${BASE}/film.gen.js" defer></script>
</head>
<body>
<main class="film" id="film" data-beats="${BEATS.join(",")}" data-stills="${STILLS.join(",")}">
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
</div>
<div class="plane talk">
${film.layers.talk}
</div>
<header class="top">
<p class="brand">nostakes</p>
</header>
<div class="foot">
<a class="open" href="/"><span>Open a room</span></a>
</div>
<div class="streets">
${film.layers.hud}
</div>
<p class="chat"><span>The group chat</span></p>
<div class="caps">
${film.layers.caps}
</div>
</div>
</main>
<a class="open pinned" href="/"><span>Open a room</span></a>
</body>
</html>
`;
