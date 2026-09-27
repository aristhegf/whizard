import { describe, expect, it } from "vitest";
import { sourceName } from "./presence";

describe("visit sources", () => {
  it("prefers a campaign tag", () => {
    expect(sourceName("https://t.co/abc", "WhatsApp Group", "whizard.dev")).toBe("whatsapp-group");
  });

  it("uses the referring site's host", () => {
    expect(sourceName("https://www.google.com/search?q=x", null, "whizard.dev")).toBe("google.com");
    expect(sourceName("https://l.instagram.com/?u=x", "", "whizard.dev")).toBe("l.instagram.com");
  });

  it("ignores links from the site itself and missing referrers", () => {
    expect(sourceName("https://whizard.dev/games", null, "whizard.dev")).toBeNull();
    expect(sourceName("", null, "whizard.dev")).toBeNull();
    expect(sourceName("not a url", "   ", "whizard.dev")).toBeNull();
  });
});
