export type RandomBytes = (buffer: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

export const cryptoRandomBytes: RandomBytes = (buffer) => crypto.getRandomValues(buffer);

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** URL-safe random string with `byteLength * 8` bits of entropy. */
export function randomToken(
  byteLength: number,
  randomBytes: RandomBytes = cryptoRandomBytes,
): string {
  const bytes = randomBytes(new Uint8Array(byteLength));
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += BASE64URL[(value >> bits) & 63];
    }
  }
  if (bits > 0) out += BASE64URL[(value << (6 - bits)) & 63];
  return out;
}
