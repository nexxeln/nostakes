import { RANKING } from "../../features/learn/guide.js";
import { paintCardFace } from "../table/markup.js";
import { button, el } from "./dom.js";

const smallCard = (card: string) => {
  const made = el("div", "card up");
  const face = el("div", "face");

  paintCardFace(face, card);
  made.append(face);

  return made;
};

export const drawExamples = (root: ParentNode) => {
  for (const example of root.querySelectorAll<HTMLElement>("[data-cards]")) {
    const cards = (example.dataset.cards ?? "").split(" ");

    example.setAttribute("aria-label", example.textContent);
    example.replaceChildren(...cards.map(smallCard));
    example.classList.remove("eg");
  }
};

export const openRanks = (root: HTMLElement) => {
  const sheet = document.createElement("dialog");
  const header = el("header", "");
  const close = button("pill", "Close");
  const list = el("ol", "");

  sheet.className = "ranks";
  sheet.setAttribute("aria-label", "What beats what");
  header.append(el("h2", "", "What beats what"), close);

  for (const ranked of RANKING) {
    const row = el("li", "rank");
    const cards = el("span", "cards");
    const words = el("span", "");

    cards.append(...ranked.cards.map(smallCard));
    words.append(el("b", "", ranked.name), el("span", "", ranked.means));
    row.append(cards, words);
    list.append(row);
  }

  sheet.append(header, el("p", "note", "Best first."), list);
  root.append(sheet);
  close.addEventListener("click", () => {
    sheet.close();
  });
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) {
      sheet.close();
    }
  });

  return {
    open: () => {
      if (!sheet.open) {
        sheet.showModal();
      }
    },
  };
};
