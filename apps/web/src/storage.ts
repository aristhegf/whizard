// localStorage can be unavailable (private browsing, blocked storage), so every access
// is guarded and the app keeps working without it.

const NICKNAME_KEY = "whizard:nickname";
const SESSIONS_KEY = "whizard:sessions";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RoomSession {
  sessionToken: string;
  nickname: string;
  savedAt: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session just won't survive a reload.
  }
}

export function loadNickname(): string {
  return read<string>(NICKNAME_KEY) ?? "";
}

export function saveNickname(nickname: string): void {
  write(NICKNAME_KEY, nickname);
}

function loadSessions(): Record<string, RoomSession> {
  const sessions = read<Record<string, RoomSession>>(SESSIONS_KEY) ?? {};
  const cutoff = Date.now() - SESSION_MAX_AGE_MS;
  return Object.fromEntries(Object.entries(sessions).filter(([, s]) => s.savedAt > cutoff));
}

export function loadSession(code: string): RoomSession | null {
  return loadSessions()[code] ?? null;
}

export function saveSession(code: string, session: Omit<RoomSession, "savedAt">): void {
  write(SESSIONS_KEY, { ...loadSessions(), [code]: { ...session, savedAt: Date.now() } });
}

export function clearSession(code: string): void {
  const sessions = loadSessions();
  delete sessions[code];
  write(SESSIONS_KEY, sessions);
}
