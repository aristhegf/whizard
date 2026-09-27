import { z } from "zod";

// Shapes shared by the account HTTP API and the web app.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "help",
  "me",
  "moderator",
  "null",
  "root",
  "staff",
  "support",
  "system",
  "undefined",
  "whizard",
]);

export type UsernameProblem = "length" | "characters" | "reserved";

/** Usernames are lowercase handles: a letter, then letters, digits or underscores. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function usernameProblem(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return "length";
  }
  if (!USERNAME_PATTERN.test(username)) return "characters";
  if (RESERVED_USERNAMES.has(username)) return "reserved";
  return null;
}

export interface AccountUser {
  id: string;
  username: string;
  displayName: string;
  /** Show the answer's explanation during group games too, not only when playing solo. */
  showExplanations: boolean;
  createdAt: number;
}

export interface AccountPasskey {
  id: string;
  name: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export const signUpRequestSchema = z.object({
  username: z.string().max(40),
  displayName: z.string().max(100),
  /** Confirms they are 13 or older and accept the privacy policy. */
  agreed: z.literal(true),
});

export const accountUpdateSchema = z
  .object({
    displayName: z.string().max(100),
    showExplanations: z.boolean(),
  })
  .partial();

export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

export interface MatchPlayer {
  nickname: string;
  /** Set for players with an account. */
  username: string | null;
  placing: number;
  score: number;
  isMe: boolean;
}

export interface MatchRecord {
  id: string;
  game: string;
  category: string | null;
  difficulty: string | null;
  mode: string | null;
  rounds: number;
  finishedAt: number;
  /** Your own correct answers. Nobody else's are shown. */
  myCorrect: number | null;
  players: MatchPlayer[];
}

export interface CategoryStat {
  category: string;
  games: number;
  /** Share of questions answered correctly, 0 to 1. */
  accuracy: number;
}

export interface PlayerStats {
  played: number;
  /** Games with at least one other player. */
  groupGames: number;
  wins: number;
  categories: CategoryStat[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
