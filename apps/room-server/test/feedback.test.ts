import { RpcCallError } from "@alchemy.run/cloudflare";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Logger, Option, Redacted } from "effect";
import type { Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { unlimited } from "../src/address-limits.js";
import {
  FEEDBACK_READ_ROUTE,
  FEEDBACK_ROUTE,
  feedbackRoutes,
} from "../src/feedback-routes.js";
import type { FeedbackNamespace } from "../src/feedback-routes.js";
import type { FeedbackNoteSchema } from "../src/feedback.js";
import { measure, SITE_SCOPE, pointOf } from "../src/measures.js";
import { memoryAnalytics } from "./fixtures/test-analytics.js";

const ORIGIN = "https://preview.nostakes.club";

const SECRET = "a-feedback-secret-for-this-test";

const MARK = "Kestrel-7c1d plays the river";

const note = (text: string) => ({
  agent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1",
  build: "b7f3c2",
  height: 844,
  note: text,
  screen: "Room",
  width: 390,
});

type Box = "Keeps" | "Refuses" | "Dies";

const boxThat = (
  behaviour: Box,
  kept: (typeof FeedbackNoteSchema.Encoded)[]
): FeedbackNamespace => ({
  getByName: () => ({
    keep: (input) => {
      if (behaviour === "Refuses") {
        return Effect.fail(
          new RpcCallError({
            cause: new Error(`refused ${input.note}`),
            method: "keep",
          })
        );
      }

      if (behaviour === "Dies") {
        return Effect.die(new Error(`died holding ${input.note}`));
      }

      return Effect.sync(() => {
        kept.push(input);

        return true;
      });
    },
    read: () =>
      Effect.succeed({
        more: false,
        notes: kept.map((input, index) => ({ ...input, at: 0, id: index + 1 })),
      }),
  }),
});

const post = (
  path: string,
  body: Schema.Json,
  headers: Record<string, string>
) =>
  new Request(new URL(path, ORIGIN), {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

describe("a feedback note", () => {
  it.effect(
    "never reaches a log line or a data point, whether it is kept, refused by the box, or kills it",
    () =>
      Effect.gen(function* noteStaysOut() {
        const lines: string[] = [];
        const site = memoryAnalytics();
        const kept: (typeof FeedbackNoteSchema.Encoded)[] = [];
        const answers: number[] = [];

        const capture = Logger.make((entry) => {
          lines.push(Logger.formatJson.log(entry));
        });

        const sends: readonly (readonly [Box, Request])[] = [
          ["Keeps", post(FEEDBACK_ROUTE, note(MARK), { origin: ORIGIN })],
          ["Refuses", post(FEEDBACK_ROUTE, note(MARK), { origin: ORIGIN })],
          ["Dies", post(FEEDBACK_ROUTE, note(MARK), { origin: ORIGIN })],
          [
            "Keeps",
            post(FEEDBACK_ROUTE, note(`${MARK}\u0007`), { origin: ORIGIN }),
          ],
          [
            "Keeps",
            post(
              FEEDBACK_READ_ROUTE,
              { after: 0, since: 0 },
              { authorization: `Bearer ${SECRET}` }
            ),
          ],
        ];

        for (const [behaviour, request] of sends) {
          const handle = yield* HttpRouter.toHttpEffect(
            feedbackRoutes(boxThat(behaviour, kept), {
              allowedOrigins: [ORIGIN],
              analytics: site.sink,
              limits: unlimited,
              secret: Option.some(Redacted.make(SECRET)),
            })
          );

          const response = yield* handle.pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(request)
            ),
            Effect.provide(Logger.layer([capture]))
          );

          answers.push(HttpServerResponse.toWeb(response).status);
        }

        yield* Effect.yieldNow;

        expect(answers).toEqual([204, 503, 500, 400, 200]);
        expect(lines).toHaveLength(2);
        expect(lines.join("\n")).not.toContain("Kestrel");
        expect(site.points().map(({ point }) => point)).toEqual([
          pointOf(SITE_SCOPE, measure("FeedbackSent", { screen: "Room" })),
          pointOf(
            SITE_SCOPE,
            measure("ServerFault", { fault: "FeedbackBoxFailed" })
          ),
          pointOf(SITE_SCOPE, measure("ServerFault", { fault: "RouteFault" })),
        ]);
      }).pipe(Effect.scoped)
  );
});
