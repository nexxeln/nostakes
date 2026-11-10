import type { Expression, Species } from "./avatar.js";
import { INK, PAPER } from "./palette.js";
import { at, line, nothing, num, outlined, pair } from "./pen.js";
import type { Pen, Point } from "./pen.js";

export type Jaw = "Plain" | "Fangs" | "Needles";

export interface Build {
  readonly back: (pen: Pen, expression: Expression) => string;
  readonly body: (pen: Pen) => string;
  readonly topper: (pen: Pen, expression: Expression) => string;
  readonly toppedThroughHat: boolean;
  readonly eye: Point;
  readonly eyeScale: number;
  readonly mouth: Point;
  readonly mouthScale: number;
  readonly cheek: Point;
  readonly side: Point;
  readonly crown: string;
  readonly neck: Point;
  readonly jaw: Jaw;
}

const silhouette = (pen: Pen, path: string, inside: string) =>
  `<path d="${path}" fill="${pen.skin.base}"/>${inside}<path d="${path}" fill="none" ${outlined(pen, 2.7)}/>`;

const sheen = (x: number, y: number) =>
  `<ellipse cx="${num(x)}" cy="${num(y)}" rx="7" ry="3.6" transform="rotate(-32 ${num(x)} ${num(y)})" fill="${PAPER}" fill-opacity="0.4"/><circle cx="${num(x + 7.5)}" cy="${num(y - 3.4)}" r="1.5" fill="${PAPER}" fill-opacity="0.45"/>`;

const shadeOn = (path: string) =>
  `<path d="${path}" fill="${INK}" fill-opacity="0.11"/>`;

const fin = (pen: Pen, path: string) =>
  `<path d="${path}" fill="${pen.skin.base}" ${outlined(pen, 2.4)}/>`;

const SIDE_FIN = "M25 80C16 81 8 88 5 98C13 100 22 97 28 91Z";

const FLIPPER = "M20 76C10 76 2 84 1 96C9 99 20 96 26 88Z";

const sideFins = (path: string) => (pen: Pen, expression: Expression) =>
  expression === "LookingDown" ? "" : pair(fin(pen, path));

const dorsal = (pen: Pen, path: string, stripe: string) =>
  `<path d="${path}" fill="${pen.skin.base}" ${outlined(pen, 2.5)}/><path d="${stripe}" ${line(pen, pen.skin.shade, 2.2)}/>`;

const SHARK_FIN = "M41 31C43 17 50 7 62 2C59 11 59 21 63 31Z";

const SHARK_FIN_EDGE = "M57 8C55.5 14 55.5 20 57 26";

const TIGER_FIN = "M40 31C42 19 50 10 60 7C58 15 59 22 62 31Z";

const WHITE_BODY =
  "M50 20C74 20 87 37 87 60C87 76 83 89 82 104H18C17 89 13 76 13 60C13 37 26 20 50 20Z";

const WHITE_BELLY =
  "M13 60C19 57 23 63 29 62C35 61 40 57 50 57C60 57 65 61 71 62C77 63 81 57 87 60C87 76 83 89 82 104H18C17 89 13 76 13 60Z";

const WHITE_SHADE =
  "M50 20C74 20 87 37 87 60C87 76 83 89 82 104H71C77 86 80 64 75 46C71 32 62 23 50 20Z";

const gills = (pen: Pen, colour: string) =>
  pen.small
    ? ""
    : pair(
        `<path d="M18.5 63Q22 68.5 20 75M23 62.5Q26.5 68.5 24.5 76" ${line(pen, colour, 1.7)}/>`
      );

const greatWhite: Build = {
  back: sideFins(SIDE_FIN),
  body: (pen) =>
    silhouette(
      pen,
      WHITE_BODY,
      `<path d="${WHITE_BELLY}" fill="${pen.skin.belly}"/>${gills(pen, pen.skin.shade)}${shadeOn(WHITE_SHADE)}${sheen(30, 34)}`
    ),
  cheek: { x: 27, y: 64 },
  crown: "",
  eye: { x: 37, y: 50 },
  eyeScale: 1,
  jaw: "Plain",
  mouth: { x: 50, y: 69 },
  mouthScale: 1,
  neck: { x: 25, y: 88 },
  side: { x: 13.5, y: 62 },
  toppedThroughHat: false,
  topper: (pen) => dorsal(pen, SHARK_FIN, SHARK_FIN_EDGE),
};

