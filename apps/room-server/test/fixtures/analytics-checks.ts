import type { RoomCode } from "@nostakes/protocol";
import { RoomEventSchema } from "@nostakes/room";
import { Effect, Option, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";

import { measureAll } from "../../src/analytics.js";
import { hashDevice } from "../../src/device.js";
import { kindOfPoint, StampedPointSchema } from "../../src/measures.js";
import type { Measure, StampedPoint } from "../../src/measures.js";
import { NIGHT_KINDS, nightMeasures } from "../../src/night-measures.js";

const decodeEvent = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema))
);

const ROOM_KEY = /^[0-9a-f]{16}$/u;

const DEVICE_POSITION = 0;

export const roomAnalytics = (base: string, code: RoomCode) =>
  HttpClient.get(new URL(`/test/rooms/${code}/analytics`, base)).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.Array(StampedPointSchema))
    ),
    Effect.orDie
  );

export const siteAnalytics = (base: string) =>
  HttpClient.get(new URL("/test/analytics", base)).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.Array(StampedPointSchema))
    ),
    Effect.orDie
  );

export const hashesOf = (devices: readonly string[]) =>
  Effect.all(
    devices.map((device) => hashDevice(device)),
    { concurrency: "unbounded" }
  );

export interface NightAnalytics {
  readonly points: readonly StampedPoint[];
  readonly hashes: readonly string[];
  readonly secrets: readonly string[];
}

const recordedMeasure = (stamped: StampedPoint): Option.Option<Measure> =>
  kindOfPoint(stamped.point).pipe(
    Option.filter((kind) => NIGHT_KINDS.has(kind)),
    Option.map((kind) => ({
      blobs: stamped.point.blobs
        .slice(1)
        .map((blob, index) =>
          kind === "MemberJoined" && index === DEVICE_POSITION ? "" : blob
        ),
      doubles: stamped.point.doubles,
      kind,
    }))
  );

const describe = (measured: Measure | undefined) =>
  measured === undefined
    ? "nothing"
    : `${measured.kind} [${measured.blobs.join("|")}] [${measured.doubles.join(",")}]`;

export const checkAnalytics = (
  events: readonly string[],
  analytics: NightAnalytics
): readonly string[] => {
  const problems: string[] = [];
  const scopes = new Set(analytics.points.map(({ point }) => point.indexes[0]));

  if (
    scopes.size !== 1 ||
    ![...scopes].every((scope) => ROOM_KEY.test(scope))
  ) {
    problems.push(
      `analytics: the room's data points carry indexes ${[...scopes].join(", ")} instead of one 16-hex room key`
    );
  }

  const [, expected] = measureAll(
    nightMeasures,
    nightMeasures.empty,
    events.map((event) => decodeEvent(event)),
    Option.none()
  );

  const recorded = analytics.points.flatMap((stamped) =>
    Option.toArray(recordedMeasure(stamped))
  );

  const firstDifference = Array.from(
    { length: Math.max(expected.length, recorded.length) },
    (_, index) => index
  ).find(
    (index) =>
      JSON.stringify(expected[index]) !== JSON.stringify(recorded[index])
  );

  if (firstDifference !== undefined) {
    problems.push(
      `analytics: data point ${firstDifference} of ${recorded.length} is ${describe(recorded[firstDifference])}, but the stored log gives ${describe(expected[firstDifference])} (${expected.length} expected)`
    );
  }

  const joined = analytics.points.filter(
    ({ point }) => point.blobs[0] === "MemberJoined"
  );

  const unknownDevices = joined.filter(({ point }) => {
    const device = point.blobs[1] ?? "";

    return device !== "" && !analytics.hashes.includes(device);
  });

  if (unknownDevices.length > 0) {
    problems.push(
      `analytics: ${unknownDevices.length} of ${joined.length} joins carry a device that is not the hash of one the bots sent`
    );
  }

  if (!analytics.hashes.includes(joined[0]?.point.blobs[1] ?? "")) {
    problems.push(
      "analytics: the host's join does not carry the hash of the device that opened the room"
    );
  }

  const leaked = analytics.points.flatMap(({ point }) =>
    analytics.secrets.filter((secret) =>
      point.blobs.some((blob) => blob.includes(secret))
    )
  );

  if (leaked.length > 0) {
    problems.push(
      `analytics: data points contain ${[...new Set(leaked)].join(", ")}`
    );
  }

  return problems;
};
