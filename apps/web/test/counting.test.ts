import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import {
  BuildIdSchema,
  PlayerIdSchema,
  RoomCodeSchema,
} from "@nostakes/protocol";
import { Effect, Option } from "effect";

import {
  COUNTING_KEY,
  DEVICE_HEADER,
  DEVICE_KEY,
  deviceHeaders,
  storeCounting,
} from "../src/client/counting.js";
import { Messages } from "../src/features/message.js";
import { FairMarks, ReloadTargets } from "../src/features/model.js";
import type { Flags, Model } from "../src/features/model.js";
import { ClientReportSchema } from "../src/features/reports.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const flagsWith = (counting: boolean, inRoom: boolean): Flags => ({
  build: "0123abcd4567ef89",
  counting,
  deck: "TwoColour",
  invite: inRoom ? Option.some(CODE) : Option.none(),
  learned: [],
  profile: { avatar: "", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: inRoom ? Option.some({ code: CODE, player: PLAYER }) : Option.none(),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
});

const reportsOf = (
  commands: ReturnType<typeof update>["commands"] | undefined
) =>
  (commands ?? []).flatMap(({ args, name }) =>
    name === "SendReport" ? [args] : []
  );

const FAILED = FairMarks.Failed({
  proof: '{"hand":4}',
  reason: "The seal named one round and the deck was ordered with another.",
});

const ERROR = Messages.CaughtError({
  message:
    "Cannot read 'Ana' of room ABC234 for Ana with token Zm9vYmFyYmF6cXV4cXV1eA",
  name: "TypeError",
});

const everyReport = (model: Model) => [
  ...reportsOf(update(model, ERROR).commands),
  ...reportsOf(
    update(model, Messages.JudgedHand({ hand: 4, mark: FAILED })).commands
  ),
];

const reloaded = (counting: boolean) =>
  reportsOf(
    init({
      ...flagsWith(counting, true),
      reloadedFor: Option.some(
        ReloadTargets.NewBuild({
          build: BuildIdSchema.make("0123abcd4567ef89"),
        })
      ),
    }).commands
  );

describe("anonymous counts on this device", () => {
  it("sends no report of any kind while counts are off", () => {
    expect(everyReport(init(flagsWith(false, true)).model)).toEqual([]);
  });

  it("sends a page's error with names, codes, quotes, and tokens stripped, and a failed deck check, while counts are on", () => {
    expect(everyReport(init(flagsWith(true, true)).model)).toEqual([
      {
        report: ClientReportSchema.cases.ClientError.make({
          build: "0123abcd4567ef89",
          message:
            "Cannot read <quoted> of room <code> for <name> with token <long>",
          name: "TypeError",
          screen: "Room",
        }),
      },
      {
        report: ClientReportSchema.cases.DeckCheckFailed.make({
          build: "0123abcd4567ef89",
        }),
      },
    ]);
  });

  it("reports a reload forced by a new version once, from the page that came back, and only while counts are on", () => {
    expect([reloaded(true), reloaded(false)]).toEqual([
      [
        {
          report: ClientReportSchema.cases.ForcedReload.make({
            build: "0123abcd4567ef89",
            reason: "NewBuild",
          }),
        },
      ],
      [],
    ]);
  });

  it("reports at most five errors from one page", () => {
    let { model } = init(flagsWith(true, false));
    let sent = 0;

    for (let round = 0; round < 9; round += 1) {
      const step = update(model, ERROR);

      sent += reportsOf(step.commands).length;
      ({ model } = step);
    }

    expect(sent).toBe(5);
  });

  it("stops reporting the moment the switch is turned off, and saves the choice", () => {
    const on = init(flagsWith(true, true)).model;
    const switched = update(on, Messages.SwitchedCounting({ on: false }));

    expect(switched.commands?.map(({ name }) => name)).toEqual([
      "SaveCounting",
    ]);
    expect(everyReport(switched.model)).toEqual([]);
  });
});

const fakeStorage = () => {
  const items = new Map<string, string>();

  return {
    clear: () => {
      items.clear();
    },
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

const signalPrivacy = (on: boolean) => {
  Object.defineProperty(globalThis.navigator, "globalPrivacyControl", {
    configurable: true,
    value: on,
  });
};

describe("the device's random number", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fakeStorage(),
    });
    signalPrivacy(false);
  });

  afterEach(() => {
    signalPrivacy(false);
  });

  it.effect(
    "goes with opening or joining a room while counts are on, and stays the same",
    () =>
      Effect.gen(function* sameNumber() {
        const first = yield* deviceHeaders;
        const second = yield* deviceHeaders;

        expect(first[DEVICE_HEADER]).toMatch(/^[A-Za-z0-9_-]{22}$/u);
        expect(second).toEqual(first);
      })
  );

  it.effect("is neither sent nor kept once counts are turned off", () =>
    Effect.gen(function* forgotten() {
      yield* deviceHeaders;
      yield* storeCounting(false);

      expect(yield* deviceHeaders).toEqual({});
      expect(globalThis.localStorage.getItem(DEVICE_KEY)).toBeNull();
      expect(globalThis.localStorage.getItem(COUNTING_KEY)).toBe("off");
    })
  );

  it.effect(
    "starts off when the browser sends Global Privacy Control, until the player turns counts on",
    () =>
      Effect.gen(function* privacySignal() {
        signalPrivacy(true);

        expect(yield* deviceHeaders).toEqual({});
        expect(globalThis.localStorage.getItem(DEVICE_KEY)).toBeNull();

        yield* storeCounting(true);

        expect(Object.keys(yield* deviceHeaders)).toEqual([DEVICE_HEADER]);
      })
  );
});
