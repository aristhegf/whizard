import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { isProUser, verifyBachsWebhookSignature } from "./payments";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";

// The Worker's Durable Object base isn't Node's to load; the routes under test never touch one.
vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const app = (await import("./index")).default;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

async function call(
  env: Env,
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit },
): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init), env, ctx);
}

async function playerEnv(id: string): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = {
    DB: await testDb(),
    BACHS_API_KEY: "sk_sandbox_123",
    BACHS_WEBHOOK_SECRET: "whsec_test",
  } as unknown as Env;
  await addUser(env.DB, id);
  const cookie = (await createSession(env, id, Date.now())).split(";")[0]!;
  return { env, headers: { Cookie: cookie, Origin: "http://localhost" } };
}

describe("isProUser", () => {
  it("returns false for non-member", async () => {
    const db = await testDb();
    await addUser(db, "u1");
    expect(await isProUser(db, "u1")).toBe(false);
  });

  it("returns false for expired member", async () => {
    const db = await testDb();
    await addUser(db, "u2");
    const past = Date.now() - 10000;
    await db
      .prepare(
        "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, ?, 'paid', ?)",
      )
      .bind("u2", past - 100000, past, past)
      .run();

    expect(await isProUser(db, "u2")).toBe(false);
  });

  it("returns true for active member", async () => {
    const db = await testDb();
    await addUser(db, "u3");
    const future = Date.now() + 1000000;
    await db
      .prepare(
        "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, ?, 'paid', ?)",
      )
      .bind("u3", Date.now(), future, Date.now())
      .run();

    expect(await isProUser(db, "u3")).toBe(true);
  });

  it("returns true for lifetime member (until is null)", async () => {
    const db = await testDb();
    await addUser(db, "u4");
    await db
      .prepare(
        "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, NULL, 'free', ?)",
      )
      .bind("u4", Date.now(), Date.now())
      .run();

    expect(await isProUser(db, "u4")).toBe(true);
  });
});

describe("verifyBachsWebhookSignature", () => {
  it("verifies matching HMAC signature", async () => {
    const secret = "my_secret_key";
    const timestamp = "1729000000";
    const rawBody = JSON.stringify({ event: "checkout.completed", data: { id: "chk_1" } });

    // Compute expected HMAC in node
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${rawBody}`),
    );
    const sigHex = [...new Uint8Array(sigBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifyBachsWebhookSignature(secret, timestamp, rawBody, sigHex)).toBe(true);
    expect(await verifyBachsWebhookSignature(secret, timestamp, rawBody, `sha256=${sigHex}`)).toBe(
      true,
    );
    expect(await verifyBachsWebhookSignature("wrong_secret", timestamp, rawBody, sigHex)).toBe(
      false,
    );
    expect(await verifyBachsWebhookSignature(secret, "wrong_time", rawBody, sigHex)).toBe(false);
  });
});

describe("getGeo endpoint", () => {
  it("defaults to USD for non-NG visitors", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const res = await call(env, "/api/geo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currency: string; price: number };
    expect(body.currency).toBe("USD");
    expect(body.price).toBe(5);
  });
});

describe("createBachsCheckout", () => {
  it("fails if user is not signed in", async () => {
    const env = { DB: await testDb(), BACHS_API_KEY: "sk_sandbox_test" } as unknown as Env;
    const res = await call(env, "/api/payments/bachs/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ currency: "NGN" }),
    });
    expect(res.status).toBe(401);
  });

  it("initiates checkout with Bachs and returns checkoutUrl", async () => {
    const { env, headers } = await playerEnv("buyer_1");

    // Mock fetch to simulate Bachs API
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("bachs.io")) {
        return new Response(
          JSON.stringify({ checkout_url: "https://sandbox-checkout.bachs.io/pay_xyz" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return originalFetch(url);
    });

    try {
      const res = await call(env, "/api/payments/bachs/checkout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "NGN" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { checkoutUrl: string };
      expect(body.checkoutUrl).toBe("https://sandbox-checkout.bachs.io/pay_xyz");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("handleBachsWebhook", () => {
  it("credits Pro membership on checkout.completed", async () => {
    const db = await testDb();
    await addUser(db, "customer_1");

    const secret = "test_webhook_secret";
    const env = { DB: db, BACHS_WEBHOOK_SECRET: secret } as unknown as Env;

    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = {
      type: "checkout.completed",
      data: {
        id: "tx_12345",
        amount: 5000,
        currency: "NGN",
        metadata: {
          userId: "customer_1",
          username: "customer_1",
        },
      },
    };
    const rawBody = JSON.stringify(payload);

    // Compute signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${rawBody}`),
    );
    const sigHex = [...new Uint8Array(sigBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const res = await call(env, "/api/payments/bachs/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bachs-Signature": sigHex,
        "X-Bachs-Timestamp": timestamp,
      },
      body: rawBody,
    });

    expect(res.status).toBe(200);

    // Verify user is now Pro
    expect(await isProUser(db, "customer_1")).toBe(true);

    // Verify payment record
    const payment = await db
      .prepare("SELECT * FROM payments WHERE user_id = ?")
      .bind("customer_1")
      .first();
    expect(payment).not.toBeNull();
  });
});
