import { generateRoomCode, normalizeRoomCode } from "@whizard/game-core";
import { PROTOCOL_VERSION } from "@whizard/protocol";
import type { Env } from "./env";

export { Room } from "./room";

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/ws$/;

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
    }

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return jsonError(405, "method_not_allowed", "Use POST");
      return Response.json({ code: generateRoomCode() }, { status: 201 });
    }

    const socketMatch = ROOM_SOCKET_PATH.exec(url.pathname);
    if (socketMatch) {
      const code = normalizeRoomCode(decodeURIComponent(socketMatch[1] ?? ""));
      if (!code) return jsonError(400, "invalid_room_code", "That isn't a valid room code");
      if (request.headers.get("Upgrade") !== "websocket") {
        return jsonError(426, "upgrade_required", "Expected a WebSocket upgrade");
      }
      return env.ROOMS.getByName(code).fetch(request);
    }

    return jsonError(404, "not_found", "Not found");
  },
} satisfies ExportedHandler<Env>;
