import { codeFor, randomAvatar } from "@nostakes/avatar";
import { Option } from "effect";

import { expressionFor } from "../../src/features/pictures/settle-up.js";
import type { SettleUpCard } from "../../src/features/pictures/settle-up.js";
import { NAME_FORMS } from "../../src/features/recap.js";
import type { RecapCard } from "../../src/features/recap.js";
import { samplePicture } from "../moments/samples.js";

interface Night {
  readonly nets: readonly (readonly [string, number])[];
  readonly transfers: readonly (readonly [string, string, number])[];
}

const NIGHTS = {
  nine: {
    nets: [
      ["Maximiliana Wolfenstein-Vanderbilt Okafo", 2450],
      ["Bartholomew Montgomery-Fitzwilliam III", 1180],
      ["WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", 375],
      ["Ana", 5],
      ["Christopher Alexander Jonathan Smithers", 0],
      ["Guinevere Persephone Ravenscroft-Ellis", -310],
      ["Oluwaseun Adebayo-Williams Montgomery Jr", -700],
      ["Kit", -1000],
      ["Anastasia Konstantinopoulou-Papadimitri", -2000],
    ],
    transfers: [
      [
        "Anastasia Konstantinopoulou-Papadimitri",
        "Maximiliana Wolfenstein-Vanderbilt Okafo",
        2000,
      ],
      ["Kit", "Bartholomew Montgomery-Fitzwilliam III", 1000],
      [
        "Oluwaseun Adebayo-Williams Montgomery Jr",
        "Maximiliana Wolfenstein-Vanderbilt Okafo",
        450,
      ],
      [
        "Oluwaseun Adebayo-Williams Montgomery Jr",
        "Bartholomew Montgomery-Fitzwilliam III",
        180,
      ],
      [
        "Oluwaseun Adebayo-Williams Montgomery Jr",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        70,
      ],
      [
        "Guinevere Persephone Ravenscroft-Ellis",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        305,
      ],
      ["Guinevere Persephone Ravenscroft-Ellis", "Ana", 5],
    ],
  },
  six: {
    nets: [
      ["Priya", 1250],
      ["Kit", 310],
      ["Lou", 0],
      ["Dev", -160],
      ["Sam", -400],
      ["Jonas", -1000],
    ],
    transfers: [
      ["Jonas", "Priya", 1000],
      ["Sam", "Priya", 250],
      ["Sam", "Kit", 150],
      ["Dev", "Kit", 160],
    ],
  },
  two: {
    nets: [
      ["Ana", 40],
      ["Ben", -40],
    ],
    transfers: [["Ben", "Ana", 40]],
  },
} satisfies Readonly<Record<string, Night>>;

export const NIGHT_NAMES = Object.keys(NIGHTS);

const nightOf = (name: string): Night =>
  new Map<string, Night>(Object.entries(NIGHTS)).get(name) ?? NIGHTS.six;

export const sampleSettleUp = (name: string): SettleUpCard => {
  const night = nightOf(name);
  const lowest = Math.min(0, ...night.nets.map(([, net]) => net));

  return {
    players: night.nets.map(([player, net], index) => ({
      avatar: codeFor(randomAvatar(index * 13 + 5)),
      expression: expressionFor(net, lowest),
      name: player,
      net,
    })),
    transfers: night.transfers.map(([from, to, amount]) => ({
      amount,
      from,
      to,
    })),
  };
};

interface RecapNight {
  readonly hands: number;
  readonly length: string;
  readonly moments: readonly (readonly [string, string])[];
  readonly pot: readonly [number, number, readonly string[]];
}

const RECAPS = {
  nine: {
    hands: 263,
    length: "5 h 2 min",
    moments: [
      ["BigHand-3", "Bartholomew Montgomery-Fitzwilliam III"],
      ["BadBeat-1", "Anastasia Konstantinopoulou-Papadimitri"],
      ["HeroCall-2", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"],
    ],
    pot: [
      3120,
      211,
      [
        "Maximiliana Wolfenstein-Vanderbilt Okafo",
        "Oluwaseun Adebayo-Williams Montgomery Jr",
      ],
    ],
  },
  six: {
    hands: 142,
    length: "3 h 10 min",
    moments: [
      ["BigHand-3", "Kit"],
      ["BadBeat-1", "Jonas"],
      ["Bluff-2", "Lou"],
    ],
    pot: [2400, 87, ["Kit", "Priya", "Sam"]],
  },
  two: {
    hands: 18,
    length: "48 min",
    moments: [["SevenDeuce-1", "Ana"]],
    pot: [120, 9, ["Ana"]],
  },
} satisfies Readonly<Record<string, RecapNight>>;

const recapOf = (name: string): RecapNight =>
  new Map<string, RecapNight>(Object.entries(RECAPS)).get(name) ?? RECAPS.six;

export const sampleRecap = (name: string): RecapCard => {
  const night = recapOf(name);
  const settled = sampleSettleUp(name);
  const [winner] = settled.players;

  const faceFor = (player: string) =>
    settled.players.find((each) => each.name === player) ?? winner;

  const [pot, hand, takers] = night.pot;

  return {
    biggestPot: Option.some({
      hand,
      pot,
      takers: takers.map((taker) => ({
        avatar: faceFor(taker)?.avatar ?? "",
        expression: "Happy" as const,
        name: taker,
      })),
    }),
    hands: night.hands,
    length: night.length,
    moments: night.moments.map(([sample, player], index) => {
      const picture = samplePicture(sample);
      const [lead] = picture.faces;

      return {
        cards: lead?.cards ?? [],
        face: {
          avatar: faceFor(player)?.avatar ?? lead?.avatar ?? "",
          expression: lead?.expression ?? "Happy",
          name: player,
        },
        hand: 20 + index * 37,
        lines: NAME_FORMS.map((form) =>
          picture.line.replaceAll(lead?.name ?? "", form(player))
        ),
        title: picture.title,
      };
    }),
    winner: Option.fromUndefinedOr(winner).pipe(
      Option.map((top) => ({
        face: {
          avatar: top.avatar,
          expression: "Happy" as const,
          name: top.name,
        },
        net: top.net,
      }))
    ),
  };
};
