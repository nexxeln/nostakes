import { Effect } from "effect";

import { VOICE_TAP_ATTRIBUTE } from "../../features/voice.js";

export const SPEAKERS = 19;

const HOLDER_ID = "voice-speakers";

const PRIMED = "data-primed";

const TAKEN = "data-taken";

const existingHolder = () => document.querySelector(`#${HOLDER_ID}`);

const holder = () => {
  const found = existingHolder();

  if (found !== null) {
    return found;
  }

  const made = document.createElement("div");

  made.id = HOLDER_ID;
  made.hidden = true;
  document.body.append(made);

  return made;
};

const speakersIn = (box: Element) => [...box.querySelectorAll("audio")];

const started = (audio: HTMLAudioElement) => {
  const playing = audio.play();

  Effect.runFork(Effect.tryPromise(() => playing).pipe(Effect.ignore));
};

export const speakerBlocked = (audio: HTMLAudioElement) =>
  audio.hasAttribute(TAKEN) && audio.srcObject !== null && audio.paused;

const newSpeaker = (box: Element) => {
  const audio = document.createElement("audio");

  audio.autoplay = true;
  box.append(audio);

  return audio;
};

export const primeSpeakers = () => {
  const box = holder();

  for (let made = speakersIn(box).length; made < SPEAKERS; made += 1) {
    newSpeaker(box);
  }

  for (const audio of speakersIn(box)) {
    if (!audio.hasAttribute(PRIMED) || speakerBlocked(audio)) {
      audio.setAttribute(PRIMED, "");
      started(audio);
    }
  }
};

export const wakeSpeakers = () => {
  const box = existingHolder();

  if (box !== null) {
    for (const audio of speakersIn(box).filter(speakerBlocked)) {
      started(audio);
    }
  }
};

export const playOnSpeaker = (track: MediaStreamTrack) => {
  const box = holder();

  const audio =
    speakersIn(box).find((free) => !free.hasAttribute(TAKEN)) ??
    newSpeaker(box);

  audio.setAttribute(TAKEN, "");
  audio.srcObject = new MediaStream([track]);
  started(audio);

  return audio;
};

export const releaseSpeaker = (audio: HTMLAudioElement) => {
  audio.pause();
  audio.srcObject = null;
  audio.removeAttribute(TAKEN);
};

const isVoiceTap = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest(`[data-${VOICE_TAP_ATTRIBUTE}]`) !== null;

const heard = (event: Event) => {
  if (isVoiceTap(event)) {
    primeSpeakers();
  } else {
    wakeSpeakers();
  }
};

export const watchVoiceTaps = () => {
  for (const kind of ["click", "keydown", "touchend"] as const) {
    document.addEventListener(kind, heard, { capture: true, passive: true });
  }
};
