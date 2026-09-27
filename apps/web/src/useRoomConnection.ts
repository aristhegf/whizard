import { encode, parseServerMessage } from "@whizard/protocol";
import { useEffect, useState } from "react";
import { roomSocketUrl } from "./api";

const PING_INTERVAL_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 10_000;

export type ConnectionState =
  | { status: "connecting" }
  | { status: "connected"; latencyMs: number | null }
  | { status: "reconnecting" };

export function useRoomConnection(code: string): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: "connecting" });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(roomSocketUrl(code));

      socket.addEventListener("open", () => {
        attempts = 0;
        setState({ status: "connected", latencyMs: null });
        const ping = () => socket?.send(encode({ type: "ping", t: performance.now() }));
        ping();
        pingTimer = setInterval(ping, PING_INTERVAL_MS);
      });

      socket.addEventListener("message", (event) => {
        const message = parseServerMessage(event.data);
        if (message?.type === "pong") {
          setState({ status: "connected", latencyMs: Math.round(performance.now() - message.t) });
        }
      });

      socket.addEventListener("close", () => {
        clearInterval(pingTimer);
        if (disposed) return;
        setState({ status: "reconnecting" });
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attempts++);
        reconnectTimer = setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      disposed = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [code]);

  return state;
}
