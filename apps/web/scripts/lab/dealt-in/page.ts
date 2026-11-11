import { randomAvatar, render } from "@nostakes/avatar";
import type { Avatar, Theme } from "@nostakes/avatar";
import { Clock, Effect, Fiber, Random } from "effect";

import "./page.css";
import { faceLine, FRIENDS } from "./cast.js";
import type { FriendId } from "./cast.js";
import { openControls } from "./controls.js";
import type { DrawnMoment } from "./ending.js";
import { aces, sevenDeuce } from "./hands.js";
import type { Ending, Table } from "./hands.js";
import { chipsText } from "./markup.js";
import { need, openPace, openStage } from "./stage.js";

const PROFILE_KEY = "nostakes.profile";

const HANDS_KEY = "nostakes.lab.dealt-in.hands";

const HOME = "/";

const INTRO_WAIT_MS = 5200;

const DOOR_WAIT_MS = 900;

const SEED_SPAN = 2_000_000_000;

const HERO_MS = 3600;

const SLIP_MS = 1500;

const HANDS = [sevenDeuce, aces] as const;

const EASE_BACK = "cubic-bezier(0.3, 1.35, 0.5, 1)";

const root = document.documentElement;

const scene = need(document, ".scene");

const stepHint = need(scene, ".step");

const finale = need(scene, ".finale");

const pictureFrame = need(finale, ".picture");

const native = need(pictureFrame, ".native");

const receipt = need(finale, ".receipt");

const capLine = need(scene, ".cap .line");

const still = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

const darkSystem = globalThis.matchMedia("(prefers-color-scheme: dark)");

const themeNow = (): Theme => {
  const chosen = root.dataset.theme;

  if (chosen === "dark") {
    return "Dark";
  }

  return chosen !== "light" && darkSystem.matches ? "Dark" : "Light";
};

const stored = (key: string) => {
  try {
    return globalThis.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const store = (key: string, value: string) => {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    scene.dataset.storage = "off";
  }
};

const endingChunk = Effect.runSync(
  Effect.cached(Effect.promise(() => import("./ending.js")))
);

const whenIdle = Effect.callback<"Idle">((resume) => {
  const done = () => {
    resume(Effect.succeed("Idle"));
  };

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(done, { timeout: 2000 });
  } else {
    requestAnimationFrame(done);
  }
});

const pace = openPace(still, (open) => {
  stepHint.classList.toggle("on", open);
});

const stage = openStage(scene, pace);

interface Progress {
  drawn: DrawnMoment | undefined;
  faces: number;
  introDue: number;
  peeked: boolean;
  played: number;
  playing: boolean;
}

const progress: Progress = {
  drawn: undefined,
  faces: 0,
  introDue: 0,
  peeked: false,
  played: Number(stored(HANDS_KEY)) || 0,
  playing: true,
};

const controls = openControls(stage, (looking) => {
  if (looking && !progress.peeked) {
    progress.peeked = true;
    stage.speak("kit", "We can all see you peeking.", 2200);
  }
});

const freshAvatar = Random.nextIntBetween(1, SEED_SPAN).pipe(
  Effect.map(randomAvatar)
);

const profileAvatar = Effect.gen(function* readProfileFace() {
  const code = /"avatar":"(?<code>h1[0-9a-z]{11})"/u.exec(stored(PROFILE_KEY))
    ?.groups?.code;

  if (code === undefined) {
    return yield* freshAvatar;
  }

  const { avatarOf } = yield* endingChunk;

  return avatarOf(code) ?? (yield* freshAvatar);
});

const showFace = (avatar: Avatar) => {
  stage.model.avatar = avatar;
  stage.model.expression = "Resting";
  stage.paintMe(true);
  stage.me.classList.add("fresh");
  capLine.textContent = faceLine(avatar);
};

const REDEAL_LINES = new Map<number, readonly [FriendId, string]>([
  [3, ["jonas", "Pick a face."]],
  [7, ["priya", "They're all good. Sit down."]],
]);

