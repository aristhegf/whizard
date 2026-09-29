import { z } from "zod";

// Shapes shared by the account HTTP API and the web app.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
/** How long after changing a username before it can change again. */
export const USERNAME_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

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
  "a11",
  "a12",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

/**
 * The parts of an avatar made in the avatar creator, in the order its code lists them. A code is
 * "w1" and then one short id per part, joined with dots: "w1.round.4.afro.0…". New parts are only
 * ever added to the end, so older codes stay valid and simply leave the new parts at their default.
 * The server only checks the shape; the web app knows the parts, and draws anything it doesn't
 * know as the default.
 */
export const AVATAR_FIELDS = [
  "face",
  "skin",
  "hair",
  "hairColour",
  "eyes",
  "brows",
  "mouth",
  "facialHair",
  "glasses",
  "earrings",
  "headwear",
  "headwearColour",
  "top",
  "topColour",
  "jacket",
  "jacketColour",
  "headAccessory",
  "faceAccessory",
  "neckAccessory",
  "background",
  "pose",
  "expression",
  "eyeColour",
  "lashes",
  "eyeGap",
] as const;
export type AvatarField = (typeof AVATAR_FIELDS)[number];

const PART_ID_MAX_LENGTH = 16;
/** Room for parts added later, without the server having to change. */
const MAX_AVATAR_PARTS = 32;
export const CUSTOM_AVATAR_MAX_LENGTH = 2 + MAX_AVATAR_PARTS * (PART_ID_MAX_LENGTH + 1);
const CUSTOM_AVATAR_PATTERN = new RegExp(
  `^w1(\\.[a-z0-9-]{1,${PART_ID_MAX_LENGTH}}){1,${MAX_AVATAR_PARTS}}$`,
);

export type CustomAvatar = `w1.${string}`;
/** One of the built-in pictures, or an avatar from the avatar creator. */
export type Avatar = AvatarId | CustomAvatar;

export function isCustomAvatar(value: unknown): value is CustomAvatar {
  return (
    typeof value === "string" &&
    value.length <= CUSTOM_AVATAR_MAX_LENGTH &&
    CUSTOM_AVATAR_PATTERN.test(value)
  );
}

export function isAvatarValue(value: unknown): value is Avatar {
  return (AVATAR_IDS as readonly unknown[]).includes(value) || isCustomAvatar(value);
}

export const avatarSchema = z.custom<Avatar>(isAvatarValue, { message: "Not an avatar" });

export type UsernameProblem = "length" | "characters" | "reserved";

/** Usernames are lowercase handles: a letter, then letters, digits or underscores. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export const USERNAME_PROBLEMS: Record<UsernameProblem, string> = {
  length: "Usernames are 3 to 20 characters.",
  characters: "Use lowercase letters, numbers and underscores, starting with a letter.",
  reserved: "That username isn’t available.",
};

/** When a username last changed at `changedAt` can next change, or null if it can now. */
export function nextUsernameChange(changedAt: number | null, now: number): number | null {
  if (changedAt === null) return null;
  const next = changedAt + USERNAME_CHANGE_INTERVAL_MS;
  return next > now ? next : null;
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
  /** Unique, and how friends find you. Changes at most once every 7 days. */
  username: string;
  /** Shown in games and on leaderboards. Anything, emojis included, and not unique. */
  displayName: string;
  /** When the username last changed, if ever. */
  usernameChangedAt: number | null;
  avatar: Avatar | null;
  /**
   * In solo games, explain each answer straight after it. Otherwise, and always in games with
   * friends, the explanations wait for the results.
   */
  showExplanations: boolean;
  /** After answering a quiz question, wait 3 seconds before the next one instead of 1. */
  pauseAfterAnswer: boolean;
  /** Whether friends can ping this account at all. */
  pings: boolean;
  /** No pings between these times, in minutes after midnight in `timeZone`. */
  quietHours: QuietHours | null;
  /** Chose to be listed by name on the public leaderboard on the stats page. */
  publicLeaderboard: boolean;
  createdAt: number;
  /** Can open the admin dashboard. */
  admin: boolean;
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
    pauseAfterAnswer: z.boolean(),
    pings: z.boolean(),
    quietHours: z.object({ start: minuteOfDay, end: minuteOfDay }).nullable(),
    /** IANA time zone for quiet hours, e.g. "Africa/Lagos". */
    timeZone: z.string().max(64),
    publicLeaderboard: z.boolean(),
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
  avatar: Avatar | null;
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
  avatar: Avatar | null;
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

export const usernameChangeSchema = z.object({ username: z.string().max(40) });

/** Whether a username could be taken, for the live check as someone types. */
export interface UsernameCheck {
  available: boolean;
  /** Why not, when it isn't. */
  reason?: string;
}

export const friendRequestSchema = z.object({ username: z.string().max(40) });

export const friendUpdateSchema = z.object({ muted: z.boolean() });

export interface ApiErrorBody {
  error: { code: string; message: string };
}
