import { Effect, Fiber, Schema } from "effect";

import type { LandingPicture } from "../../features/landing/elements.js";
import type { Theme } from "../../features/model.js";
import { indexOf, roleOf, topParts } from "../moments/clip-measure.js";
import { paintDrawn } from "./markup.js";
import { CARD_PART, PictureReplySchema } from "./picture-wire.js";
import type { MotionPlan, PictureReply } from "./picture-wire.js";

const SVG = "http://www.w3.org/2000/svg";

const NATIVE_WIDTH = 1080;

const LAYER_PAD = 6;

const SHOWN_AT = 0.35;

const STILL = "(prefers-reduced-motion: reduce)";

const RANGES: Readonly<Record<LandingPicture, readonly [string, string]>> = {
  Moment: ["entry 25%", "cover 42%"],
  SettleUp: ["entry 25%", "cover 40%"],
};

interface Staged {
  readonly card: HTMLElement;
  readonly host: HTMLElement;
  readonly native: HTMLElement;
  readonly picture: LandingPicture;
  readonly theme: Theme;
}

interface Motion {
  readonly element: Element;
  readonly keyframes: Keyframe[];
  readonly length: number;
}

const offsetOf = (part: Element, root: Element) => {
  let x = 0;
  let y = 0;

  for (
    let node = part.parentElement;
    node !== null && node !== root;
    node = node.parentElement
  ) {
    if (node instanceof SVGGraphicsElement) {
      const matrix = node.transform.baseVal.consolidate()?.matrix;

      x += matrix?.e ?? 0;
      y += matrix?.f ?? 0;
    }
  }

  return { x, y };
};

const lifted = (part: SVGGraphicsElement, root: SVGSVGElement) => {
  const box = part.getBBox();
  const at = offsetOf(part, root);
  const x = box.x + at.x - LAYER_PAD;
  const y = box.y + at.y - LAYER_PAD;
  const width = box.width + LAYER_PAD * 2;
  const height = box.height + LAYER_PAD * 2;
  const layer = document.createElementNS(SVG, "svg");
  const shift = document.createElementNS(SVG, "g");

  layer.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  layer.setAttribute("width", String(width));
  layer.setAttribute("height", String(height));
  Object.assign(layer.style, {
    left: `${x}px`,
    top: `${y}px`,
    transformOrigin: "center",
  });

  if (at.x !== 0 || at.y !== 0) {
    shift.setAttribute("transform", `translate(${at.x} ${at.y})`);
  }

  root.after(layer);
  shift.append(part);
  layer.append(shift);

  return layer;
};

const placed = (
  staged: Staged,
  plans: readonly MotionPlan[]
): readonly Motion[] => {
  const root = staged.native.querySelector("svg");
  const byPart = new Map(plans.map((plan) => [plan.part, plan]));

  const card = byPart.get(CARD_PART);

  const parts =
    root === null
      ? []
      : topParts(root)
          .toReversed()
          .flatMap((part) => {
            const plan = byPart.get(`${roleOf(part)}:${indexOf(part)}`);

            return plan === undefined
              ? []
              : [{ element: lifted(part, root), plan }];
          })
          .toReversed();

  return [
    ...(card === undefined ? [] : [{ element: staged.card, plan: card }]),
    ...parts,
  ].map(({ element, plan }) => ({
    element,
    keyframes: plan.keyframes.map((frame) => ({ ...frame })),
    length: plan.length,
  }));
};

const onScroll = (staged: Staged, motions: readonly Motion[]) => {
  const timeline = new ViewTimeline({ axis: "block", subject: staged.host });
  const [rangeStart, rangeEnd] = RANGES[staged.picture];

  const running = motions.map(({ element, keyframes }) =>
    element.animate(keyframes, {
      easing: "linear",
      fill: "both",
      rangeEnd,
      rangeStart,
      timeline,
    })
  );

  return () => {
    for (const animation of running) {
      animation.cancel();
    }
  };
};

