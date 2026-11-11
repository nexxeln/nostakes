import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import * as FileSystem from "effect/FileSystem";

import { SOURCE, WEB, written } from "./output.js";
import { timedFilm } from "./timed-film.js";
import { timedPageOf, timedStylesheet } from "./timed-page.js";

const program = Effect.gen(function* writeOneHandTimed() {
  const fs = yield* FileSystem.FileSystem;
  const film = timedFilm();
  const tokens = yield* fs.readFileString(`${WEB}src/client/tokens.css`);
  const shared = yield* fs.readFileString(`${SOURCE}/page.css`);
  const layout = yield* fs.readFileString(`${SOURCE}/timed.css`);

  yield* written({
    css: timedStylesheet(tokens, shared, layout, film),
    html: timedPageOf(film),
    name: "one-hand-2",
    runtime: "timed-runtime.ts",
    summary: `${film.sprites} sprites, ${film.animations} keyframe sets`,
  });
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
