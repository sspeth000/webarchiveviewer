/** ByteReader: bounds-checked big-endian binary reader. */
export class ByteReader {
  constructor(input) {
    if (input instanceof ArrayBuffer) this.bytes = new Uint8Array(input);
    else if (ArrayBuffer.isView(input)) this.bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    else throw new TypeError("Expected an ArrayBuffer or typed-array view.");
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
  }
  get length() { return this.bytes.length; }
  get remaining() { return this.length - this.offset; }
  #check(pos, count) {
    if (!Number.isInteger(pos) || !Number.isInteger(count) || pos < 0 || count < 0 || pos + count > this.length)
      throw new RangeError("Read outside buffer.");
  }
  seek(pos) { this.#check(pos, 0); this.offset = pos; return this; }
  skip(n) { this.#check(this.offset, n); this.offset += n; return this; }
  readByte() { this.#check(this.offset, 1); return this.bytes[this.offset++]; }
  peekByte(pos = this.offset) { this.#check(pos, 1); return this.bytes[pos]; }
  readBytes(n, copy = true) {
    this.#check(this.offset, n);
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return copy ? out.slice() : out;
  }
  readUInt16BE() { this.#check(this.offset, 2); const n = this.view.getUint16(this.offset, false); this.offset += 2; return n; }
  readUInt32BE() { this.#check(this.offset, 4); const n = this.view.getUint32(this.offset, false); this.offset += 4; return n; }
  readUIntBE(width, asBigInt = false) {
    if (!Number.isInteger(width) || width < 1 || width > 8) throw new RangeError("Integer width must be 1-8 bytes.");
    this.#check(this.offset, width);
    let n = 0n;
    for (let i = 0; i < width; i++) n = (n << 8n) | BigInt(this.bytes[this.offset++]);
    if (asBigInt) return n;
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Integer exceeds safe Number range; request BigInt.");
    return Number(n);
  }
  readIntBE(width, asBigInt = false) {
    const u = this.readUIntBE(width, true), bits = BigInt(width * 8), sign = 1n << (bits - 1n);
    const n = (u & sign) ? u - (1n << bits) : u;
    if (asBigInt) return n;
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError("Integer exceeds safe Number range; request BigInt.");
    return Number(n);
  }
  readFloat32BE() { this.#check(this.offset, 4); const n = this.view.getFloat32(this.offset, false); this.offset += 4; return n; }
  readFloat64BE() { this.#check(this.offset, 8); const n = this.view.getFloat64(this.offset, false); this.offset += 8; return n; }
  slice(start, end = this.length, copy = true) {
    this.#check(start, end - start);
    const out = this.bytes.subarray(start, end);
    return copy ? out.slice() : out;
  }
}
