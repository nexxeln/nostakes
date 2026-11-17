import { REACTIONS } from "@nostakes/room";
import type { Reaction } from "@nostakes/room";

import {
  laid,
  mastered,
  stereoOf,
} from "../../src/features/moments/sound/dsp.js";
import { GAG_SOUNDS, whoosh } from "../../src/features/table/gag-sounds.js";
import type { TableSnapshot } from "../../src/features/table/snapshot.js";
import { wavOf } from "../launch/score.ts";

interface Scripted {
  readonly atMs: number;
  readonly from: number;
  readonly at: number;
  readonly reaction: Reaction;
}

interface Cue {
  readonly atMs: number;
  readonly sound: "Whoosh" | "Hit";
  readonly ms: number;
  readonly reaction: Reaction;
  readonly pan: number;
}

const isReaction = (text: string | undefined): text is Reaction =>
  REACTIONS.some((reaction) => reaction === text);

const NINE: readonly (readonly [number, number, Reaction])[] = [
  [0, 1, "Clap"],
  [3, 2, "Laugh"],
  [0, 4, "Wow"],
  [2, 0, "Cry"],
  [5, 3, "Fire"],
  [1, 5, "Dead"],
  [0, 2, "Fish"],
  [4, 1, "Eyes"],
  [3, 0, "Bird"],
];

const SCRIPTS = {
  nine: {
    lengthMs: 11_600,
    throws: NINE.map(([from, at, reaction], index) => ({
      at,
      atMs: 400 + index * 1150,
      from,
      reaction,
    })),
  },
  pileup: {
    lengthMs: 5600,
    throws: [
      { at: 3, atMs: 400, from: 0, reaction: "Fish" },
      { at: 4, atMs: 400, from: 2, reaction: "Fire" },
      { at: 1, atMs: 400, from: 5, reaction: "Laugh" },
      { at: 3, atMs: 2600, from: 0, reaction: "Dead" },
      { at: 3, atMs: 2600, from: 1, reaction: "Clap" },
      { at: 3, atMs: 2600, from: 5, reaction: "Eyes" },
    ],
  },
  you: {
    lengthMs: 9600,
    throws: REACTIONS.map((reaction, index) => ({
      at: 0,
      atMs: 300 + index * 1000,
      from: 1 + (index % 5),
      reaction,
    })),
  },
} satisfies Record<
  string,
  { readonly lengthMs: number; readonly throws: readonly Scripted[] }
>;

type ScriptName = keyof typeof SCRIPTS;

const LIVE_WARM_UP_MS = 2000;

const isScript = (text: string | null): text is ScriptName =>
  text === "nine" || text === "pileup" || text === "you";

const seekAnimations = (
  born: WeakMap<Animation, { at: number; base: number }>,
  root: ShadowRoot | null
) => {
  const now = performance.now();

  for (const animation of [
    ...document.getAnimations(),
    ...(root?.getAnimations() ?? []),
  ]) {
    let seen = born.get(animation);

    if (seen === undefined) {
      const base = Number(animation.currentTime ?? 0);

      seen = { at: now, base: Number.isFinite(base) ? base : 0 };
      born.set(animation, seen);
    }

    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
    const want = seen.base + (now - seen.at);

    if (Number.isFinite(end) && end > 0 && want >= end) {
      if (animation.playState !== "finished") {
        animation.finish();
      }
    } else {
      if (animation.playState !== "paused") {
        animation.pause();
      }

      animation.currentTime = want;
    }
  }
};

const base64Of = (bytes: Uint8Array) => {
  const chunks: string[] = [];

  for (let at = 0; at < bytes.length; at += 0x80_00) {
    chunks.push(String.fromCodePoint(...bytes.subarray(at, at + 0x80_00)));
  }

  return btoa(chunks.join(""));
};

interface TableHost extends HTMLElement {
  snapshot: TableSnapshot | null;
}

declare global {
  interface Window {
    throwFrames?: readonly number[];
    throwDemo?: {
      readonly at: (ms: number) => void;
      readonly wav: () => string;
      readonly lengthMs: number;
    };
  }
}

export const stageThrows = (
  table: TableHost,
  snapshot: TableSnapshot,
  params: URLSearchParams
) => {
  const named = params.get("script");

  const { lengthMs, throws: script } =
    SCRIPTS[isScript(named) ? named : "nine"];

  const born = new WeakMap<Animation, { at: number; base: number }>();
  const cues: Cue[] = [];
  const started = new Map<Element, number>();
  const sent = new Set<number>();
  let startedAt = Number.NaN;
  const width = table.getBoundingClientRect().width || 1;

  const calm: TableSnapshot = {
    ...snapshot,
    clock: null,
    legal: null,
    reactions: [],
    toAct: null,
  };

  table.snapshot = calm;

  const watch = new MutationObserver((records) => {
    const now = performance.now() - startedAt;

    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains("thrown")) {
          started.set(node, now);
        }
      }

      for (const node of record.removedNodes) {
        const from =
          node instanceof HTMLElement ? started.get(node) : undefined;

        if (from !== undefined && node instanceof HTMLElement) {
          const reaction = node.dataset.reaction ?? "";
          const pan = (node.getBoundingClientRect().left / width) * 2 - 1;

          if (isReaction(reaction)) {
            cues.push(
              { atMs: from, ms: now - from, pan: 0, reaction, sound: "Whoosh" },
              { atMs: now, ms: 0, pan, reaction, sound: "Hit" }
            );
          }
        }
      }
    }
  });

  const fx = table.shadowRoot?.querySelector(".fx");

  if (fx !== null && fx !== undefined) {
    watch.observe(fx, { childList: true });
  }

  const deliver = (ms: number) => {
    const due = script.flatMap((each, index) =>
      each.atMs <= ms && !sent.has(index) ? [index] : []
    );

    if (due.length === 0) {
      return;
    }

    for (const index of due) {
      sent.add(index);
    }

    table.snapshot = {
      ...calm,
      reactions: [...sent].map((index) => {
        const each = script[index];

        return {
          id: index + 1,
          reaction: each?.reaction ?? "Clap",
          seat: each?.from ?? 0,
          target: each?.at ?? 1,
        };
      }),
    };
  };

  if (params.get("live") === "1") {
    const frames: number[] = [];
    let first = Number.NaN;
    let last = Number.NaN;

    const mounted = performance.now();

    const tick = (now: number) => {
      if (now - mounted < LIVE_WARM_UP_MS) {
        requestAnimationFrame(tick);

        return;
      }

      if (Number.isNaN(first)) {
        first = now;
      } else {
        frames.push(now - last, now - first);
      }

      last = now;
      deliver(now - first);

      if (now - first < lengthMs) {
        requestAnimationFrame(tick);
      } else {
        window.throwFrames = frames;
      }
    };

    requestAnimationFrame(tick);
  }

  window.throwDemo = {
    at: (ms) => {
      if (Number.isNaN(startedAt)) {
        startedAt = performance.now() - ms;
      }

      deliver(ms);
      seekAnimations(born, table.shadowRoot);
    },
    lengthMs,
    wav: () => {
      const mix = stereoOf(lengthMs / 1000);

      for (const cue of cues) {
        const sound =
          cue.sound === "Whoosh"
            ? whoosh(cue.ms / 1000)
            : GAG_SOUNDS[cue.reaction]();

        laid(mix, sound, { at: cue.atMs / 1000, gain: 1, pan: cue.pan * 0.6 });
      }

      return base64Of(wavOf(mastered(mix, { ceiling: -1.5, loudness: -16 })));
    },
  };
};
