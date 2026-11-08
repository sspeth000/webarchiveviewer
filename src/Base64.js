/** Dependency-free Base64 codec. Decoding always returns raw bytes. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function decodeBase64(input) {
  if (typeof input !== "string") throw new TypeError("Base64 input must be a string.");
  const text = input.replace(/[\\t\\n\\r ]/g, "");
  if (!text.length) return new Uint8Array(0);
  if (text.length % 4) throw new Error("Invalid Base64 length.");
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const output = new Uint8Array(text.length / 4 * 3 - padding);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    const c = [text.charCodeAt(i), text.charCodeAt(i + 1), text.charCodeAt(i + 2), text.charCodeAt(i + 3)];
    const last = i + 4 === text.length;
    const v = c.map((code, j) => code === 61 && j >= 2 ? 0 : code < 128 ? LOOKUP[code] : -1);
    if (v.some(x => x < 0)) throw new Error("Invalid Base64 character at block " + (i / 4) + ".");
    if ((!last && (c[2] === 61 || c[3] === 61)) || (c[2] === 61 && c[3] !== 61)) throw new Error("Invalid Base64 padding.");
    if (last && c[2] === 61 && (v[1] & 15)) throw new Error("Invalid Base64 padding bits.");
    if (last && c[3] === 61 && c[2] !== 61 && (v[2] & 3)) throw new Error("Invalid Base64 padding bits.");
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    if (out < output.length) output[out++] = (n >>> 16) & 255;
    if (out < output.length) output[out++] = (n >>> 8) & 255;
    if (out < output.length) output[out++] = n & 255;
  }
  return output;
}

export function encodeBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected Uint8Array.");
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], hasB = i + 1 < bytes.length, hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0, c = hasC ? bytes[i + 2] : 0;
    result += ALPHABET[a >> 2];
    result += ALPHABET[((a & 3) << 4) | (b >> 4)];
    result += hasB ? ALPHABET[((b & 15) << 2) | (c >> 6)] : "=";
    result += hasC ? ALPHABET[c & 63] : "=";
  }
  return result;
}
