import { useEffect, useState, useSyncExternalStore } from "react";
import { RoomClient, type RoomClientState } from "./roomClient";

/** Connects to a room for as long as the calling component is mounted. Remount to change rooms. */
export function useRoom(code: string): { client: RoomClient; state: RoomClientState } {
  const [client] = useState(() => new RoomClient(code));

  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  const state = useSyncExternalStore(client.subscribe, client.getState);
  return { client, state };
}
