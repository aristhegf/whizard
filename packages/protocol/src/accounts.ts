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

/** The avatar pictures players can choose from. */
export const AVATAR_IDS = [
  "a01",
  "a02",
  "a03",
  "a04",
  "a05",
  "a06",
  "a07",
  "a08",
  "a09",
  "a10",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export const avatarSchema = z.enum(AVATAR_IDS);

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
  avatar: AvatarId | null;
  /** Show the answer's explanation during group games too, not only when playing solo. */
  showExplanations: boolean;
  /** Whether friends can ping this account at all. */
  pings: boolean;
  /** No pings between these times, in minutes after midnight in `timeZone`. */
  quietHours: QuietHours | null;
  createdAt: number;
}

export interface QuietHours {
  start: number;
  end: number;
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

const minuteOfDay = z
  .number()
  .int()
  .min(0)
  .max(24 * 60 - 1);

export const accountUpdateSchema = z
  .object({
    displayName: z.string().max(100),
    avatar: avatarSchema,
    showExplanations: z.boolean(),
    pings: z.boolean(),
    quietHours: z.object({ start: minuteOfDay, end: minuteOfDay }).nullable(),
    /** IANA time zone for quiet hours, e.g. "Africa/Lagos". */
    timeZone: z.string().max(64),
  })
  .partial();

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({ p256dh: z.string().max(256), auth: z.string().max(64) }),
});

export const pingRequestSchema = z.object({ room: z.string().max(16) });

export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

export interface MatchPlayer {
  nickname: string;
  avatar: AvatarId | null;
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

export interface PublicUser {
  username: string;
  displayName: string;
  avatar: AvatarId | null;
}

export type Relation = "self" | "friend" | "incoming" | "outgoing" | "none";

export interface Friend extends PublicUser {
  since: number;
  /** Games you both finished, and how often each of you placed higher. */
  record: { games: number; wins: number; losses: number };
  muted: boolean;
}

export interface FriendsList {
  friends: Friend[];
  /** People asking to be your friend. */
  incoming: PublicUser[];
  /** Requests you've sent that are still waiting. */
  outgoing: PublicUser[];
}

export const GROUP_NAME_MAX_LENGTH = 30;
export const GROUP_MAX_MEMBERS = 16;

export interface FriendGroup {
  id: string;
  name: string;
  owner: string;
  members: PublicUser[];
}

export interface GroupStanding extends PublicUser {
  /** Games at least two members finished together. */
  games: number;
  /** How many of those this member placed highest in. */
  wins: number;
}

export const groupRequestSchema = z.object({
  name: z.string().max(100),
  /** Usernames, not counting the owner. They must all be the owner's friends. */
  members: z.array(z.string().max(40)).max(GROUP_MAX_MEMBERS),
});

export const friendRequestSchema = z.object({ username: z.string().max(40) });

export const friendUpdateSchema = z.object({ muted: z.boolean() });

export interface ApiErrorBody {
  error: { code: string; message: string };
}
