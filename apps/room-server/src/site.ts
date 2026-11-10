import { Schema } from "effect";

export const ZONE = "nostakes.club";

export const SITE_HOSTS = {
  preview: `preview.${ZONE}`,
  production: ZONE,
} as const;

export const SiteStageSchema = Schema.Literals(["production", "preview"]);

export type SiteStage = typeof SiteStageSchema.Type;

export class UnknownSiteStage extends Schema.TaggedError<
  UnknownSiteStage,
  { readonly brand: unique symbol }
>()("UnknownSiteStage", { stage: Schema.String }) {
  override get message() {
    return `The site has no stage named '${this.stage}'. Deploy with --stage production or --stage preview.`;
  }
}

export const siteOrigin = (stage: SiteStage) => `https://${SITE_HOSTS[stage]}`;

export const WEB_ASSETS = "../web/dist";

export const ROOM_ROUTES = ["/rooms", "/rooms/*"];
