/** Minimal XML plist parser. No DOMParser, DTD resolution, or external entities. */
import { decodeBase64 } from "./Base64.js";

export function parsePlistXML(input) {
  const source = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  const p = new Parser(source);
  p.misc();
  const root = p.element();
  if (root.name !== "plist") throw new SyntaxError("Expected <plist> root element.");
  const value = root.children.find(x => x && typeof x === "object" && x.name);
  if (!value) throw new SyntaxError("Plist contains no value.");
  p.misc();
  if (p.i < source.length) throw new SyntaxError("Unexpected trailing XML content.");
  return convert(value);
}

class Parser {
  constructor(s) { this.s = s; this.i = 0; }
  starts(x) { return this.s.startsWith(x, this.i); }
  ws() { while (this.i < this.s.length && /\\s/.test(this.s[this.i])) this.i++; }
  misc() {
    while (true) {
      this.ws();
      if (this.starts("<?")) { const e = this.s.indexOf("?>", this.i + 2); if (e < 0) throw this.err("Unclosed processing instruction"); this.i = e + 2; }
      else if (this.starts("<!--")) { const e = this.s.indexOf("-->", this.i + 4); if (e < 0) throw this.err("Unclosed comment"); this.i = e + 3; }
      else if (/^<!DOCTYPE\\b/i.test(this.s.slice(this.i))) {
        let quote = "", depth = 0;
        while (this.i < this.s.length) {
          const c = this.s[this.i++];
          if (quote) { if (c === quote) quote = ""; }
          else if (c === '"' || c === "'") quote = c;
          else if (c === "[") depth++;
          else if (c === "]") depth--;
          else if (c === ">" && depth <= 0) break;
        }
      } else break;
    }
  }
  name() {
    const start = this.i;
    while (/[A-Za-z0-9_.:-]/.test(this.s[this.i] || "")) this.i++;
    if (start === this.i) throw this.err("Expected XML name");
    return this.s.slice(start, this.i);
  }
  element() {
    this.ws();
    if (this.s[this.i++] !== "<" || this.starts("/")) throw this.err("Expected opening element");
    const name = this.name();
    while (true) {
      this.ws();
      if (this.starts("/>")) { this.i += 2; return { name, text: "", children: [] }; }
      if (this.starts(">")) { this.i++; break; }
      const attr = this.name(); this.ws();
      if (this.s[this.i++] !== "=") throw this.err("Expected attribute equals");
      this.ws();
      const q = this.s[this.i++];
      if (q !== '"' && q !== "'") throw this.err("Expected quoted attribute");
      const end = this.s.indexOf(q, this.i);
      if (end < 0) throw this.err("Unclosed attribute");
      this.i = end + 1;
      if (!attr) throw this.err("Invalid attribute");
    }
    const node = { name, text: "", children: [] };
    while (this.i < this.s.length) {
      if (this.starts("</")) {
        this.i += 2; const close = this.name(); this.ws();
        if (this.s[this.i++] !== ">" || close !== name) throw this.err("Mismatched closing element");
        return node;
      }
      if (this.starts("<!--")) { this.misc(); continue; }
      if (this.starts("<![CDATA[")) {
        this.i += 9; const end = this.s.indexOf("]]>", this.i);
        if (end < 0) throw this.err("Unclosed CDATA");
        node.text += this.s.slice(this.i, end); this.i = end + 3; continue;
      }
      if (this.starts("<?")) { this.misc(); continue; }
      if (this.starts("<!")) throw this.err("Unsupported XML declaration inside plist");
      if (this.starts("<")) node.children.push(this.element());
      else {
        const end = this.s.indexOf("<", this.i), stop = end < 0 ? this.s.length : end;
        node.text += entities(this.s.slice(this.i, stop)); this.i = stop;
      }
    }
    throw this.err("Unclosed <" + name + ">");
  }
  err(message) { return new SyntaxError(message + " at character " + this.i); }
}

function entities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">";
    if (k === "quot") return '"'; if (k === "apos") return "'";
    const n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    if (!Number.isInteger(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new SyntaxError("Invalid XML character reference: " + m);
    return String.fromCodePoint(n);
  });
}

function convert(node) {
  const kids = node.children, text = node.text.trim();
  switch (node.name) {
    case "plist": return kids.length ? convert(kids[0]) : null;
    case "dict": {
      if (kids.length % 2) throw new SyntaxError("Dictionary must contain key/value pairs.");
      const out = Object.create(null);
      for (let i = 0; i < kids.length; i += 2) {
        if (kids[i].name !== "key") throw new SyntaxError("Expected <key> in dictionary.");
        const key = kids[i].text;
        if (Object.prototype.hasOwnProperty.call(out, key)) throw new SyntaxError("Duplicate dictionary key: " + key);
        out[key] = convert(kids[i + 1]);
      }
      return out;
    }
    case "array": return kids.map(convert);
    case "key": case "string": return node.text;
    case "integer": {
      if (!/^[+-]?\\d+$/.test(text)) throw new SyntaxError("Invalid plist integer.");
      const n = BigInt(text);
      return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : n;
    }
    case "real": { const n = Number(text); if (!Number.isFinite(n)) throw new SyntaxError("Invalid plist real."); return n; }
    case "true": return true;
    case "false": return false;
    case "data": return decodeBase64(node.text);
    case "date": { const d = new Date(text); if (Number.isNaN(d.getTime())) throw new SyntaxError("Invalid plist date."); return d; }
    default: throw new SyntaxError("Unsupported plist element <" + node.name + ">.");
  }
}
