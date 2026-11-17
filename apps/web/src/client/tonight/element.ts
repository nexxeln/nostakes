import { Effect } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import { chipsText } from "../../features/moments/captions.js";
import { pictureSvg } from "../../features/moments/picture.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import { TONIGHT_TAG, tonightElement } from "../../features/tonight/element.js";
import type { TonightMode } from "../../features/tonight/element.js";
import { tonightSummary } from "../../features/tonight/words.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { offer } from "../pictures/keeper.js";
import { paintLabel, paintThumb } from "./markup.js";
import { nightOf } from "./night.js";
import type { Night, NightMoment, PictureKind } from "./night.js";

const STYLE = `
:host { display: block; color: var(--color-ink, #1f1c31); font: var(--weight-body, 500) var(--text-2, 15px)/var(--leading, 1.4) var(--font-body, sans-serif); }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3, 12px); }
h2 { margin: 0; font: var(--weight-display, 800) var(--text-6, 34px)/1.05 var(--font-display, sans-serif); letter-spacing: var(--tracking-display, -0.02em); }
:host([mode="Settled"]) h2 { font-size: var(--text-4, 22px); }
.summary { margin: var(--space-1, 4px) 0 var(--space-4, 16px); color: var(--color-ink-muted, #716a79); }
.done { font: 700 var(--text-3, 18px)/1 var(--font-body, sans-serif); color: var(--color-ink-muted, #716a79); background: none; border: 0; min-height: var(--size-touch, 44px); padding: 0 var(--space-2, 8px); }
:host([mode="Settled"]) .done { display: none; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: grid; grid-template-columns: 96px 1fr; gap: var(--space-3, 12px); padding: var(--space-4, 16px) 0; border-top: 1px solid var(--color-line, #d9cfbf); }
li:first-child { border-top: 0; }
.thumb { width: 96px; border-radius: var(--radius-2, 8px); overflow: hidden; box-shadow: var(--shadow-sheet-1); background: var(--color-raised, #fffdf8); align-self: start; position: relative; }
.thumb svg { display: block; width: 100%; height: auto; }
.length { position: absolute; left: 6px; bottom: 6px; font: 700 12px/1 var(--font-body, sans-serif); color: #fffaf3; background: rgb(22 20 29 / 0.82); border-radius: 6px; padding: 4px 6px; }
.tags { display: flex; gap: var(--space-2, 8px); align-items: center; color: var(--color-ink-muted, #716a79); font-weight: 600; }
.tag { font: 800 12px/1 var(--font-body, sans-serif); letter-spacing: 0.06em; text-transform: uppercase; padding: 5px 8px; border-radius: 6px; }
.tag.asked { background: var(--color-accent, #ef5326); color: var(--color-on-accent, #fffaf3); }
.tag.auto { border: 1.5px solid var(--color-line-strong, #a39a8c); color: var(--color-ink-muted, #716a79); }
.title { margin: var(--space-1, 4px) 0 0; font: var(--weight-display, 800) var(--text-4, 22px)/1.15 var(--font-display, sans-serif); letter-spacing: var(--tracking-display, -0.02em); }
.who { margin: 2px 0 var(--space-2, 8px); color: var(--color-ink-muted, #716a79); }
.making { display: flex; align-items: center; gap: var(--space-2, 8px); font-weight: 700; margin-bottom: var(--space-2, 8px); }
.ring { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--color-accent, #ef5326) calc(var(--made, 0) * 1turn), var(--color-ring-track, #e4dac8) 0); -webkit-mask: radial-gradient(circle, transparent 6px, #000 7px); mask: radial-gradient(circle, transparent 6px, #000 7px); }
.buttons { display: flex; flex-wrap: wrap; gap: var(--space-2, 8px); }
button.act { font: 700 var(--text-2, 15px)/1 var(--font-body, sans-serif); min-height: var(--size-touch, 44px); padding: 0 var(--space-3, 12px); border: 0; border-radius: var(--radius-3, 10px); color: var(--color-raised-ink, #1f1c31); background: var(--color-raised, #fffdf8); box-shadow: var(--shadow-sheet-1); display: inline-flex; gap: 6px; align-items: center; }
button.act svg { width: 18px; height: 18px; }
button.act.primary { background: var(--color-accent, #ef5326); color: var(--color-on-accent, #fffaf3); }
button.act:active { transform: translate(var(--press-1, 1px 1.8px)); }
button.act[aria-disabled="true"] { opacity: 0.55; }
.empty { color: var(--color-ink-muted, #716a79); }
.kept { margin-top: var(--space-5, 24px); color: var(--color-ink-muted, #716a79); font-size: var(--text-1, 13px); }
`;

