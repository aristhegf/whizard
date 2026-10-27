import { randomToken } from "@whizard/game-core";
import {
  PRO_MONTHLY_PRICE_NGN,
  PRO_MONTHLY_PRICE_USD,
  checkoutRequestSchema,
  type CheckoutRequest,
  type CheckoutResponse,
} from "@whizard/protocol";
import { countryCode } from "./analytics";
import { addMonths } from "./adminPayments";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { requireUser } from "./account";

const DEFAULT_SANDBOX_URL = "https://sandbox-api.bachs.io";
const DEFAULT_LIVE_URL = "https://api.bachs.io";

/** Check whether a given user has an active Pro membership. */
export async function isProUser(
  db: D1Database,
  userId: string,
  now = Date.now(),
): Promise<boolean> {
  const row = await db
    .prepare("SELECT until FROM pro_memberships WHERE user_id = ? AND (until IS NULL OR until > ?)")
    .bind(userId, now)
    .first<{ until: number | null }>();
  return row !== null;
}

/** Check signature on incoming Bachs webhook using HMAC-SHA256 of `${timestamp}.${rawBody}`. */
export async function verifyBachsWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const data = encoder.encode(`${timestamp}.${rawBody}`);

    // Clean signature header (handles prefixes like 'v1=' or 'sha256=' if present)
    const cleanSig = signature.replace(/^(v1|sha256)=/, "").trim();

    // Check if hex encoded
    let sigBytes: Uint8Array | null = null;
    if (/^[0-9a-fA-F]{64}$/.test(cleanSig)) {
      const bytes = new Uint8Array(cleanSig.length / 2);
      for (let i = 0; i < cleanSig.length; i += 2) {
        bytes[i / 2] = parseInt(cleanSig.slice(i, i + 2), 16);
      }
      sigBytes = bytes;
    } else {
      // Try base64
      try {
        const bin = atob(cleanSig);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        sigBytes = bytes;
      } catch {
        sigBytes = null;
      }
    }

    if (!sigBytes || sigBytes.length === 0) return false;
    return await crypto.subtle.verify("HMAC", key, sigBytes, data);
  } catch {
    return false;
  }
}

/**
 * `GET /api/geo`
 * Returns visitor's detected country and recommended currency and price.
 */
