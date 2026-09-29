import { randomToken } from "@whizard/game-core";

// localStorage can be unavailable (private browsing, blocked storage), so every access
// is guarded and the app keeps working without it.

const NICKNAME_KEY = "whizard:nickname";
const GUEST_ID_KEY = "whizard:guest";
const VISITOR_ID_KEY = "whizard:visitor";
const AVATAR_KEY = "whizard:avatar";
const MY_AVATAR_KEY = "whizard:my-avatar";
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

/**
 * A random ID for this browser, sent when joining a room. If the player creates an account
 * later, games played with it in the past week move to the account.
 */
export function guestId(): string {
  const saved = read<string>(GUEST_ID_KEY);
  if (saved) return saved;
  const id = randomToken(18);
  write(GUEST_ID_KEY, id);
  return id;
}

/**
 * A separate random ID for the site's visitor count. It's never sent with anything else, so
 * the stats can't be tied to games or accounts.
 */
export function visitorId(): string {
  const saved = read<string>(VISITOR_ID_KEY);
  if (saved) return saved;
  const id = randomToken(18);
  write(VISITOR_ID_KEY, id);
  return id;
}

/** The avatar picked when joining a room, reused next time. */
export function loadAvatar(): string | null {
  return read<string>(AVATAR_KEY);
}

export function saveAvatar(avatar: string): void {
  write(AVATAR_KEY, avatar);
}

/** The avatar made in the avatar creator, kept even while a built-in one is picked. */
export function loadMyAvatar(): string | null {
  return read<string>(MY_AVATAR_KEY);
}

export function saveMyAvatar(avatar: string): void {
  write(MY_AVATAR_KEY, avatar);
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

/** The room this browser was in most recently, if its session is still fresh. */
export function latestSession(): (RoomSession & { code: string }) | null {
  let latest: (RoomSession & { code: string }) | null = null;
  for (const [code, session] of Object.entries(loadSessions())) {
    if (!latest || session.savedAt > latest.savedAt) latest = { ...session, code };
  }
  return latest;
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

const DISMISSED_KEY = "whizard:dismissed-announcement";

/** The announcement this browser closed, so it stays closed until there's a new one. */
export function dismissedAnnouncement(): string | null {
  return read<string>(DISMISSED_KEY);
}

export function dismissAnnouncement(text: string): void {
  write(DISMISSED_KEY, text);
}

const SEEN_HINTS_KEY = "whizard:seen-hints";

/** Heading hints this browser has already been shown once, on its own. */
export function hintSeen(id: string): boolean {
  return (read<string[]>(SEEN_HINTS_KEY) ?? []).includes(id);
}

export function markHintSeen(id: string): void {
  const seen = read<string[]>(SEEN_HINTS_KEY) ?? [];
  if (!seen.includes(id)) write(SEEN_HINTS_KEY, [...seen, id]);
}
