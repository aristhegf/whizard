/** The longest name, counted in characters as people see them: an emoji counts as one. */
export const NICKNAME_MAX_LENGTH = 20;

/**
 * A limit for name inputs. The browser counts `maxLength` in UTF-16 units, where one emoji can
 * take up to a dozen, so this only stops pasted essays. The real limit is NICKNAME_MAX_LENGTH.
 */
export const NICKNAME_INPUT_MAX_LENGTH = 100;

/**
 * Invisible and control characters, which could hide or disguise a name. The one exception is
 * the zero-width joiner inside an emoji, which glues 🧙‍♂️ or 👨‍👩‍👧 together.
 */
const HIDDEN =
  /(?!(?<=\p{Extended_Pictographic}[️\p{Emoji_Modifier}]?)‍(?=\p{Extended_Pictographic}))[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** How many characters a name looks like it has. */
export function nicknameLength(name: string): number {
  return [...graphemes.segment(name)].length;
}

/** Tidies a nickname for display, or returns null if nothing usable is left. */
export function normalizeNickname(input: string): string | null {
  const cleaned = input.normalize("NFC").replace(HIDDEN, "").replace(/\s+/g, " ").trim();
  const length = nicknameLength(cleaned);
  return length >= 1 && length <= NICKNAME_MAX_LENGTH ? cleaned : null;
}

export function sameNickname(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}
