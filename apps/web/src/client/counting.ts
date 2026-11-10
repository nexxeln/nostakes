import { Effect, Option } from "effect";

export const COUNTING_KEY = "nostakes.counting";

export const DEVICE_KEY = "nostakes.device";

export const DEVICE_HEADER = "x-nostakes-device";

const ON = "on";

const OFF = "off";

const DEVICE_BYTES = 16;

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/u;

export const privacySignal = () =>
  "globalPrivacyControl" in globalThis.navigator &&
  globalThis.navigator.globalPrivacyControl === true;

export const countingChosen = () =>
  Option.fromNullishOr(globalThis.localStorage.getItem(COUNTING_KEY));

export const countingOn = () =>
  Option.match(countingChosen(), {
    onNone: () => !privacySignal(),
    onSome: (chosen) => chosen === ON,
  });

export const readCounting = Effect.sync(countingOn);

export const setCounting = (on: boolean) => {
  globalThis.localStorage.setItem(COUNTING_KEY, on ? ON : OFF);

  if (!on) {
    globalThis.localStorage.removeItem(DEVICE_KEY);
  }
};

export const storeCounting = (on: boolean) =>
  Effect.sync(() => {
    setCounting(on);
  });

const freshDeviceId = () =>
  btoa(
    String.fromCodePoint(
      ...globalThis.crypto.getRandomValues(new Uint8Array(DEVICE_BYTES))
    )
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const deviceId = () => {
  const kept = globalThis.localStorage.getItem(DEVICE_KEY);

  if (kept !== null && DEVICE_ID.test(kept)) {
    return kept;
  }

  const made = freshDeviceId();

  globalThis.localStorage.setItem(DEVICE_KEY, made);

  return made;
};

export const deviceHeaders = Effect.sync((): Readonly<Record<string, string>> =>
  countingOn() ? { [DEVICE_HEADER]: deviceId() } : {}
);
