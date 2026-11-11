import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import * as FileSystem from "effect/FileSystem";

import { filmed } from "./film.js";
import { SOURCE, WEB, written } from "./output.js";
import { pageOf, stylesheet } from "./page.js";

const program = Effect.gen(function* writeOneHand() {
  const fs = yield* FileSystem.FileSystem;
  const film = filmed();
  const tokens = yield* fs.readFileString(`${WEB}src/client/tokens.css`);
  const styles = yield* fs.readFileString(`${SOURCE}/page.css`);

  yield* written({
    css: stylesheet(tokens, styles, film),
    html: pageOf(film),
    name: "one-hand",
    runtime: "runtime.ts",
    summary: `${film.sprites} sprites, ${film.animations} keyframe sets`,
  });
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
