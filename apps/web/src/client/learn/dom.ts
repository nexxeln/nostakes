const SVG_NS = "http://www.w3.org/2000/svg";

export const el = (tag: string, className: string, text = "") => {
  const made = document.createElement(tag);

  made.className = className;
  made.textContent = text;

  return made;
};

export const button = (className: string, text: string) => {
  const made = document.createElement("button");

  made.type = "button";
  made.className = className;
  made.textContent = text;

  return made;
};

const ringRect = (className: string) => {
  const rect = document.createElementNS(SVG_NS, "rect");

  rect.setAttribute("class", className);
  rect.setAttribute("x", "2");
  rect.setAttribute("y", "2");
  rect.setAttribute("width", "96");
  rect.setAttribute("height", "96");
  rect.setAttribute("rx", "14");
  rect.setAttribute("pathLength", "100");

  return rect;
};

export const ring = () => {
  const drawn = document.createElementNS(SVG_NS, "svg");

  drawn.setAttribute("class", "ring");
  drawn.setAttribute("viewBox", "0 0 100 100");
  drawn.setAttribute("aria-hidden", "true");
  drawn.append(ringRect("track"), ringRect("run"));

  return drawn;
};

export interface Spot {
  readonly x: number;
  readonly y: number;
}

export const spotIn = (frame: Element, element: Element): Spot => {
  const box = element.getBoundingClientRect();
  const around = frame.getBoundingClientRect();

  return {
    x: box.left + box.width / 2 - around.left,
    y: box.top + box.height / 2 - around.top,
  };
};
