import { Effect, Schema } from "effect";
import type { Plugin, ViteDevServer } from "vite";

const POLICY_MODULE = "/src/features/page-policy.ts";

const PolicyModuleSchema = Schema.Struct({
  PAGE_HEADERS: Schema.Record(Schema.String, Schema.String),
});

const sendPolicy = (server: ViteDevServer) =>
  Effect.tryPromise(() => server.ssrLoadModule(POLICY_MODULE)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PolicyModuleSchema)),
    Effect.flatMap(({ PAGE_HEADERS }) =>
      Effect.sync(() => {
        server.middlewares.use((_request, response, next) => {
          for (const [name, value] of Object.entries(PAGE_HEADERS)) {
            response.setHeader(name, value);
          }

          next();
        });
      })
    )
  );

export const pagePolicy = (): Plugin => ({
  configureServer: (server) => Effect.runPromise(sendPolicy(server)),
  name: "nostakes-stage-policy",
});
