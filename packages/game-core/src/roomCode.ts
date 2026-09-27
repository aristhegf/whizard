import { cryptoRandomBytes, type RandomBytes } from "./ids";

// No 0/O or 1/I/L, so codes read cleanly aloud and on small screens.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

// Largest multiple of the alphabet size that fits in a byte; bytes above it are
// discarded so every character is equally likely.
const UNBIASED_LIMIT = 256 - (256 % ROOM_CODE_ALPHABET.length);

export function generateRoomCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  let code = "";
  const buffer = new Uint8Array(ROOM_CODE_LENGTH * 2);
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of randomBytes(buffer)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

const VALID_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Returns the canonical code for user input like " k7qx2m ", or null if it can't be a room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return VALID_CODE.test(code) ? code : null;
}
