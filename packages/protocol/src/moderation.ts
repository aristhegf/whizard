/**
 * Names players choose (room nicknames, account and group names) are checked against a list
 * of blocked words admins keep. Shared, so the admin page can test a name the same way.
 */

export interface BlockedWord {
  word: string;
  /** Match inside other words too ("anywhere"), not only as a word of its own. */
  anywhere: boolean;
}

/** Look-alike characters people use to get round a filter. */
const LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "8": "b",
};

/** Lowercase letters only, accents and look-alikes undone, split into words. */
export function nameWords(text: string): string[] {
  const folded = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0-9!|@$]/g, (c) => LOOKALIKES[c] ?? c);
  return folded.split(/[^a-z]+/).filter(Boolean);
}

/** "baaad" and "bad" match each other. */
const squeeze = (text: string) => text.replace(/(.)\1+/g, "$1");

/** The blocked word a name uses, or null if it's fine. */
export function blockedWordIn(name: string, words: readonly BlockedWord[]): string | null {
  const parts = nameWords(name);
  if (parts.length === 0) return null;
  // Spaced or dotted out ("b a d", "b.a.d") reads as one word.
  const joined = parts.join("");
  const forms = [joined, squeeze(joined)];
  const wholeWords = new Set([...parts, ...parts.map(squeeze), ...forms]);
  for (const { word, anywhere } of words) {
    const target = nameWords(word).join("");
    if (!target) continue;
    const targets = [target, squeeze(target)];
    const hit = anywhere
      ? forms.some((f) => targets.some((t) => f.includes(t)))
      : targets.some((t) => wholeWords.has(t));
    if (hit) return word;
  }
  return null;
}

export type NameKind = "nickname" | "account" | "group";

export interface RecentName {
  id: number;
  name: string;
  kind: NameKind;
  /** Room code for nicknames, @username for accounts and groups. */
  detail: string;
  at: number;
  /** The blocked word it matches, if any. */
  flagged: string | null;
  /** For a nickname: whether that player is still in the room. */
  inRoom: boolean;
}

export interface AdminModeration {
  words: (BlockedWord & { addedAt: number })[];
  names: RecentName[];
  totals: {
    words: number;
    /** Names from the last 7 days that match a blocked word. */
    flagged: number;
    /** Names refused in the last 7 days. */
    refused: number;
    /** Players removed from rooms in the last 7 days. */
    removed: number;
  };
}

export const NAME_ACTIONS = ["remove", "reset"] as const;
export type NameAction = (typeof NAME_ACTIONS)[number];

// Settings -------------------------------------------------------------------------------------

export interface SiteSettings {
  /** A short message shown across the top of every page, or null. */
  announcement: string | null;
  /** Nobody can make a new room; rooms already open keep going. */
  roomsPaused: boolean;
  /** Nobody can create an account; signing in still works. */
  signupsPaused: boolean;
  /** Settings new quiz rooms start with, over the built-in ones; hosts can still change them. */
  quizDefaults: QuizDefaults;
  /** Quiz topics turned off: hidden, and can't be picked or played. */
  topicsOff: string[];
  /** Games turned off: no new rooms for them. */
  gamesOff: string[];
}

export interface QuizDefaults {
  category?: string;
  difficulty?: string;
  count?: number;
  variant?: string;
  timeLimitSeconds?: number;
}

export const ANNOUNCEMENT_MAX = 160;

export interface AdminLogEntry {
  at: number;
  /** The admin's username, or null if their account is gone. */
  admin: string | null;
  action: string;
  target: string;
  /** A username when the target is an account. */
  targetName: string | null;
}

export interface AdminGames {
  settings: SiteSettings;
  /** Finished games over the last 30 and 7 days, by game id. */
  games: { id: string; last30: number; last7: number }[];
  /** Quiz topics: questions in play and finished games over the last 30 days. */
  topics: { id: string; questions: number; last30: number }[];
}

export interface AdminSettings {
  settings: SiteSettings;
  admins: { id: string; username: string; displayName: string; avatar: string | null }[];
  log: AdminLogEntry[];
}