const HAMMER =
  "M4 43C4 31 22 28 50 28C78 28 96 31 96 43C96 53 88 58 77 57C67 56 60 53 50 53C40 53 33 56 23 57C12 58 4 53 4 43Z";

const HAMMER_BODY = "M28 46C26 66 20 84 19 104H81C80 84 74 66 72 46Z";

const HAMMER_BELLY =
  "M25.7 62C33 58.5 40 61 50 59C60 61 67 58.5 74.3 62C76.4 75 79.6 88 81 104H19C20.4 88 23.6 75 25.7 62Z";

const hammerhead: Build = {
  back: sideFins(SIDE_FIN),
  body: (pen) =>
    silhouette(
      pen,
      HAMMER_BODY,
      `<path d="${HAMMER_BELLY}" fill="${pen.skin.belly}"/>${shadeOn("M72 46C74 66 80 84 81 104H72C74 84 70 62 66 46Z")}`
    ) +
    silhouette(
      pen,
      HAMMER,
      `${shadeOn("M96 43C96 53 88 58 77 57C67 56 60 53 50 53C40 53 33 56 23 57C12 58 4 53 4 43C14 49 30 48 50 48C70 48 86 49 96 43Z")}${sheen(24, 35)}`
    ),
  cheek: { x: 32, y: 63 },
  crown: "translate(0 8.5) translate(50 20) scale(0.92) translate(-50 -20)",
  eye: { x: 15.5, y: 42.5 },
  eyeScale: 0.86,
  jaw: "Plain",
  mouth: { x: 50, y: 68 },
  mouthScale: 0.95,
  neck: { x: 27, y: 88 },
  side: { x: 7, y: 47 },
  toppedThroughHat: false,
  topper: (pen) =>
    dorsal(
      pen,
      "M41 39C43 25 50 15 62 10C59 19 59 29 63 39Z",
      "M57 16C55.5 22 55.5 28 57 34"
    ),
};

const TIGER_BODY =
  "M50 21C76 21 88 36 88 58C88 76 84 89 83 104H17C16 89 12 76 12 58C12 36 24 21 50 21Z";

const TIGER_BELLY =
  "M12.2 63C24 62 34 60 50 60C66 60 76 62 87.8 63C87 78 84 90 83 104H17C16 90 13 78 12.2 63Z";

const TIGER_STRIPES =
  "M45.6 21.4Q50 20.6 54.4 21.4L50 33ZM31.4 25.6L39 34.4L37.2 23.2ZM68.6 25.6L61 34.4L62.8 23.2ZM12.4 43.4L26 46.6L12.6 49.6ZM12.2 53L24 55L12.2 58ZM87.6 43.4L74 46.6L87.4 49.6ZM87.8 53L76 55L87.8 58Z";

const tiger: Build = {
  back: sideFins(SIDE_FIN),
  body: (pen) =>
    silhouette(
      pen,
      TIGER_BODY,
      `<path d="${TIGER_BELLY}" fill="${pen.skin.belly}"/><path d="${TIGER_STRIPES}" fill="${INK}" fill-opacity="0.32"/>${gills(pen, pen.skin.shade)}${shadeOn("M50 21C76 21 88 36 88 58C88 76 84 89 83 104H72C78 86 81 64 76 46C72 32 63 24 50 21Z")}${sheen(28, 38)}`
    ),
  cheek: { x: 27, y: 66 },
  crown: "translate(0 1)",
  eye: { x: 36.5, y: 50 },
  eyeScale: 0.95,
  jaw: "Plain",
  mouth: { x: 50, y: 70 },
  mouthScale: 1.1,
  neck: { x: 24, y: 88 },
  side: { x: 12.5, y: 60 },
  toppedThroughHat: false,
  topper: (pen) => dorsal(pen, TIGER_FIN, "M55 12C54 17 54 22 55.5 27"),
};

