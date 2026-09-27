import { DurableObject } from "cloudflare:workers";
import { parsePresenceClientMessage, type PresenceServerMessage } from "@whizard/protocol";
import {
  countryCode,
  recordOnlinePeak,
  recordVisit,
  count,
  visitorTotal,
  dayOf,
} from "./analytics";
import type { Env } from "./env";

/** The Worker sets this from Cloudflare's own lookup; anything a client sends is dropped. */
export const COUNTRY_HEADER = "X-Whizard-Country";

/** How long to gather joins and leaves before telling everyone the new count. */
const BROADCAST_DELAY_MS = 2_000;
/** How often to look for connections that have gone quiet. */
const SWEEP_INTERVAL_MS = 60_000;
/** Tabs ping every 30 seconds; one that misses a few is treated as gone. */
const STALE_AFTER_MS = 150_000;

/** Longer than this, a visit is counted as this long: likely a tab left open. */
const MAX_VISIT_MS = 4 * 60 * 60_000;

const OPEN = 1;
const VISITORS_KEY = "visitors";
const PEAK_KEY = "peak";

interface SocketAttachment {
  visitor: string | null;
  country: string | null;
  connectedAt: number;
  /** The socket a page load opened first, as opposed to a reconnect. */
  firstSocket?: boolean;
  /** Its time has been added to the visit-length stats. */
  ended?: boolean;
}

/**
 * One instance for the whole site. Each open tab holds a WebSocket here, which gives the live
 * "here now" count, and its first message records the visit. Sockets hibernate between
 * messages, and pings are answered without waking this object.
 */
export class Presence extends DurableObject<Env> {
  private visitorCount: number | undefined;
  private lastSent = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      visitor: null,
      country: countryCode(request.headers.get(COUNTRY_HEADER)),
      connectedAt: Date.now(),
    } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parsePresenceClientMessage(data);
    const attachment = attachmentOf(ws);
    if (!message || !attachment) return;

    if (message.type === "view") {
      if (attachment.visitor) await count(this.env, { [`page:${message.page}`]: 1 });
      return;
    }

    // One hello per socket, so a socket can't count itself as many visitors.
    if (attachment.visitor) return;
    ws.serializeAttachment({
      ...attachment,
      visitor: message.visitor,
      firstSocket: message.newVisit,
    } satisfies SocketAttachment);
    await this.total();
    const isNew = await recordVisit(this.env, {
      visitor: message.visitor,
      page: message.page,
      device: message.device,
      source: message.source,
      country: attachment.country,
      newVisit: message.newVisit,
    });
    if (isNew) {
      this.visitorCount = (this.visitorCount ?? 0) + 1;
      await this.ctx.storage.put(VISITORS_KEY, this.visitorCount);
    }
    send(ws, this.counts());
    await this.scheduleBroadcast();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.endVisit(ws, Date.now());
    await this.scheduleBroadcast();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.endVisit(ws, Date.now());
    await this.scheduleBroadcast();
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime();
      const since = last ?? attachmentOf(ws)?.connectedAt ?? 0;
      if (ws.readyState === OPEN && now - since > STALE_AFTER_MS) {
        // The tab went quiet at its last ping, so the visit ended then.
        await this.endVisit(ws, since);
        ws.close(1000, "Idle");
      }
    }

    await this.total();
    const counts = this.counts();
    const encoded = JSON.stringify(counts);
    if (encoded !== this.lastSent) {
      this.lastSent = encoded;
      for (const ws of this.openSockets()) ws.send(encoded);
    }
    await this.recordPeak(counts.online, now);

    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    }
  }

  /** Adds how long a socket was open to the visit-length stats, once per socket. */
  private async endVisit(ws: WebSocket, endedAt: number) {
    const attachment = attachmentOf(ws);
    if (!attachment?.visitor || attachment.ended) return;
    try {
      ws.serializeAttachment({ ...attachment, ended: true } satisfies SocketAttachment);
    } catch {
      // Already closed: this is its last event anyway.
    }
    const ms = Math.min(Math.max(endedAt - attachment.connectedAt, 0), MAX_VISIT_MS);
    await count(this.env, {
      visit_seconds: Math.round(ms / 1000),
      ...(attachment.firstSocket ? { visits_ended: 1 } : {}),
    });
  }

  private async scheduleBroadcast() {
    const next = Date.now() + BROADCAST_DELAY_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }

  /** The running visitor total, loaded from storage (or counted, the very first time). */
  private async total(): Promise<number> {
    if (this.visitorCount === undefined) {
      const saved = await this.ctx.storage.get<number>(VISITORS_KEY);
      const value = saved ?? (await visitorTotal(this.env));
      this.visitorCount ??= value;
      if (saved === undefined) await this.ctx.storage.put(VISITORS_KEY, this.visitorCount);
    }
    return this.visitorCount;
  }

  private counts(): PresenceServerMessage {
    const visitors = new Set<string>();
    for (const ws of this.openSockets()) {
      const visitor = attachmentOf(ws)?.visitor;
      if (visitor) visitors.add(visitor);
    }
    return { type: "presence", online: visitors.size, visitors: this.visitorCount ?? 0 };
  }

  private openSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === OPEN && attachmentOf(ws)?.visitor);
  }

  private async recordPeak(online: number, now: number) {
    const day = dayOf(now);
    const peak = await this.ctx.storage.get<{ day: string; online: number }>(PEAK_KEY);
    if (peak?.day === day && peak.online >= online) return;
    await this.ctx.storage.put(PEAK_KEY, { day, online });
    await recordOnlinePeak(this.env, online, now);
  }
}

function attachmentOf(ws: WebSocket): SocketAttachment | null {
  return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
}

function send(ws: WebSocket, message: PresenceServerMessage): void {
  ws.send(JSON.stringify(message));
}
