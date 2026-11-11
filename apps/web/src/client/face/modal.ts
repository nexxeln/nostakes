import { MODAL_TAG, modalElement } from "../../features/face/stage.js";
import type { ModalCancel } from "../../features/face/stage.js";
import { adoptEarlyProperties } from "../early-properties.js";

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE"]);

const besides = (inside: Element): readonly HTMLElement[] => {
  const parent = inside.parentElement;

  if (parent === null || inside === document.body) {
    return [];
  }

  return [
    ...[...parent.children].flatMap((sibling) =>
      sibling instanceof HTMLElement &&
      sibling !== inside &&
      !SKIPPED_TAGS.has(sibling.tagName)
        ? [sibling]
        : []
    ),
    ...besides(parent),
  ];
};

class NostakesModal extends HTMLElement {
  #focused: HTMLElement | null = null;
  #opener = "";
  #hushed: readonly HTMLElement[] = [];
  #frame = 0;

  constructor() {
    super();
    adoptEarlyProperties(this, modalElement.properties);
  }

  get opener(): string {
    return this.#opener;
  }

  set opener(next: string) {
    this.#opener = next;
  }

  readonly #onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();

      const detail: ModalCancel = { by: "Escape" };

      this.dispatchEvent(new CustomEvent("cancel", { detail }));
    }
  };

  connectedCallback() {
    const active = document.activeElement;

    this.#focused =
      active instanceof HTMLElement && active !== document.body ? active : null;
    this.#hushed = besides(this).filter((outside) => !outside.inert);

    for (const outside of this.#hushed) {
      outside.inert = true;
    }

    this.addEventListener("keydown", this.#onKey);
    this.#frame = requestAnimationFrame(() => {
      this.querySelector<HTMLElement>("[data-modal-focus]")?.focus({
        preventScroll: true,
      });
    });
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#frame);
    this.removeEventListener("keydown", this.#onKey);

    for (const outside of this.#hushed) {
      outside.inert = false;
    }

    this.#hushed = [];

    const named =
      this.#opener === ""
        ? null
        : document.querySelector<HTMLElement>(this.#opener);

    const back = this.#focused?.isConnected === true ? this.#focused : named;

    back?.focus({ preventScroll: true });
    this.#focused = null;
  }
}

export const defineModal = () => {
  if (customElements.get(MODAL_TAG) === undefined) {
    customElements.define(MODAL_TAG, NostakesModal);
  }
};
