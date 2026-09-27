import { describe, expect, it } from "vitest";
import { isPushService } from "./push";

describe("push endpoints", () => {
  it("accepts the browsers' push services", () => {
    expect(isPushService("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushService("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushService("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushService("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isPushService("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushService("https://example.com/push")).toBe(false);
    expect(isPushService("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isPushService("https://evilpush.apple.com.example/x")).toBe(false);
    expect(isPushService("not a url")).toBe(false);
  });
});
