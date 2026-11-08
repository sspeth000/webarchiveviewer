/** Decoder for Apple's bplist00 binary property-list format. */
import { ByteReader } from "./ByteReader.js";

const HEADER = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30];
const APPLE_EPOCH = Date.UTC(2001, 0, 1);

export function parsePlistBinary(input) {
  const source = new ByteReader(input);
  if (source.length < 40) throw new Error("Binary plist is too short.");
  for (let i = 0; i < 8; i++) if (source.bytes[i] !== HEADER[i]) throw new Error("Invalid bplist00 header.");

  const trailerAt = source.length - 32;
  const t = new ByteReader(source.slice(trailerAt));
  t.skip(6);
  const offsetSize = t.readByte(), refSize = t.readByte();
  const objectCount = t.readUIntBE(8, true), topObject = t.readUIntBE(8, true), tableAt = t.readUIntBE(8, true);
  if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) throw new Error("Invalid plist integer widths.");
  if (!objectCount || objectCount > BigInt(Number.MAX_SAFE_INTEGER) || topObject >= objectCount) throw new Error("Invalid plist object count or root reference.");
  if (tableAt > BigInt(trailerAt)) throw new Error("Offset table starts beyond trailer.");

  const count = Number(objectCount), tableStart = Number(tableAt), tableLength = count * offsetSize;
  if (!Number.isSafeInteger(tableLength) || tableStart + tableLength > trailerAt) throw new Error("Truncated offset table.");
  const table = new ByteReader(source.slice(tableStart, tableStart + tableLength));
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const off = table.readUIntBE(offsetSize, true);
    if (off >= tableAt || off > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid object offset.");
    offsets.push(Number(off));
  }

  const cache = new Array(count), active = new Set();
  function objectAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error("Invalid object reference: " + index);
    if (cache[index] !== undefined) return cache[index];
    if (active.has(index)) throw new Error("Circular object reference: " + index);
    active.add(index);
    try { return (cache[index] = decode(offsets[index])); }
    finally { active.delete(index); }
  }

  function decode(offset) {
    const r = new ByteReader(source.slice(offset, tableStart));
    const marker = r.readByte(), kind = marker >> 4, info = marker & 15;
    switch (kind) {
      case 0:
        if (info === 0) return null;
        if (info === 8) return false;
        if (info === 9) return true;
        if (info === 15) return undefined;
        throw new Error("Unsupported simple marker: " + marker);
      case 1: { const width = 2 ** info; if (width > 8) throw new Error("Integer too wide."); return r.readIntBE(width); }
      case 2: { const width = 2 ** info; if (width === 4) return r.readFloat32BE(); if (width === 8) return r.readFloat64BE(); throw new Error("Unsupported real width."); }
      case 3: { if (info !== 3) throw new Error("Invalid date marker."); return new Date(APPLE_EPOCH + r.readFloat64BE() * 1000); }
      case 4: { const n = length(r, info); return r.readBytes(n); }
      case 5: { const n = length(r, info); return ascii(r.readBytes(n)); }
      case 6: { const n = length(r, info), b = r.readBytes(n * 2); return utf16be(b); }
      case 8: { const width = info + 1; if (width > 8) throw new Error("UID too wide."); return { type: "UID", value: r.readUIntBE(width) }; }
      case 10: case 11: case 12: { const n = length(r, info); return refs(r, n, refSize).map(objectAt); }
      case 13: {
        const n = length(r, info), keys = refs(r, n, refSize), vals = refs(r, n, refSize), out = Object.create(null);
        for (let i = 0; i < n; i++) {
          const key = objectAt(keys[i]);
          if (typeof key !== "string") throw new Error("Dictionary key is not a string.");
          if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error("Duplicate dictionary key: " + key);
          out[key] = objectAt(vals[i]);
        }
        return out;
      }
      default: throw new Error("Unsupported binary plist object kind: " + kind);
    }
  }
  return objectAt(Number(topObject));
}

function length(r, info) {
  if (info < 15) return info;
  const marker = r.readByte();
  if ((marker >> 4) !== 1) throw new Error("Extended length is not an integer.");
  const width = 2 ** (marker & 15);
  if (width > 8) throw new Error("Extended length integer too wide.");
  const n = r.readUIntBE(width, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Object length too large.");
  return Number(n);
}
function refs(r, count, width) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = r.readUIntBE(width, true);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Object reference too large.");
    out.push(Number(n));
  }
  return out;
}
function ascii(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return s; }
function utf16be(bytes) {
  if (bytes.length % 2) throw new Error("Odd UTF-16BE byte length.");
  let s = "";
  for (let i = 0; i < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}
