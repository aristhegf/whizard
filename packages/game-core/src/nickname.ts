export const NICKNAME_MAX_LENGTH = 20;

/** Tidies a nickname for display, or returns null if nothing usable is left. */
export function normalizeNickname(input: string): string | null {
  const cleaned = input
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...cleaned].length;
  return length >= 1 && length <= NICKNAME_MAX_LENGTH ? cleaned : null;
}

export function sameNickname(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}
