import { codeFor, randomAvatar } from "@nostakes/avatar";

import { expressionFor } from "../../src/features/pictures/settle-up.js";
import type { SettleUpCard } from "../../src/features/pictures/settle-up.js";

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
