const FILM_MS = 100_000;

const FILM_LENGTH = 1000;

const TRAVEL_MS = 620;

const RELEASES = ["pointerup", "pointercancel", "pointerleave", "blur"];

const numbersIn = (text: string) =>
  text
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value));

const holdToPeek = (stage: HTMLElement) => {
  const card = stage.querySelector<HTMLElement>(".peek");

  if (card === null) {
    return;
  }

  const look = () => {
    stage.classList.add("peeking", "peeked");
  };

  const release = () => {
    stage.classList.remove("peeking");
  };

  card.addEventListener("pointerdown", look);

  for (const name of RELEASES) {
    card.addEventListener(name, release);
  }

  card.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      look();
    }
  });
  card.addEventListener("keyup", release);
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
};

const pokeFaces = (stage: HTMLElement) => {
  for (const who of stage.querySelectorAll<HTMLElement>(".who")) {
    who.addEventListener("click", () => {
      who.classList.add("poked");
    });
    who.addEventListener("animationend", (event) => {
      if (event.animationName === "hop") {
        who.classList.remove("poked");
      }
    });
  }
};

const filmAnimations = (stage: HTMLElement) =>
  stage
    .getAnimations({ subtree: true })
    .filter(
      (animation) => animation.effect?.getComputedTiming().duration === FILM_MS
    );

const stepThrough = (
  film: HTMLElement,
  stage: HTMLElement,
  beats: readonly number[]
) => {
  const animations = filmAnimations(stage);
  const flights: Animation[] = [];

  const settle = (target: number) => {
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = target;
    }
  };

  const seek = (beat: number) => {
    const target = (beat / FILM_LENGTH) * FILM_MS;
    const now = Number(animations.at(0)?.currentTime ?? 0);
    const rate = (target - now) / TRAVEL_MS;

    flights.pop()?.cancel();

    if (rate === 0) {
      return;
    }

    for (const animation of animations) {
      animation.playbackRate = rate;
      animation.play();
    }

    const driver = stage.animate([], { duration: TRAVEL_MS });

    flights.push(driver);
    driver.addEventListener("finish", () => {
      settle(target);
    });
  };

  const beatOf = new Map<Element, number>();

  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const beat = beatOf.get(entry.target);

        if (entry.isIntersecting && beat !== undefined) {
          seek(beat);
        }
      }
    },
    { rootMargin: "0px 0px -100% 0px" }
  );

  for (const [index, beat] of beats.entries()) {
    const before = beats[index - 1] ?? beat;
    const after = beats[index + 1] ?? beat;
    const from = (before + beat) / 2 / FILM_LENGTH;
    const to = (beat + after) / 2 / FILM_LENGTH;
    const mark = document.createElement("i");

    mark.className = "mark";
    mark.style.top = `calc((100% - 100svh) * ${from})`;
    mark.style.height = `calc((100% - 100svh) * ${to - from} + 1px)`;
    film.append(mark);
    beatOf.set(mark, beat);
    watch.observe(mark);
  }
};

const storyboard = (
  film: HTMLElement,
  stage: HTMLElement,
  stills: readonly number[]
) => {
  const board = document.createElement("div");

  board.className = "reel";

  for (const at of stills) {
    const copy = stage.cloneNode(true);

    if (copy instanceof HTMLElement) {
      copy.removeAttribute("id");
      copy.classList.add("still");
      copy.style.setProperty("--at", String(at));
      board.append(copy);
    }
  }

  stage.remove();
  film.append(board);
  document.documentElement.classList.add("stills");
};

const start = () => {
  const film = document.querySelector<HTMLElement>("#film");
  const stage = document.querySelector<HTMLElement>("#stage");

  if (film === null || stage === null) {
    return;
  }

  const asked = new URLSearchParams(globalThis.location.search);
  const at = asked.get("at");

  if (at !== null) {
    stage.classList.add("still");
    stage.style.setProperty("--at", at);

    return;
  }

  if (
    asked.has("stills") ||
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    storyboard(film, stage, numbersIn(film.dataset.stills ?? ""));

    return;
  }

  holdToPeek(stage);
  pokeFaces(stage);

  if (asked.has("steps") || !CSS.supports("animation-timeline: scroll()")) {
    document.documentElement.classList.add("stepped");
    stepThrough(film, stage, numbersIn(film.dataset.beats ?? ""));
  }
};

start();