const GOLD_BODY =
  "M50 25C72 25 85 41 85 62C85 79 79 91 77 104H23C21 91 15 79 15 62C15 41 28 25 50 25Z";

const GOLD_BELLY =
  "M15.2 66C26 70 38 71 50 71C62 71 74 70 84.8 66C84 81 79 92 77 104H23C21 92 16 81 15.2 66Z";

const QUIFF =
  "M33 33C28 19 38 7 55 6C66 6 73 12 71 19C67 15 61 15 59 20C64 22 67 27 66 33Z";

const scales = (pen: Pen) =>
  pen.small
    ? ""
    : `<path d="M36 82Q39 86 42 82M46 85Q49 89 52 85M56 82Q59 86 62 82M41 91Q44 95 47 91M51 91Q54 95 57 91" ${line(pen, pen.skin.shade, 1.5)}/>`;

const flowFin = (pen: Pen, expression: Expression) =>
  expression === "LookingDown"
    ? ""
    : pair(
        `<path d="M24 76C14 76 5 84 4 96C9 92 12 98 17 95C20 98 25 94 28 88Z" fill="${pen.skin.shade}" ${outlined(pen, 2.3)}/>${pen.small ? "" : `<path d="M22 80L9 91M24 84L15 95" ${line(pen, pen.skin.base, 1.4)}/>`}`
      );

const goldfish: Build = {
  back: (pen, expression) =>
    `<path d="${QUIFF}" fill="${pen.skin.shade}" ${outlined(pen, 2.4)}/>${pen.small ? "" : `<path d="M40 30C38 21 44 13 53 11M48 30C47 23 51 17 58 15" ${line(pen, pen.skin.base, 1.6)}/>`}${flowFin(pen, expression)}`,
  body: (pen) =>
    silhouette(
      pen,
      GOLD_BODY,
      `<path d="${GOLD_BELLY}" fill="${pen.skin.belly}"/>${scales(pen)}${shadeOn("M50 25C72 25 85 41 85 62C85 79 79 91 77 104H67C74 86 78 66 73 48C69 36 61 28 50 25Z")}${sheen(30, 38)}`
    ),
  cheek: { x: 27, y: 66 },
  crown: "translate(0 5)",
  eye: { x: 37, y: 53 },
  eyeScale: 1.12,
  jaw: "Plain",
  mouth: { x: 50, y: 71 },
  mouthScale: 0.95,
  neck: { x: 26, y: 90 },
  side: { x: 15.5, y: 64 },
  toppedThroughHat: false,
  topper: nothing,
};

const PUFFER_BODY =
  "M50 25C70 25 85 40 85 60C85 80 70 95 50 95C30 95 15 80 15 60C15 40 30 25 50 25Z";

const PUFFER_BELLY = "M15.2 64Q50 57 84.8 64A35 35 0 0 1 15.2 64Z";

const SPIKE_ANGLES = [-160, -138, -116, -92, -68, -44, -22, 0, 160, 180];

const spikes = (pen: Pen) => {
  const path = SPIKE_ANGLES.map((degrees) => {
    const radians = (degrees * Math.PI) / 180;

    const around = (offset: number, radius: number): Point => ({
      x: 50 + Math.cos(radians + offset) * radius,
      y: 60 + Math.sin(radians + offset) * radius,
    });

    return `M${at(around(-0.13, 33))}L${at(around(0, 41.5))}L${at(around(0.13, 33))}Z`;
  }).join("");

  return `<path d="${path}" fill="${pen.skin.shade}" ${outlined(pen, 2.1)}/>`;
};

const PUFFER_SPOTS =
  "M38 34.5h0M50 31.5h0M62 34.5h0M31 41h0M69 41h0M44 39h0M56 39h0";

