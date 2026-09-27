import { DurableObject } from "cloudflare:workers";
import { encode, parseClientMessage, type ServerMessage } from "@whizard/protocol";
import type { Env } from "./env";

/** One instance per room code. Uses the hibernation API so idle rooms aren't billed. */
export class Room extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) {
      send(ws, { type: "error", code: "bad_message", message: "Message was not understood" });
      return;
    }

    switch (message.type) {
      case "ping":
        send(ws, { type: "pong", t: message.t, serverTime: Date.now() });
        return;
    }
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(encode(message));
}
