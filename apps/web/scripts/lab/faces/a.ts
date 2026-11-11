import {
  bigFace,
  doneButton,
  el,
  mirror,
  mount,
  shuffle,
  shuffleButton,
  themeSwitch,
  undoButton,
  wall,
} from "./lib.js";

const page = el(
  "div",
  { class: "a-page" },
  el("header", { class: "stage" }, bigFace(), mirror()),
  el("main", { class: "a-wall wall-box" }, wall({ previews: true })),
  el(
    "footer",
    { class: "foot bar" },
    undoButton(),
    shuffleButton(),
    themeSwitch(),
    doneButton()
  )
);

mount(page, { s: shuffle });
