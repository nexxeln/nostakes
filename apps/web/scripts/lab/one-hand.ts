import { Effect, Schema } from "effect";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

const WEB = new URL("../..", import.meta.url).pathname;

class LabBuildFailed extends Schema.TaggedError<
  LabBuildFailed,
  { readonly brand: unique symbol }
>()("LabBuildFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not build the one-hand page at "${this.step}": ${this.detail}. Build the packages first (pnpm build).`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LabBuildFailed({ detail: String(cause), step }),
    try: run,
  });

const loader = Effect.acquireRelease(
  attempt("start the module loader", () =>
    createServer({
      appType: "custom",
      configFile: false,
      logLevel: "warn",
      optimizeDeps: { noDiscovery: true },
      root: WEB,
      server: { hmr: false, middlewareMode: true, ws: false },
    })
  ),
  (server: ViteDevServer) => Effect.promise(() => server.close())
);

const program = Effect.gen(function* buildOneHand() {
  const server = yield* loader;

  yield* attempt("write the page", () =>
    server.ssrLoadModule("/scripts/lab/one-hand/write.ts")
  );
});

await Effect.runPromise(program.pipe(Effect.scoped));