const dealAnotherFace = Effect.gen(function* dealAnother() {
  if (!scene.classList.contains("intro")) {
    return;
  }

  progress.faces += 1;
  progress.introDue = (yield* Clock.currentTimeMillis) + INTRO_WAIT_MS;
  showFace(yield* freshAvatar);

  if (!still) {
    stage.me.animate(
      [
        {
          opacity: 0,
          transform: "translate(0, -46%) rotate(9deg) scale(0.5)",
        },
        { offset: 0.3, opacity: 1 },
        { opacity: 1, transform: "none" },
      ],
      { duration: 380, easing: EASE_BACK }
    );
  }

  const line = REDEAL_LINES.get(progress.faces);

  if (line !== undefined) {
    stage.speak(line[0], line[1], 2000);
  }
});

const introIdle: Effect.Effect<void> = Effect.gen(function* waitForIdle() {
  const left = progress.introDue - (yield* Clock.currentTimeMillis);

  if (left > 0) {
    yield* pace.wait(Math.max(left, 1000));
    yield* introIdle;
  }
});

const sitDown = () => {
  scene.classList.remove("intro");
  stage.me.classList.remove("fresh");
  controls.idle();
};

const fitPicture = () => {
  native.style.transform = `scale(${pictureFrame.clientWidth / 1080})`;
};

const gutted = (avatar: Avatar) =>
  render(avatar, { expression: "Gutted", size: 96, theme: themeNow() });

const receiptMarkup = (ending: Ending) => {
  const owed = ending.transfers.filter(({ amount }) => amount > 0);
  const total = owed.reduce((sum, { amount }) => sum + amount, 0);
  const [first, ...rest] = owed;

  return [
    "<h3>Settle up</h3>",
    first === undefined
      ? ""
      : `<div class="first"><span class="who">${gutted(FRIENDS[first.from].avatar)}</span><span class="what"><b>${FRIENDS[first.from].name}</b> pays you</span><span class="sum">${chipsText(first.amount)}</span></div>`,
    rest.length === 0
      ? ""
      : `<p class="rest">${rest.map(({ amount, from }) => `<span>${FRIENDS[from].name} <b>${chipsText(amount)}</b></span>`).join("")}</p>`,
    `<p class="foot">You are up ${chipsText(total)}. One hand in.</p>`,
  ].join("");
};

const cardTapped = Effect.callback<"Tapped">((resume) => {
  pictureFrame.addEventListener(
    "click",
    () => {
      resume(Effect.succeed("Tapped"));
    },
    { once: true }
  );
});

const showEnding = (ending: Ending) =>
  Effect.gen(function* drawTheEnding() {
    const { drawMoment } = yield* endingChunk;

    const drawn = drawMoment(native, ending, {
      mine: stage.model.avatar,
      still,
      theme: themeNow(),
    });

    progress.drawn = drawn;
    fitPicture();
    receipt.innerHTML = receiptMarkup(ending);
    stage.hushAll();
    controls.chip.classList.add("gone");
    finale.classList.add("on");
    drawn.play();
    yield* still
      ? pace.wait(HERO_MS)
      : Effect.raceFirst(pace.wait(HERO_MS), cardTapped);
    finale.classList.add("told");
    yield* pace.wait(SLIP_MS);
    finale.classList.add("ready");
    drawn.keeper.prepare(["Chat"]);
  });

const carryFace = Effect.gen(function* writeProfileFace() {
  const { codeOf } = yield* endingChunk;

  const name =
    /"name":"(?<name>(?:[^"\\]|\\.)*)"/u.exec(stored(PROFILE_KEY))?.groups
      ?.name ?? "";

  store(
    PROFILE_KEY,
    `{"avatar":"${codeOf(stage.model.avatar)}","name":"${name}"}`
  );
});