const onceShown = (staged: Staged, motions: readonly Motion[]) => {
  const waiting = motions.map(({ element, keyframes, length }) => {
    const animation = element.animate(keyframes, {
      duration: length,
      easing: "linear",
      fill: "both",
    });

    animation.pause();

    return animation;
  });

  const shown = new IntersectionObserver(
    (entries) => {
      if (
        entries.some(({ intersectionRatio }) => intersectionRatio >= SHOWN_AT)
      ) {
        shown.disconnect();

        for (const animation of waiting) {
          animation.play();
        }
      }
    },
    { threshold: [SHOWN_AT] }
  );

  shown.observe(staged.host);

  return () => {
    shown.disconnect();

    for (const animation of waiting) {
      animation.cancel();
    }
  };
};

const requestOf = (staged: Staged) => ({
  picture: staged.picture,
  scale: staged.host.clientWidth / NATIVE_WIDTH,
  theme: staged.theme,
});

const askWorker = (staged: Staged) =>
  Effect.acquireRelease(
    Effect.try(
      () =>
        new Worker(new URL("picture-worker.ts", import.meta.url), {
          name: "nostakes-landing-picture",
          type: "module",
        })
    ),
    (worker) =>
      Effect.sync(() => {
        worker.terminate();
      })
  ).pipe(
    Effect.flatMap((worker) =>
      Effect.callback<unknown, string>((resume) => {
        worker.addEventListener("message", (event) => {
          resume(Effect.succeed(event.data));
        });
        worker.addEventListener("error", (event) => {
          resume(Effect.fail(event.message));
        });
        worker.postMessage(requestOf(staged), { transfer: [] });
      })
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(PictureReplySchema)),
    Effect.scoped
  );

const drawHere = (staged: Staged) =>
  Effect.promise(() => import("./picture-draw.js")).pipe(
    Effect.map(({ drawPicture }) => drawPicture(requestOf(staged)))
  );

const LONG_IDLE_MS = 24;

const CLOSE = "60% 0px 60% 0px";

interface Hurry {
  now: boolean;
}

const idleSlot = (hurry: Hurry) =>
  Effect.callback<"Idle">((resume) => {
    if (!("requestIdleCallback" in globalThis)) {
      requestAnimationFrame(() => {
        resume(Effect.succeed("Idle"));
      });

      return;
    }

    const ask = () => {
      globalThis.requestIdleCallback((deadline) => {
        if (hurry.now || deadline.timeRemaining() >= LONG_IDLE_MS) {
          resume(Effect.succeed("Idle"));
        } else {
          ask();
        }
      });
    };

    ask();
  });

const set = (staged: Staged, reply: PictureReply, hurry: Hurry) =>
  Effect.gen(function* setPicture() {
    const still = globalThis.matchMedia(STILL).matches;
    const parsed = document.createElement("div");

    yield* idleSlot(hurry);
    paintDrawn(parsed, reply.drawn);
    yield* idleSlot(hurry);
    staged.card.style.visibility = still ? "visible" : "hidden";
    staged.native.style.contentVisibility = "hidden";
    staged.native.replaceChildren(...parsed.childNodes);
    yield* idleSlot(hurry);
    staged.native.style.contentVisibility = "visible";

    if (still) {
      return null;
    }

    const motions = placed(staged, reply.motions);

    const stop =
      "ViewTimeline" in globalThis
        ? onScroll(staged, motions)
        : onceShown(staged, motions);

    staged.card.style.visibility = "visible";

    return stop;
  });

export const stagePicture = (staged: Staged): (() => void) => {
  const stops: (() => void)[] = [];
  const hurry: Hurry = { now: false };

  const close = new IntersectionObserver(
    (entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        hurry.now = true;
        close.disconnect();
      }
    },
    { rootMargin: CLOSE }
  );

  close.observe(staged.host);

  const fiber = Effect.runFork(
    askWorker(staged).pipe(
      Effect.matchEffect({
        onFailure: () => drawHere(staged),
        onSuccess: Effect.succeed,
      }),
      Effect.flatMap((reply) => set(staged, reply, hurry)),
      Effect.tap((stop) =>
        Effect.sync(() => {
          if (stop !== null) {
            stops.push(stop);
          }
        })
      )
    )
  );

  return () => {
    close.disconnect();
    Effect.runFork(Fiber.interrupt(fiber));

    for (const stop of stops) {
      stop();
    }
  };
};
