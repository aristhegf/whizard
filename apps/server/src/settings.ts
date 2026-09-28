import type { SiteSettings } from "@whizard/protocol";
import type { Env } from "./env";
import type { RequestContext } from "./http";

export const DEFAULT_SETTINGS: SiteSettings = {
  announcement: null,
  roomsPaused: false,
  signupsPaused: false,
  quizDefaults: {},
  topicsOff: [],
  gamesOff: [],
};

function json<T>(value: string | undefined, fallback: T, valid: (v: unknown) => boolean): T {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return valid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

const stringList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

const CACHE_MS = 15_000;
let cached: { at: number; settings: SiteSettings } | null = null;

export function forgetSettings() {
  cached = null;
}

/** The site switches. If the database can't be reached, the defaults: everything open. */
export async function siteSettings(env: Env, now = Date.now()): Promise<SiteSettings> {
  if (cached && now - cached.at < CACHE_MS) return cached.settings;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM site_settings").all<{
      key: string;
      value: string;
    }>();
    const values = new Map(results.map((r) => [r.key, r.value]));
    const settings: SiteSettings = {
      announcement: values.get("announcement") || null,
      roomsPaused: values.get("rooms_paused") === "1",
      signupsPaused: values.get("signups_paused") === "1",
      quizDefaults: json(values.get("quiz_defaults"), {}, (v) => typeof v === "object" && !!v),
      topicsOff: json(values.get("topics_off"), [], stringList),
      gamesOff: json(values.get("games_off"), [], stringList),
    };
    cached = { at: now, settings };
    return settings;
  } catch (error) {
    console.error("Couldn’t load site settings", error);
    return cached?.settings ?? DEFAULT_SETTINGS;
  }
}

/** `GET /api/site`: what every page needs to know, such as an announcement. */
export async function getSite({ env }: RequestContext): Promise<Response> {
  return Response.json(await siteSettings(env), {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
