import { describe, expect, it, vi } from "vitest";
import type { AdminUsers } from "@whizard/protocol";
import type { Env } from "./env";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";

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

async function adminEnv(): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = { DB: await testDb() } as unknown as Env;
  await addUser(env.DB, "admin_user");
  await env.DB.prepare("UPDATE users SET is_admin = 1 WHERE id = 'admin_user'").run();
  const cookie = (await createSession(env, "admin_user", Date.now())).split(";")[0]!;
  return { env, headers: { Cookie: cookie, Origin: "http://localhost" } };
}

describe("admin users list & pro management", () => {
  it("rejects unsigned or non-admin requests", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const res = await call(env, "/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("lists accounts with Pro status and expiration", async () => {
    const { env, headers } = await adminEnv();
    const now = Date.now();

    // User 1: Free account
    await addUser(env.DB, "player_free");

    // User 2: Active Pro account for 30 days
    await addUser(env.DB, "player_pro");
    const proExpiry = now + 30 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, ?, 'free', ?)",
    )
      .bind("player_pro", now, proExpiry, now)
      .run();

    // User 3: Lifetime Pro account
    await addUser(env.DB, "player_lifetime");
    await env.DB.prepare(
      "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, NULL, 'free', ?)",
    )
      .bind("player_lifetime", now, now)
      .run();

    // User 4: Expired Pro account
    await addUser(env.DB, "player_expired");
    await env.DB.prepare(
      "INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES (?, ?, ?, 'paid', ?)",
    )
      .bind("player_expired", now - 60 * 24 * 60 * 60 * 1000, now - 1000, now)
      .run();

    const res = await call(env, "/api/admin/users", { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminUsers;

    const freeUser = body.users.find((u) => u.id === "player_free");
    expect(freeUser).toBeDefined();
    expect(freeUser?.isPro).toBe(false);

    const proUser = body.users.find((u) => u.id === "player_pro");
    expect(proUser).toBeDefined();
    expect(proUser?.isPro).toBe(true);
    expect(proUser?.proUntil).toBe(proExpiry);

    const lifetimeUser = body.users.find((u) => u.id === "player_lifetime");
    expect(lifetimeUser).toBeDefined();
    expect(lifetimeUser?.isPro).toBe(true);
    expect(lifetimeUser?.proUntil).toBeNull();

    const expiredUser = body.users.find((u) => u.id === "player_expired");
    expect(expiredUser).toBeDefined();
    expect(expiredUser?.isPro).toBe(false);
  });

  it("filters accounts by username search query", async () => {
    const { env, headers } = await adminEnv();
    await addUser(env.DB, "target_player");
    await addUser(env.DB, "other_account");

    const res = await call(env, "/api/admin/users?q=target", { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminUsers;

    expect(body.users.some((u) => u.username === "target_player")).toBe(true);
    expect(body.users.some((u) => u.username === "other_account")).toBe(false);
  });

  it("allows granting and ending Pro seamlessly via admin endpoints", async () => {
    const { env, headers } = await adminEnv();
    await addUser(env.DB, "test_grant_user");

    // Initially free
    let res = await call(env, "/api/admin/users?q=test_grant_user", { headers });
    let body = (await res.json()) as AdminUsers;
    expect(body.users[0]?.isPro).toBe(false);

    // Grant 1 month Pro
    const grantRes = await call(env, "/api/admin/pro", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test_grant_user", months: 1 }),
    });
    expect(grantRes.status).toBe(200);

    // Verify user is now Pro
    res = await call(env, "/api/admin/users?q=test_grant_user", { headers });
    body = (await res.json()) as AdminUsers;
    expect(body.users[0]?.isPro).toBe(true);
    expect(body.users[0]?.proUntil).toBeGreaterThan(Date.now());

    // End Pro
    const endRes = await call(env, `/api/admin/pro/test_grant_user`, {
      method: "DELETE",
      headers,
    });
    expect(endRes.status).toBe(200);

    // Verify user is now free again
    res = await call(env, "/api/admin/users?q=test_grant_user", { headers });
    body = (await res.json()) as AdminUsers;
    expect(body.users[0]?.isPro).toBe(false);
  });
});
