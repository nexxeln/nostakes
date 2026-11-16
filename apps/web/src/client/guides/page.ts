import "../tokens.css";
import "../reading.css";
import "../wordmark.css";
import "./guides.css";

const THEME_KEY = "nostakes.theme";

const storedTheme = () => {
  try {
    return globalThis.localStorage.getItem(THEME_KEY) ?? "";
  } catch {
    return "";
  }
};

const chosenTheme = storedTheme();

if (chosenTheme === "Dark" || chosenTheme === "Light") {
  globalThis.document.documentElement.dataset.theme = chosenTheme.toLowerCase();
}

const examples = [
  ...globalThis.document.querySelectorAll<HTMLElement>("[data-cards]"),
];

if (examples.length > 0) {
  const { paintCardFace } = await import("../table/markup.js");

  for (const example of examples) {
    const faces = (example.dataset.cards ?? "").split(" ").map((card) => {
      const face = globalThis.document.createElement("span");

      face.className = "face";
      paintCardFace(face, card);

      return face;
    });

    example.setAttribute("role", "img");
    example.setAttribute(
      "aria-label",
      example.textContent.replaceAll(/\s+/gu, " ").trim()
    );
    example.replaceChildren(...faces);
    example.classList.add("drawn");
  }
}
