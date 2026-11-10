import { Schema } from "effect";
import type { Runtime, Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";

export const ModelSchema = Schema.Struct({ greeting: Schema.String });

export type Model = typeof ModelSchema.Type;

export const Messages = defineMessageUnion({
  ClickedNothing: { at: Schema.Int },
});

export type Message = typeof Messages.Type;

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { greeting: "Poker night with friends." },
});

export const update = (
  model: Model,
  message: Message
): Update.Return<Model, Message> =>
  Messages.match(message, {
    ClickedNothing: () => ({ model }),
  });

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  body: h.main(
    [h.Class("page")],
    [h.h1([], ["nostakes"]), h.p([], [model.greeting])]
  ),
  title: "nostakes",
});