const puffer: Build = {
  back: (pen, expression) =>
    `${spikes(pen)}${expression === "LookingDown" ? "" : pair(fin(pen, "M20 72C11 70 4 76 3 85C10 87 17 84 22 79Z"))}`,
  body: (pen) =>
    silhouette(
      pen,
      PUFFER_BODY,
      `<path d="${PUFFER_BELLY}" fill="${pen.skin.belly}"/><path d="${PUFFER_SPOTS}" ${line(pen, pen.skin.shade, 3.4)}/>${shadeOn("M50 25C70 25 85 40 85 60C85 80 70 95 50 95C64 88 73 74 73 58C73 44 64 31 50 25Z")}${sheen(31, 41)}`
    ),
  cheek: { x: 27, y: 67 },
  crown: "translate(0 5)",
  eye: { x: 37, y: 55 },
  eyeScale: 1,
  jaw: "Plain",
  mouth: { x: 50, y: 73 },
  mouthScale: 0.9,
  neck: { x: 27, y: 87 },
  side: { x: 15.5, y: 64 },
  toppedThroughHat: false,
  topper: nothing,
};

const PIRANHA_BODY =
  "M50 21C73 21 86 37 86 57C86 70 84 81 83 90C82 96 81 100 81 104H19C19 100 18 96 17 90C16 81 14 70 14 57C14 37 27 21 50 21Z";

const PIRANHA_THROAT =
  "M14.6 70C26 75 38 77 50 77C62 77 74 75 85.4 70C84.6 78 83.6 85 83 90C82 96 81 100 81 104H19C19 100 18 96 17 90C16.4 85 15.4 78 14.6 70Z";

const PIRANHA_FLECKS =
  "M30 36h0M37 30h0M45 27h0M55 27h0M63 30h0M70 36h0M25 44h0M75 44h0";

const piranha: Build = {
  back: (pen, expression) =>
    `${dorsal(pen, "M42 29L45 13L50 21L55 11L58 29Z", "M50 21V27")}${sideFins(SIDE_FIN)(pen, expression)}`,
  body: (pen) =>
    silhouette(
      pen,
      PIRANHA_BODY,
      `<path d="${PIRANHA_THROAT}" fill="#ff5a4a"/><path d="${PIRANHA_FLECKS}" ${line(pen, PAPER, 2.4)} stroke-opacity="0.7"/>${shadeOn("M50 21C73 21 86 37 86 57C86 70 84 81 83 90C82 96 81 100 81 104H71C77 86 80 64 75 46C71 33 62 24 50 21Z")}${sheen(29, 37)}`
    ),
  cheek: { x: 27, y: 64 },
  crown: "",
  eye: { x: 37, y: 50 },
  eyeScale: 1,
  jaw: "Fangs",
  mouth: { x: 50, y: 69 },
  mouthScale: 1.05,
  neck: { x: 26, y: 89 },
  side: { x: 14, y: 61 },
  toppedThroughHat: false,
  topper: nothing,
};

const BETTA_BODY =
  "M50 27C69 27 79 41 79 60C79 77 75 90 74 104H26C25 90 21 77 21 60C21 41 31 27 50 27Z";

const BETTA_FIN =
  "M27 44C15 33 2 37 3 50C4 58 0 64 3 72C6 80 2 88 8 95C14 101 21 95 26 88Z";

const BETTA_CREST =
  "M35 35C31 21 41 8 56 8C66 8 72 14 69 21C75 21 78 28 72 33C70 30 67 31 66 35Z";

const bettaFins = (pen: Pen) =>
  pair(
    `<path d="${BETTA_FIN}" fill="${pen.skin.shade}" ${outlined(pen, 2.3)}/>${pen.small ? "" : `<path d="M25 50L8 46M24 60L5 62M24 70L6 79M25 80L12 92" ${line(pen, pen.skin.base, 1.6)}/>`}`
  );

