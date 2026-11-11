import { MOMENT_KINDS, TIERS } from "@nostakes/room";
import type { MomentKind, Tier } from "@nostakes/room";
import { Effect } from "effect";

import { renderScore } from "../../src/client/moments/synth.js";
import { momentScore, scoreLength } from "../../src/features/moments/score.js";

const RATE = 44_100;

const wavOf = (buffer: AudioBuffer) => {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * channels * 2));

  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes.setUint8(at + index, value.codePointAt(index) ?? 0);
    }
  };

  text(0, "RIFF");
  bytes.setUint32(4, 36 + frames * channels * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, channels, true);
  bytes.setUint32(24, RATE, true);
  bytes.setUint32(28, RATE * channels * 2, true);
  bytes.setUint16(32, channels * 2, true);
  bytes.setUint16(34, 16, true);
  text(36, "data");
  bytes.setUint32(40, frames * channels * 2, true);

  const data = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel)
  );

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel]?.[frame] ?? 0));

      bytes.setInt16(
        44 + (frame * channels + channel) * 2,
        sample * 32_767,
        true
      );
    }
  }

  let binary = "";

  for (const byte of new Uint8Array(bytes.buffer)) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary);
};

const render = (kind: MomentKind, tier: Tier) => {
  const steps = momentScore(kind, tier);
  const seconds = scoreLength(steps) + 0.25;

  return renderScore(steps, { channels: 2, sampleRate: RATE, seconds }).pipe(
    Effect.map((rendered) => ({ seconds, wav: wavOf(rendered) }))
  );
};

const params = new URLSearchParams(globalThis.location.search);

const asked = new Set((params.get("jobs") ?? "").split(","));

const jobs = MOMENT_KINDS.flatMap((kind) =>
  TIERS[kind].flatMap((tier) =>
    asked.has(`${kind}-${tier}`) ? [{ kind, tier }] : []
  )
);

const rendered = await Effect.runPromise(
  Effect.all(
    jobs.map(({ kind, tier }) =>
      render(kind, tier).pipe(
        Effect.map((sound) => [`${kind}-${tier}`, sound] as const)
      )
    )
  )
);

const stage = document.querySelector("#stage");

if (stage instanceof HTMLElement) {
  stage.dataset.result = JSON.stringify(Object.fromEntries(rendered));
}

document.documentElement.dataset.staged = "true";
