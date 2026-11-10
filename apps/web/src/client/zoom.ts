export const ZOOMED_ATTRIBUTE = "data-zoomed";

export const ZOOMED_ABOVE = 1.01;

const HINT_CLASS = "zoom-hint";

const HINT_FROM_BOTTOM_PX = 24;

const placeHint = (hint: HTMLElement, viewport: VisualViewport) => {
  const across = viewport.offsetLeft + viewport.width / 2;
  const down = viewport.offsetTop + viewport.height - HINT_FROM_BOTTOM_PX;

  hint.style.transform = `translate(${across}px, ${down}px) scale(${1 / viewport.scale}) translate(-50%, -100%)`;
};

export const watchZoom = () => {
  const viewport = globalThis.visualViewport;

  if (viewport === null) {
    return;
  }

  const root = document.documentElement;
  const hint = document.createElement("div");

  hint.className = HINT_CLASS;
  hint.setAttribute("role", "status");
  hint.textContent = "Pinch your fingers together to zoom back out";
  document.body.append(hint);

  const update = () => {
    const zoomed = viewport.scale > ZOOMED_ABOVE;

    root.toggleAttribute(ZOOMED_ATTRIBUTE, zoomed);
    hint.hidden = !zoomed || document.querySelector("nostakes-table") === null;

    if (!hint.hidden) {
      placeHint(hint, viewport);
    }
  };

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();
};