const betta: Build = {
  back: (pen) =>
    `<path d="${BETTA_CREST}" fill="${pen.skin.shade}" ${outlined(pen, 2.4)}/>${pen.small ? "" : `<path d="M41 32C39 22 45 14 54 12M50 31C50 24 55 19 62 18" ${line(pen, pen.skin.base, 1.6)}/>`}${bettaFins(pen)}`,
  body: (pen) =>
    silhouette(
      pen,
      BETTA_BODY,
      `<path d="M21.2 66C30 70 40 72 50 72C60 72 70 70 78.8 66C78 80 75 91 74 104H26C25 91 22 80 21.2 66Z" fill="${pen.skin.belly}" fill-opacity="0.7"/>${shadeOn("M50 27C69 27 79 41 79 60C79 77 75 90 74 104H66C72 86 74 66 70 50C67 39 60 30 50 27Z")}${sheen(33, 40)}`
    ),
  cheek: { x: 30, y: 66 },
  crown: "translate(0 6) translate(50 20) scale(0.9) translate(-50 -20)",
  eye: { x: 38.5, y: 54 },
  eyeScale: 0.95,
  jaw: "Plain",
  mouth: { x: 50, y: 71 },
  mouthScale: 0.9,
  neck: { x: 28, y: 90 },
  side: { x: 21.5, y: 64 },
  toppedThroughHat: false,
  topper: nothing,
};

const ANGLER_BODY =
  "M50 30C75 30 89 44 89 63C89 79 84 91 82 104H18C16 91 11 79 11 63C11 44 25 30 50 30Z";

const LURE_GLOW = "#fff59a";

const lure = (pen: Pen, expression: Expression) => {
  const bulb: Point =
    expression === "Folded" ? { x: 72, y: 22 } : { x: 67, y: 10 };

  const stalk = `M50 33C49 20 ${num(bulb.x - 12)} ${num(bulb.y)} ${at(bulb)}`;
  const lit = expression === "Folded" ? "0" : "0.4";

  return `<path d="${stalk}" ${line(pen, INK, 4.6)}/><path d="${stalk}" ${line(pen, pen.skin.shade, 2.2)}/><circle cx="${num(bulb.x)}" cy="${num(bulb.y)}" r="9" fill="${LURE_GLOW}" fill-opacity="${lit}"/><circle cx="${num(bulb.x)}" cy="${num(bulb.y)}" r="5" fill="${expression === "Folded" ? "#b9b48a" : LURE_GLOW}" ${outlined(pen, 2.2)}/><circle cx="${num(bulb.x - 1.6)}" cy="${num(bulb.y - 1.6)}" r="1.5" fill="${PAPER}"/>`;
};

const angler: Build = {
  back: sideFins(SIDE_FIN),
  body: (pen) =>
    silhouette(
      pen,
      ANGLER_BODY,
      `<path d="M11.3 68C26 74 38 76 50 76C62 76 74 74 88.7 68C88 82 84 92 82 104H18C16 92 12 82 11.3 68Z" fill="${pen.skin.belly}" fill-opacity="0.55"/>${pen.small ? "" : `<path d="M30 40h0M24 48h0M70 40h0M76 48h0" ${line(pen, pen.skin.shade, 3)}/>`}${shadeOn("M50 30C75 30 89 44 89 63C89 79 84 91 82 104H71C78 86 81 68 76 52C72 40 62 32 50 30Z")}${sheen(28, 44)}`
    ),
  cheek: { x: 25, y: 66 },
  crown: "translate(0 8)",
  eye: { x: 35, y: 54 },
  eyeScale: 0.88,
  jaw: "Needles",
  mouth: { x: 50, y: 72 },
  mouthScale: 1.35,
  neck: { x: 24, y: 90 },
  side: { x: 11.5, y: 64 },
  toppedThroughHat: true,
  topper: lure,
};

const WHALE_BODY =
  "M50 23C79 23 93 38 93 60C93 78 87 91 85 104H15C13 91 7 78 7 60C7 38 21 23 50 23Z";

const WHALE_BELLY =
  "M7.6 70C24 78 36 80 50 80C64 80 76 78 92.4 70C91 84 87 93 85 104H15C13 93 9 84 7.6 70Z";

