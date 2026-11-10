import { countingOn, privacySignal, setCounting } from "./counting.js";

import "./tokens.css";
import "./reading.css";

const THEME_KEY = "nostakes.theme";

const chosenTheme = globalThis.localStorage.getItem(THEME_KEY);

if (chosenTheme === "Dark" || chosenTheme === "Light") {
  globalThis.document.documentElement.dataset.theme = chosenTheme.toLowerCase();
}

const switchButton = globalThis.document.querySelector<HTMLButtonElement>(
  "[data-counting-switch]"
);

const switchState = globalThis.document.querySelector("[data-counting-state]");

const privacyNote = globalThis.document.querySelector("[data-privacy-signal]");

const show = () => {
  const on = countingOn();

  switchButton?.setAttribute("aria-pressed", on ? "true" : "false");
  switchButton?.classList.toggle("is-on", on);

  if (switchButton !== null) {
    switchButton.textContent = on ? "Turn counts off" : "Turn counts on";
  }

  if (switchState !== null) {
    switchState.textContent = on
      ? "Counts are on for this device."
      : "Counts are off for this device.";
  }

  privacyNote?.toggleAttribute("hidden", !privacySignal());
};

switchButton?.addEventListener("click", () => {
  setCounting(!countingOn());
  show();
});

show();
