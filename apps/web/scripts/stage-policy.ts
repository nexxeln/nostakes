import { Effect, Schema } from "effect";
import type { Plugin, ViteDevServer } from "vite";

const POLICY_MODULE = "/src/features/page-policy.ts";

export const PAGE_POLICY_ASKED = "workerPolicy=Page";

const HeadersSchema = Schema.Record(Schema.String, Schema.String);

const PolicyModuleSchema = Schema.Struct({
  CLIP_WORKER_HEADERS: HeadersSchema,
  CLIP_WORKER_PATHS: Schema.Array(Schema.String),
  PAGE_HEADERS: HeadersSchema,
});

const sendPolicy = (server: ViteDevServer) =>
  Effect.tryPromise(() => server.ssrLoadModule(POLICY_MODULE)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PolicyModuleSchema)),
    Effect.flatMap(({ CLIP_WORKER_HEADERS, CLIP_WORKER_PATHS, PAGE_HEADERS }) =>
      Effect.sync(() => {
        server.middlewares.use((request, response, next) => {
          const path = request.url ?? "/";

          const clipWorker = CLIP_WORKER_PATHS.some((prefix) =>
            path.startsWith(prefix)
          );

          const headers =
            clipWorker &&
            !(request.headers.referer ?? "").includes(PAGE_POLICY_ASKED)
              ? CLIP_WORKER_HEADERS
              : PAGE_HEADERS;

          for (const [name, value] of Object.entries(headers)) {
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