const THUMB_LOOK = { fonts: "" } as const;

const namesOf = (picture: MomentPicture) => {
  const [lead, other] = picture.seats;

  if (lead === undefined) {
    return "";
  }

  return other === undefined ? lead.name : `${lead.name} over ${other.name}`;
};

const whoLine = (picture: MomentPicture) => {
  const names = namesOf(picture);

  return names.length === 0
    ? chipsText(picture.pot)
    : `${names} · ${chipsText(picture.pot)}`;
};

class NostakesTonight extends HTMLElement {
  readonly #root: ShadowRoot;
  readonly #summary: HTMLParagraphElement;
  readonly #list: HTMLUListElement;
  #room = "";
  #mode: TonightMode = "Drawer";
  #theme: Theme = "Light";
  #deck: Deck = "TwoColour";
  #night: Night | null = null;
  #unlisten: (() => void) | null = null;
  readonly #rows = new Map<
    number,
    { readonly item: HTMLLIElement; key: string }
  >();
  readonly #thumbs = new Map<number, string>();

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");

    style.textContent = STYLE;

    const head = document.createElement("div");

    head.className = "head";

    const title = document.createElement("h2");

    title.textContent = "Tonight";

    const done = document.createElement("button");

    done.type = "button";
    done.className = "done";
    done.textContent = "Done";
    done.dataset.modalFocus = "";
    done.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("close", { detail: { by: "Done" } }));
    });
    head.append(title, done);

    this.#summary = document.createElement("p");
    this.#summary.className = "summary";
    this.#summary.setAttribute("aria-live", "polite");
    this.#list = document.createElement("ul");

    const keptLine = document.createElement("p");

    keptLine.className = "kept";
    keptLine.textContent = "Kept on this phone for 30 days. Never uploaded.";
    this.#root.append(style, head, this.#summary, this.#list, keptLine);
    adoptEarlyProperties(this, tonightElement.properties);
  }

  connectedCallback() {
    this.#attach();
  }

  disconnectedCallback() {
    this.#unlisten?.();
    this.#unlisten = null;
  }

  get room(): string {
    return this.#room;
  }

  set room(next: string) {
    if (next !== this.#room) {
      this.#room = next;
      this.#unlisten?.();
      this.#unlisten = null;
      this.#rows.clear();
      this.#list.replaceChildren();
      this.#attach();
    }
  }

  get mode(): TonightMode {
    return this.#mode;
  }

  set mode(next: TonightMode) {
    this.#mode = next;
    this.setAttribute("mode", next);
  }

  get theme(): Theme {
    return this.#theme;
  }

  set theme(next: Theme) {
    if (next !== this.#theme) {
      this.#theme = next;
      this.#thumbs.clear();
      this.#render();
    }
  }

  get deck(): Deck {
    return this.#deck;
  }

  set deck(next: Deck) {
    if (next !== this.#deck) {
      this.#deck = next;
      this.#thumbs.clear();
      this.#render();
    }
  }

  #attach() {
    if (
      !this.isConnected ||
      this.#room.length === 0 ||
      this.#unlisten !== null
    ) {
      return;
    }

    const night = nightOf(this.#room);

    this.#night = night;
    this.#unlisten = night.listen(() => {
      this.#render();
    });
  }

  #look(frame: "Chat" | "Story") {
    return { deck: this.#deck, frame, theme: this.#theme };
  }

  #render() {
    const night = this.#night;

    if (night === null) {
      return;
    }

    const { moments } = night;

    this.#summary.textContent = tonightSummary(
      moments.map((moment) => moment.clip.tag)
    );

    for (const moment of moments) {
      night.drawPictures(moment.hand, ["Chat", "Story"], (kind, fonts) =>
        pictureSvg(moment.scene.picture, {
          ...this.#look(kind === "Story" ? "Story" : "Chat"),
          fonts,
        })
      );
    }

    const items = moments.map((moment) => this.#row(night, moment));

    this.#list.replaceChildren(...items);

    if (moments.length === 0) {
      const empty = document.createElement("li");

      empty.className = "empty";
      empty.textContent =
        "No moments yet tonight. When a hand is worth talking about, it lands here.";
      this.#list.replaceChildren(empty);
    }
  }

  #row(night: Night, moment: NightMoment): HTMLLIElement {
    const { picture } = moment.scene;

    const key = JSON.stringify([
      moment.clip.tag,
      moment.clip.tag === "Making" ? Math.floor(moment.clip.made * 100) : 0,
      Object.keys(moment.pictures).toSorted(),
      moment.asked,
      this.#theme,
      this.#deck,
    ]);

    const known = this.#rows.get(moment.hand);

    if (known !== undefined && known.key === key) {
      return known.item;
    }

    const item = known?.item ?? document.createElement("li");

    item.dataset.hand = String(moment.hand);
    item.dataset.clip = moment.clip.tag;
    item.dataset.made = String(
      moment.clip.tag === "Making" ? Math.floor(moment.clip.made * 100) : 0
    );

    const thumb = document.createElement("div");

    thumb.className = "thumb";
    paintThumb(thumb, picture, { ...this.#look("Chat"), ...THUMB_LOOK });

    if (moment.clip.tag === "Ready") {
      const length = document.createElement("span");

      length.className = "length";
      length.textContent = "▶ 0:10";
      thumb.append(length);
    }

    const body = document.createElement("div");
    const tags = document.createElement("div");

    tags.className = "tags";

    if (moment.asked) {
      tags.append(tagOf("asked", "You clipped"));
    } else if (moment.auto) {
      tags.append(tagOf("auto", "Auto"));
    }

    const hand = document.createElement("span");

    hand.textContent = `Hand ${moment.hand}`;
    tags.append(hand);

    const title = document.createElement("p");

    title.className = "title";
    title.textContent = picture.title;

    const who = document.createElement("p");

    who.className = "who";
    who.textContent = whoLine(picture);

    body.append(tags, title, who);

    if (moment.clip.tag === "Making" || moment.clip.tag === "Queued") {
      const making = document.createElement("div");
      const ring = document.createElement("span");
      const words = document.createElement("span");
      const made = moment.clip.tag === "Making" ? moment.clip.made : 0;

      making.className = "making";
      ring.className = "ring";
      ring.style.setProperty("--made", String(made));
      words.textContent =
        moment.clip.tag === "Queued"
          ? "Waiting to make the clip"
          : `Making the clip, ${Math.floor(made * 100)}%`;
      making.append(ring, words);
      body.append(making);
    }

    const buttons = document.createElement("div");

    buttons.className = "buttons";

    const { clip } = moment;

    if (clip.tag === "Ready") {
      buttons.append(
        actOf("Share", "Share clip", true, () => {
          Effect.runFork(offer(clip.file));
        })
      );
    } else if (clip.tag === "Idle") {
      buttons.append(
        actOf("Play", "Clip it", false, () => {
          night.ask(moment.hand);
        })
      );
    } else if (clip.tag === "Failed") {
      buttons.append(
        actOf("Play", "Clip failed. Try again", false, () => {
          night.retry(moment.hand);
        })
      );
    }

    buttons.append(
      pictureButton(moment, "Chat", "Picture"),
      pictureButton(moment, "Story", "Story")
    );

    body.append(buttons);
    item.replaceChildren(thumb, body);
    this.#rows.set(moment.hand, { item, key });

    return item;
  }
}

const pictureButton = (
  moment: NightMoment,
  kind: PictureKind,
  text: string
) => {
  const file = moment.pictures[kind];

  const button = actOf(null, text, false, () => {
    if (file !== undefined) {
      Effect.runFork(offer(file));
    }
  });

  button.dataset.picture = kind;
  button.setAttribute("aria-disabled", String(file === undefined));

  return button;
};

const tagOf = (kind: string, text: string) => {
  const tag = document.createElement("span");

  tag.className = `tag ${kind}`;
  tag.textContent = text;

  return tag;
};

const actOf = (
  icon: "Play" | "Share" | null,
  text: string,
  primary: boolean,
  act: () => void
) => {
  const button = document.createElement("button");

  button.type = "button";
  button.className = primary ? "act primary" : "act";
  paintLabel(button, icon, text);
  button.addEventListener("click", act);

  return button;
};

export const defineTonight = () => {
  if (customElements.get(TONIGHT_TAG) === undefined) {
    customElements.define(TONIGHT_TAG, NostakesTonight);
  }
};
