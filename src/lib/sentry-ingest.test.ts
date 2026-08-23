import { describe, expect, it } from "vitest";
import { sentryIngestOrigin } from "./sentry-ingest";

describe("sentryIngestOrigin", () => {
  it("extrait l'origine https d'un DSN Sentry", () => {
    expect(
      sentryIngestOrigin("https://abc@o4511795017416704.ingest.de.sentry.io/450xxx"),
    ).toBe("https://o4511795017416704.ingest.de.sentry.io");
  });

  it("refuse l'absence, le http, et une chaîne illisible", () => {
    expect(sentryIngestOrigin(undefined)).toBeNull();
    expect(sentryIngestOrigin("")).toBeNull();
    expect(sentryIngestOrigin("http://o1.ingest.sentry.io/1")).toBeNull();
    expect(sentryIngestOrigin("pas-une-url")).toBeNull();
  });
});
