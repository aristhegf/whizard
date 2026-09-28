import { blockedWordIn, type BlockedWord, type NameKind } from "@whizard/protocol";
import { count } from "./analytics";
import type { Env } from "./env";
import { HttpError } from "./http";

/** How long a Worker reuses the blocked words it loaded. */
const CACHE_MS = 30_000;
let cached: { at: number; words: BlockedWord[] } | null = null;

export function forgetBlockedWords() {
  cached = null;
}

/** The blocked words. If the database can't be reached, none, so nobody is locked out. */
export async function blockedWords(env: Env, now = Date.now()): Promise<BlockedWord[]> {
  if (cached && now - cached.at < CACHE_MS) return cached.words;
  try {
    const { results } = await env.DB.prepare("SELECT word, anywhere FROM blocked_words").all<{
      word: string;
      anywhere: number;
    }>();
    const words = results.map((r) => ({ word: r.word, anywhere: r.anywhere === 1 }));
    cached = { at: now, words };
    return words;
  } catch (error) {
    console.error("Couldn’t load blocked words", error);
    return cached?.words ?? [];
  }
}

export const NAME_BLOCKED_MESSAGE = "That name isn’t allowed here. Try another.";

/** The blocked word a name uses, counting it as refused, or null if the name is fine. */
export async function refusedName(env: Env, name: string): Promise<string | null> {
  const word = blockedWordIn(name, await blockedWords(env));
  if (word) await count(env, { names_refused: 1 });
  return word;
}

/** Throws a 400 for a name that uses a blocked word. */
export async function requireAllowedName(env: Env, ...names: string[]): Promise<void> {
  for (const name of names) {
    if (await refusedName(env, name)) {
      throw new HttpError(400, "name_blocked", NAME_BLOCKED_MESSAGE);
    }
  }
}

/** Notes a name someone chose, for the admin Moderation page. Never fails the caller. */
export async function recordName(
  env: Env,
  entry: { name: string; kind: NameKind; target: string; detail: string },
  now = Date.now(),
) {
  try {
    await env.DB.prepare(
      "INSERT INTO recent_names (name, kind, target, detail, at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(entry.name, entry.kind, entry.target, entry.detail, now)
      .run();
  } catch (error) {
    console.error("Couldn’t note a name", error);
  }
}
