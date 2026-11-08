import { parsePlistXML } from "./src/PlistXML.js";
import { parsePlistBinary } from "./src/PlistBinary.js";

const input = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const results = document.querySelector("#results");
const output = document.querySelector("#output");
const status = document.querySelector("#status");

input.addEventListener("change", () => {
  if (input.files?.[0]) decodeFile(input.files[0]);
});
for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
}
dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0];
  if (file) decodeFile(file);
});
document.querySelector("#clearButton").addEventListener("click", () => {
  input.value = "";
  results.hidden = true;
  output.textContent = "";
});

async function decodeFile(file) {
  results.hidden = false;
  document.querySelector("#fileName").textContent = file.name;
  document.querySelector("#sizeValue").textContent = formatSize(file.size);
  document.querySelector("#formatValue").textContent = "Detecting…";
  document.querySelector("#rootValue").textContent = "—";
  status.textContent = "Decoding";
  output.textContent = "";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let decoded, format;
    if (startsWith(bytes, "bplist00")) {
      format = "Binary plist";
      decoded = parsePlistBinary(bytes);
    } else {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!text.trimStart().startsWith("<?xml") && !text.trimStart().startsWith("<plist") && !text.includes("<plist")) {
        throw new Error("Unrecognized archive. Expected an XML plist or bplist00 binary plist.");
      }
      format = "XML plist";
      decoded = parsePlistXML(text);
    }
    document.querySelector("#formatValue").textContent = format;
    document.querySelector("#rootValue").textContent = Array.isArray(decoded) ? "Array" : decoded instanceof Uint8Array ? "Data" : decoded instanceof Date ? "Date" : decoded === null ? "Null" : typeof decoded;
    output.textContent = JSON.stringify(toDisplayValue(decoded), null, 2);
    status.textContent = "Decoded successfully";
  } catch (error) {
    document.querySelector("#formatValue").textContent = "Unknown";
    document.querySelector("#rootValue").textContent = "Error";
    output.textContent = error instanceof Error ? error.message : String(error);
    status.textContent = "Decode failed";
  }
}

function startsWith(bytes, text) {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false;
  return true;
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}
function toDisplayValue(value) {
  if (value instanceof Uint8Array) return { type: "data", byteLength: value.length, previewHex: Array.from(value.slice(0, 32), b => b.toString(16).padStart(2, "0")).join(" "), truncated: value.length > 32 };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString() + "n";
  if (Array.isArray(value)) return value.map(toDisplayValue);
  if (value && typeof value === "object") {
    const out = Object.create(null);
    for (const [key, item] of Object.entries(value)) out[key] = toDisplayValue(item);
    return out;
  }
  return value;
}
