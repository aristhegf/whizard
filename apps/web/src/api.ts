export async function createRoom(): Promise<string> {
  const response = await fetch("/api/rooms", { method: "POST" });
  if (!response.ok) throw new Error(`Could not create a room (${response.status})`);
  const body = (await response.json()) as { code: string };
  return body.code;
}

export function roomSocketUrl(code: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/rooms/${encodeURIComponent(code)}/ws`;
}
