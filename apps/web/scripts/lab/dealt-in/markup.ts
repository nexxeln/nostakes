import { cardFaceMarks, cardFaceOf } from "../../../src/features/card-art.js";
import { FRIEND_IDS, FRIENDS, STARTING_STACK } from "./cast.js";
import type { FriendId } from "./cast.js";

export interface BakedFace {
  readonly dim: string;
  readonly lit: string;
}

export type BakedFaces = Readonly<Record<FriendId, BakedFace>>;

export const chipsText = (amount: number) =>
  Math.trunc(amount).toLocaleString("en-US");

export const cardMarkup = (card: string) => {
  const face = cardFaceOf(card);

  const marks =
    face === undefined
      ? ""
      : `<svg viewBox="0 0 100 140">${cardFaceMarks(face)}</svg>`;

  return `<div class="card" data-card="${card}"><div class="back"></div><div class="face suit-${face?.suit ?? "s"}">${marks}</div></div>`;
};

const RING =
  '<svg class="ring" viewBox="0 0 100 100"><rect class="track" x="2" y="2" width="96" height="96" rx="14"/><rect class="run" x="2" y="2" width="96" height="96" rx="14" pathLength="100"/></svg>';

const labelMarkup = (name: string, host: boolean) =>
  `<div class="label"><div class="name">${name}${host ? '<span class="host">Host</span>' : ""}</div><div class="line"><span class="st">${chipsText(STARTING_STACK)}</span><span class="act"></span></div></div>`;

const seatMarkup = (id: FriendId, face: BakedFace) =>
  `<div class="seat at" data-seat="${id}"><div class="tile"><div class="frame"></div>${RING}<div class="pic"><span class="lit">${face.lit}</span><span class="dim">${face.dim}</span></div><div class="tab"></div></div>${labelMarkup(FRIENDS[id].name, id === "mara")}</div>`;

const pileMarkup = (id: string) =>
  `<div class="pile at" data-seat="${id}"><i class="dot paper-chip"></i><span class="amt"></span><span class="tag"></span></div>`;

const SLOT = '<div class="slot"></div>';

const KEYS =
  '<div class="keys"><span><kbd>Space</kbd>peek</span><span><kbd>C</kbd>call</span><span><kbd>R</kbd>raise</span><span><kbd>F</kbd>fold</span></div>';

const RAIL =
  '<div class="rail"><div class="wash"></div><div class="track"><div class="fill"></div></div><div class="dets"></div><div class="held"></div><div class="readout"><div class="k">Raise to</div><div class="v">0</div><div class="note">Let go to bet. Slide back down to cancel.</div></div></div>';

const FINALE = [
  '<div class="finale">',
  '<div class="backing"></div>',
  '<div class="picture"><div class="native"></div></div>',
  '<div class="keeps"><button class="button paper" type="button" data-keep="Chat">Keep it</button><button class="link" type="button" data-keep="Story">Story size</button></div>',
  '<div class="slipwrap"><div class="receipt"></div></div>',
  '<div class="outro"><p class="lede">That took thirty seconds. Now do it with your friends.</p><a class="button big" href="/" data-door>Open a room</a><p class="small">Free. Nobody signs up. Your face comes with you.</p></div>',
  "</div>",
].join("");

export const stageMarkup = (faces: BakedFaces) =>
  [
    '<div class="scene intro">',
    '<div class="felt"></div>',
    '<div class="deck at"><i></i><i></i><i></i></div>',
    '<div class="seal at"><b>Deck sealed.</b> Your phone checks it.</div>',
    '<div class="pot at"><span class="k">Pot</span><span class="v">0</span></div>',
    `<div class="board at">${SLOT.repeat(5)}</div>`,
    ...FRIEND_IDS.map((id) => seatMarkup(id, faces[id])),
    ...[...FRIEND_IDS, "you"].map(pileMarkup),
    ...FRIEND_IDS.map((id) => `<div class="shown" data-seat="${id}"></div>`),
    '<div class="dealer">D</div>',
    `<div class="me at down" data-seat="you"><div class="flipper"><div class="back"></div><div class="frame"></div>${RING}<div class="pic"></div><div class="tab"></div></div>${labelMarkup("You", false)}</div>`,
    '<div class="hand at"><div class="hc"></div><div class="hc"></div></div>',
    '<div class="cap"><p class="line"></p><p class="sub">Tap it for another.</p></div>',
    '<div class="hint"><span class="say"></span><span class="foot"></span></div>',
    RAIL,
    '<div class="fx"></div>',
    '<button class="chipctl at nudge" type="button"><span class="disc"></span><span class="lbl"><span class="a">Deal</span><span class="b">me in</span></span></button>',
    KEYS,
    '<div class="step">Tap to go on</div>',
    FINALE,
    "</div>",
  ].join("");