const openDoor = Effect.race(carryFace, Effect.sleep(DOOR_WAIT_MS)).pipe(
  Effect.andThen(
    Effect.sync(() => {
      globalThis.location.assign(HOME);
    })
  )
);

const finish = (ending: Ending) =>
  Effect.gen(function* finishTheHand() {
    progress.played += 1;
    store(HANDS_KEY, String(progress.played));
    scene.classList.add("done");
    controls.tell("");
    yield* stage.pace.wait(1200);
    yield* showEnding(ending);
    progress.playing = false;
  });

const play = (firstHand: boolean): Effect.Effect<Ending> =>
  Effect.gen(function* playHands() {
    const table: Table = { controls, firstHand, stage };
    const hand = HANDS[progress.played % HANDS.length] ?? sevenDeuce;
    const outcome = yield* hand(table);

    if (outcome !== "Folded") {
      return outcome;
    }

    progress.played += 1;
    stage.reset();

    return yield* play(false);
  });

const greet = Effect.gen(function* greetTheVisitor() {
  yield* pace.wait(700);
  stage.speak("mara", "Poker night. You in?", 4200, true);
  yield* Effect.forkDetach(whenIdle.pipe(Effect.andThen(endingChunk)));
  yield* pace.wait(800);
  stage.express("bo", "Happy");
  yield* pace.wait(1100);
  stage.express("jonas", "Thinking");
  yield* pace.wait(1300);
  stage.express("jonas", "Resting");
});

const begin = Effect.gen(function* beginTheNight() {
  stage.model.theme = themeNow();
  stage.reset();
  stage.paintTalk(document);
  scene.classList.toggle("stepping", still);
  showFace(yield* profileAvatar);
  stage.me.getBoundingClientRect();
  stage.me.classList.remove("down");
  progress.introDue = (yield* Clock.currentTimeMillis) + INTRO_WAIT_MS;
  const greeting = yield* Effect.forkChild(greet);

  yield* Effect.raceFirst(controls.tapped("Deal", "me in"), introIdle);
  yield* Fiber.interrupt(greeting);
  stage.hush("mara");
  stage.express("bo", "Resting");
  stage.express("jonas", "Resting");
  sitDown();
  yield* stage.say("mara", "Room for nine. You make six.", 2000);
  yield* finish(yield* play(true));
});

const again = Effect.gen(function* dealAnotherHand() {
  if (progress.playing) {
    return;
  }

  progress.playing = true;
  globalThis.scrollTo({ behavior: still ? "auto" : "smooth", top: 0 });
  finale.classList.remove("on", "told", "ready");
  stage.reset();
  controls.idle();
  controls.chip.classList.remove("gone");
  yield* pace.wait(900);
  yield* finish(yield* play(false));
});

need(stage.me, ".flipper").addEventListener("click", () => {
  Effect.runFork(dealAnotherFace);
});

scene.addEventListener("click", (event) => {
  const tapped = event.target instanceof Element ? event.target : scene;

  if (
    still &&
    tapped.closest(".chipctl, .hand, .flipper, .button, .link") === null
  ) {
    stage.hushAll();
    pace.next();
  }
});

for (const door of document.querySelectorAll("[data-door]")) {
  door.addEventListener("click", (event) => {
    event.preventDefault();
    Effect.runFork(openDoor);
  });
}

for (const keep of document.querySelectorAll<HTMLElement>("[data-keep]")) {
  keep.addEventListener("click", () => {
    progress.drawn?.keeper.keep(
      keep.dataset.keep === "Story" ? "Story" : "Chat"
    );
  });
}

need(document, "[data-again]").addEventListener("click", () => {
  Effect.runFork(again);
});

new ResizeObserver(fitPicture).observe(pictureFrame);

darkSystem.addEventListener("change", () => {
  stage.model.theme = themeNow();
  stage.paintAll();
  stage.paintTalk(document);
});

Effect.runFork(begin);
