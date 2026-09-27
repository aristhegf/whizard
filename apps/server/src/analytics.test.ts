import { describe, expect, it } from "vitest";
import { isBot, networkKey, networkPrefix } from "./analytics";

describe("visitor networks", () => {
  it("keeps a whole IPv4 address and the first half of an IPv6 one", () => {
    expect(networkPrefix("102.89.34.7")).toBe("102.89.34.7");
    expect(networkPrefix("2001:db8:85a3:12:8a2e:370:7334:1")).toBe("2001:db8:85a3:12");
    expect(networkPrefix("2001:DB8::1")).toBe("2001:db8:0:0");
    // Only the device part changed, so it's the same network.
    expect(networkPrefix("2c0f:f5c0:4a1:9e00:1111:2222:3333:4444")).toBe(
      networkPrefix("2c0f:f5c0:4a1:9e00:aaaa:bbbb:cccc:dddd"),
    );
  });

  it("ignores addresses that never come from the internet", () => {
    for (const ip of [
      "127.0.0.1",
      "10.2.3.4",
      "192.168.1.9",
      "172.20.0.5",
      "::1",
      "fe80::1",
      "fd00::5",
    ]) {
      expect(networkPrefix(ip)).toBeNull();
    }
    expect(networkPrefix(null)).toBeNull();
    expect(networkPrefix("not an address")).toBeNull();
  });

  it("makes the same code for the same network and browser only", async () => {
    const a = await networkKey("secret", "102.89.34.7", "Mozilla/5.0 (Linux; Android 14)");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await networkKey("secret", "102.89.34.7", "Mozilla/5.0 (Linux; Android 14)")).toBe(a);
    expect(await networkKey("secret", "102.89.34.8", "Mozilla/5.0 (Linux; Android 14)")).not.toBe(
      a,
    );
    expect(await networkKey("other", "102.89.34.7", "Mozilla/5.0 (Linux; Android 14)")).not.toBe(a);
  });

  it("spots crawlers but not phones", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(
      true,
    );
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(
      isBot(
        "Mozilla/5.0 (Linux; Android 14; SM-A155F Build/UP1A; wv) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ),
    ).toBe(false);
  });
});