const spout = (pen: Pen, expression: Expression) => {
  const big = expression === "Happy";
  const top = big ? 2 : 9;
  const water = "#bfe9ff";

  return `<path d="M50 24V${num(top + 4)}" ${line(pen, INK, 5.2)}/><path d="M50 24V${num(top + 4)}" ${line(pen, water, 2.8)}/><path d="M50 ${num(top + 5)}C46 ${num(top)} 40 ${num(top)} 37 ${num(top + 5)}M50 ${num(top + 5)}C54 ${num(top)} 60 ${num(top)} 63 ${num(top + 5)}" ${line(pen, INK, 5)}/><path d="M50 ${num(top + 5)}C46 ${num(top)} 40 ${num(top)} 37 ${num(top + 5)}M50 ${num(top + 5)}C54 ${num(top)} 60 ${num(top)} 63 ${num(top + 5)}" ${line(pen, water, 2.6)}/><circle cx="35.5" cy="${num(top + 9)}" r="1.9" fill="${water}" ${outlined(pen, 1.4)}/><circle cx="64.5" cy="${num(top + 9)}" r="1.9" fill="${water}" ${outlined(pen, 1.4)}/>`;
};

const whale: Build = {
  back: (pen, expression) =>
    expression === "LookingDown" ? "" : pair(fin(pen, FLIPPER)),
  body: (pen) =>
    silhouette(
      pen,
      WHALE_BODY,
      `<path d="${WHALE_BELLY}" fill="${pen.skin.belly}"/>${pen.small ? "" : `<path d="M28 85Q50 92 72 85M26 93Q50 100 74 93" ${line(pen, pen.skin.shade, 1.6)} stroke-opacity="0.6"/>`}${shadeOn("M50 23C79 23 93 38 93 60C93 78 87 91 85 104H74C82 86 85 66 80 48C75 35 64 26 50 23Z")}${sheen(26, 38)}`
    ),
  cheek: { x: 22, y: 70 },
  crown: "translate(0 3)",
  eye: { x: 31, y: 59 },
  eyeScale: 0.88,
  jaw: "Plain",
  mouth: { x: 50, y: 73 },
  mouthScale: 1.45,
  neck: { x: 22, y: 92 },
  side: { x: 7.5, y: 62 },
  toppedThroughHat: true,
  topper: spout,
};

const OCTO_HEAD =
  "M50 12C72 12 85 28 85 50C85 63 79 72 71 77H29C21 72 15 63 15 50C15 28 28 12 50 12Z";

const CURLED_ARM = "M25 72C15 75 7 70 7 61C7 54 12 51 16 54";

const LOW_ARM = "M33 75C29 83 23 87 16 86";

const INNER_ARM = "M43 77C43 85 41 92 37 97";

const tentacles = (pen: Pen, expression: Expression) => {
  const path =
    expression === "LookingDown"
      ? CURLED_ARM + LOW_ARM
      : CURLED_ARM + LOW_ARM + INNER_ARM;

  return pair(
    `<path d="${path}" ${line(pen, INK, 12.4)}/><path d="${path}" ${line(pen, pen.skin.base, 8.4)}/>${pen.small ? "" : `<path d="M10.4 63h0M12.6 69h0M21.6 85h0M27.6 82h0" ${line(pen, pen.skin.belly, 2.4)}/>`}`
  );
};

const octopus: Build = {
  back: tentacles,
  body: (pen) =>
    silhouette(
      pen,
      OCTO_HEAD,
      `<path d="M63 24h0M70 31h0M58 31h0M30 28h0" ${line(pen, pen.skin.belly, 4.2)} stroke-opacity="0.65"/>${shadeOn("M50 13C73 13 86 30 86 52C86 66 80 76 72 81H63C72 70 76 56 73 42C70 29 62 18 50 13Z")}${sheen(30, 26)}`
    ),
  cheek: { x: 28, y: 64 },
  crown: "translate(0 -7)",
  eye: { x: 37, y: 54 },
  eyeScale: 1.02,
  jaw: "Plain",
  mouth: { x: 50, y: 69 },
  mouthScale: 0.85,
  neck: { x: 30, y: 84 },
  side: { x: 15.5, y: 48 },
  toppedThroughHat: false,
  topper: nothing,
};

export const BUILDS: Readonly<Record<Species, Build>> = {
  Angler: angler,
  Betta: betta,
  Goldfish: goldfish,
  GreatWhite: greatWhite,
  Hammerhead: hammerhead,
  Octopus: octopus,
  Piranha: piranha,
  Puffer: puffer,
  Tiger: tiger,
  Whale: whale,
};
