import { DEFAULT_QUIZ_SETTINGS, gameModule, typedTextOf, type RoomState } from "@whizard/game-core";
import { blockedWordIn, type BlockedWord, type SiteSettings } from "@whizard/protocol";

export const TOPIC_OFF_MESSAGE = "That topic is turned off for now. Pick another.";
export const GAME_OFF_MESSAGE = "That game is turned off for now. Try again soon.";
/** What every settings write answers with when a topic id names no live topic. */
export const TOPIC_UNAVAILABLE_MESSAGE = "That topic isn't available. Pick another.";
/** What a player hears when something they typed in a game (an Impostor clue) is blocked. */
export const TEXT_BLOCKED_MESSAGE = "That word isn’t allowed here. Try another.";

/**
 * The blocked word in what a player typed in this game action, such as an Impostor clue, or
 * null if the action has no typed text or it's fine. Checked the same way as nicknames.
 */
export function blockedTypedText(
  state: RoomState,
  action: unknown,
  words: readonly BlockedWord[],
): string | null {
  const text = typedTextOf(state, action);
  return text === null ? null : blockedWordIn(text, words);
}

/** The quiz topic in a game's settings, if it has one. */
export function topicOf(settings: unknown): string | null {
  const category = (settings as { category?: unknown } | null)?.category;
  return typeof category === "string" ? category : null;
}

/**
 * A new room's game settings: the built-in ones, then the admins' defaults, then anything the
 * room was made with (such as the topic someone picked). Whatever doesn't fit is left out, and
 * a topic that's off — or that the live catalogue (`topicIds`) no longer holds — is swapped for
 * one that's in it and on, so a dead id never reaches a room's settings.
 */
export function newRoomSettings(
  state: RoomState,
  site: SiteSettings,
  preset: unknown,
  topicIds: readonly string[],
): unknown {
  const schema = gameModule(state.game.id).settingsSchema;
  const base = state.game.settings as Record<string, unknown>;
  const admin = state.game.id === "quiz" ? site.quizDefaults : {};
  const asked = typeof preset === "object" && preset !== null ? preset : {};
  const tries = [
    { ...base, ...admin, ...asked },
    { ...base, ...asked },
    { ...base, ...admin },
    base,
  ];
  let settings: Record<string, unknown> = base;
  for (const attempt of tries) {
    const parsed = schema.safeParse(attempt);
    if (parsed.success) {
      settings = parsed.data as Record<string, unknown>;
      break;
    }
  }
  const topic = topicOf(settings);
  const usable = (id: string | null): id is string =>
    !!id && topicIds.includes(id) && !site.topicsOff.includes(id);
  const isBank =
    typeof (settings as { bankId?: unknown })?.bankId === "string" &&
    Boolean((settings as { bankId?: unknown }).bankId);
  if (!isBank && topic && !usable(topic)) {
    const fallback = [topicOf(admin), ...topicIds].find(usable) ?? DEFAULT_QUIZ_SETTINGS.category;
    settings = { ...settings, category: fallback };
  }
  return settings;
}