export async function getGeo(context: RequestContext): Promise<Response> {
  const cfCountry = countryCode((context.request.cf as { country?: unknown } | undefined)?.country);
  const isNigeria = cfCountry === "NG";
  return Response.json(
    {
      country: cfCountry,
      currency: isNigeria ? "NGN" : "USD",
      price: isNigeria ? PRO_MONTHLY_PRICE_NGN : PRO_MONTHLY_PRICE_USD,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}

/**
 * `POST /api/payments/bachs/checkout`
 * Creates a hosted checkout session with Bachs and returns the redirect URL.
 */
export async function createBachsCheckout(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const input = await readJson<CheckoutRequest>(context.request, checkoutRequestSchema);

  const apiKey = context.env.BACHS_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "payments_unavailable",
      "Payment processing is currently being configured. Please check back shortly.",
    );
  }

  const isSandbox = apiKey.startsWith("sk_sandbox");
  const baseUrl = context.env.BACHS_API_URL || (isSandbox ? DEFAULT_SANDBOX_URL : DEFAULT_LIVE_URL);

  const origin = new URL(context.request.url).origin;
  const successUrl = `${origin}/pricing?payment=success`;
  const cancelUrl = `${origin}/pricing?payment=cancelled`;

  const currency = input.currency ?? "NGN";
  const amount = currency === "USD" ? "5.00" : "5000.00";

  const sessionPayload = {
    pricing: {
      amount,
      currency,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      username: user.username,
      currency,
    },
  };

  let res: globalThis.Response;
  try {
    res = await fetch(`${baseUrl}/v1/checkout-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionPayload),
    });
  } catch {
    throw new HttpError(
      502,
      "gateway_unreachable",
      "Could not reach payment gateway. Please try again.",
    );
  }

  if (!res.ok) {
    throw new HttpError(
      502,
      "checkout_failed",
      "Could not initialize checkout. Please try again later.",
    );
  }

  const data = (await res.json()) as { checkout_url?: string; checkoutUrl?: string };
  const checkoutUrl = data.checkout_url || data.checkoutUrl;
  if (!checkoutUrl) {
    throw new HttpError(502, "checkout_failed", "Checkout URL missing from gateway response.");
  }

  const response: CheckoutResponse = { checkoutUrl };
  return Response.json(response);
}

/**
 * `POST /api/payments/bachs/webhook`
 * Receives webhook events from Bachs, verifies signature, and credits Pro membership.
 */
export async function handleBachsWebhook(context: RequestContext): Promise<Response> {
  const req = context.request;
  const signature = req.headers.get("X-Bachs-Signature") || req.headers.get("x-bachs-signature");
  const timestamp = req.headers.get("X-Bachs-Timestamp") || req.headers.get("x-bachs-timestamp");

  const rawBody = await req.text();

  const secret = context.env.BACHS_WEBHOOK_SECRET;
  if (secret) {
    if (!signature || !timestamp) {
      throw new HttpError(401, "missing_signature", "Webhook signature or timestamp missing.");
    }
    const valid = await verifyBachsWebhookSignature(secret, timestamp, rawBody, signature);
    if (!valid) {
      throw new HttpError(401, "invalid_signature", "Webhook signature verification failed.");
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "Webhook body is not valid JSON.");
  }

  const eventType = String(event.type || event.event || "");
  const data = (event.data || event) as Record<string, unknown>;
  const metadata = (data.metadata || {}) as Record<string, string | undefined>;

  // Check if this is a completed payment event
  const isPaymentSuccess =
    eventType === "checkout.completed" ||
    eventType === "collection.succeeded" ||
    eventType === "invoice.paid" ||
    eventType === "charge.succeeded";

  if (isPaymentSuccess) {
    const userId = metadata.userId || metadata.user_id;
    if (userId) {
      const now = Date.now();
      const existing = await context.env.DB.prepare(
        "SELECT until FROM pro_memberships WHERE user_id = ?",
      )
        .bind(userId)
        .first<{ until: number | null }>();

      // Base date: if current membership is still active, extend from its until date; else start from now
      const baseDate = existing?.until && existing.until > now ? existing.until : now;
      const newUntil = addMonths(baseDate, 1);

      // Amount & currency from data or metadata
      const rawAmount = data.amount || (data.pricing as { amount?: unknown } | undefined)?.amount;
      const amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount) || 5000;
      const currency = String(
        data.currency ||
          (data.pricing as { currency?: unknown } | undefined)?.currency ||
          metadata.currency ||
          "NGN",
      ).toUpperCase();

      const username = metadata.username || "user";
      const paymentId = String(data.id || `bachs_${randomToken(12)}`);

      await context.env.DB.batch([
        // Upsert pro membership for 1 month
        context.env.DB.prepare(
          `INSERT INTO pro_memberships (user_id, since, until, source, updated_at)
           VALUES (?1, ?2, ?3, 'paid', ?2)
           ON CONFLICT (user_id) DO UPDATE SET
             until = ?3, source = 'paid', updated_at = ?2`,
        ).bind(userId, now, newUntil),
        // Record payment transaction
        context.env.DB.prepare(
          `INSERT INTO payments (id, user_id, username, amount, currency, months, method, note, paid_at, recorded_by)
           VALUES (?1, ?2, ?3, ?4, ?5, 1, 'bachs', ?6, ?7, NULL)
           ON CONFLICT (id) DO NOTHING`,
        ).bind(paymentId, userId, username, amount, currency, `Bachs payment (${eventType})`, now),
      ]);
    }
  }

  return Response.json({ received: true });
}
