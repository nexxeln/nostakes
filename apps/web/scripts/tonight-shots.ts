import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { chromium } from "playwright-core";
import type { Page } from "playwright-core";

import { MEDIA_PACKAGES } from "../src/client/moments/mediabunny/packages.ts";
import { mutedBrowser, servedVite } from "./local-site.ts";
import { pagePolicy } from "./stage-policy.ts";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE = "/scripts/moments/stage.html";

const SIZES = [
  { height: 844, width: 390 },
  { height: 640, width: 360 },
] as const;

const NIGHT = "AcesCracked,HeroCall,AllInBluff,QuadsIntoBoat";

class ShotsFailed extends Schema.TaggedError<
  ShotsFailed,
  { readonly brand: unique symbol }
>()("ShotsFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Photographing Tonight failed at "${this.step}": ${this.detail}. Open ${STAGE}?view=tonight&hands=${NIGHT} on the stage server to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ShotsFailed({ detail: String(cause), step }),
    try: run,
  });

const rowsIn = (page: Page, state: string, count: number, timeout: number) =>
  attempt(`wait for ${count} rows to say ${state}`, () =>
    page.waitForFunction(
      ({ least, wanted }) =>
        (globalThis.document
          .querySelector("nostakes-tonight")
          ?.shadowRoot?.querySelectorAll(`li[data-clip="${wanted}"]`).length ??
          0) >= least,
      { least: count, wanted: state },
      { timeout }
    )
  );

const program = Effect.gen(function* shoot() {
  const dir = yield* Config.String("TONIGHT_DIR");
  const files = yield* FileSystem.FileSystem;

  yield* files.makeDirectory(dir, { recursive: true });

  const origin = yield* servedVite("start the stage server", "STAGE_PORT", {
    configFile: false,
    logLevel: "warn",
    optimizeDeps: { include: MEDIA_PACKAGES },
    plugins: [pagePolicy()],
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new ShotsFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const opened = yield* mutedBrowser(chromium).pipe(
    Effect.mapError(
      (failure) =>
        new ShotsFailed({ detail: failure.detail, step: failure.step })
    )
  );

  for (const theme of ["Dark", "Light"]) {
    for (const size of SIZES) {
      const label = `${size.width}x${size.height}-${theme.toLowerCase()}`;

      const context = yield* attempt("open a phone", () =>
        opened.newContext({ hasTouch: true, viewport: size })
      );

      const shot = (page: Page, name: string) =>
        attempt(`photograph ${name}`, () =>
          page.screenshot({ path: `${dir}/${label}-${name}.png` })
        ).pipe(Effect.andThen(Console.log(`${label}-${name}.png`)));

      const table = yield* attempt("open a page", () => context.newPage());

      yield* attempt("open the table moment", () =>
        table.goto(
          `${origin}${STAGE}?view=tonight&hands=QuadsIntoBoat&theme=${theme}&room=SHOT${size.width}T`
        )
      );
      yield* attempt("wait for the moment", () =>
        table
          .locator("nostakes-moment .clip-it:not(.gone)")
          .waitFor({ state: "attached", timeout: 30_000 })
      );
      yield* attempt("let the card land", () => table.waitForTimeout(1500));
      yield* shot(table, "1-table-moment");
      yield* attempt("wait for the card to leave", () =>
        table.waitForTimeout(2400)
      );
      yield* shot(table, "2-clip-it");

      const drawer = yield* attempt("open a page", () => context.newPage());

      yield* attempt("open Tonight", () =>
        drawer.goto(
          `${origin}${STAGE}?view=tonight&drawer=only&hands=${NIGHT}&theme=${theme}&room=SHOT${size.width}${theme}`
        )
      );
      yield* rowsIn(drawer, "Making", 1, 60_000);
      yield* attempt("let the pictures draw", () =>
        drawer.waitForTimeout(1200)
      );
      yield* shot(drawer, "3-tonight-making");
      yield* rowsIn(drawer, "Ready", 2, 240_000);
      yield* attempt("let the pictures draw", () => drawer.waitForTimeout(800));
      yield* shot(drawer, "4-tonight-ready");
      yield* attempt("open a slip", () =>
        drawer.locator("nostakes-tonight .open").first().click()
      );
      yield* attempt("let the slip draw", () => drawer.waitForTimeout(600));
      yield* shot(drawer, "5-slip");

      const settled = yield* attempt("open a page", () => context.newPage());

      yield* attempt("open the settled screen", () =>
        settled.goto(
          `${origin}${STAGE}?view=tonight&drawer=only&settled=true&hands=${NIGHT}&theme=${theme}&room=SHOT${size.width}${theme}`
        )
      );
      yield* attempt("wait for the reel", () =>
        settled.waitForFunction(
          () =>
            globalThis.document
              .querySelector("nostakes-tonight")
              ?.shadowRoot?.querySelector('.reel[data-reel="Ready"]') !== null,
          undefined,
          { timeout: 300_000 }
        )
      );
      yield* shot(settled, "6-settled-reel");
      yield* attempt("close the phone", () => context.close());
    }
  }
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
