import { parsePlistXML } from "./src/PlistXML.js";
import { parsePlistBinary } from "./src/PlistBinary.js";
import { extractWebArchive } from "./src/ResourceExtractor.js";

const input = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const results = document.querySelector("#results");
const output = document.querySelector("#output");
const status = document.querySelector("#status");
const resourcePanel = document.querySelector("#resourcePanel");
const resourceList = document.querySelector("#resourceList");
const resourceCount = document.querySelector("#resourceCount");

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
  resourcePanel.hidden = true;
  resourceList.replaceChildren();
  output.textContent = "";
});

async function decodeFile(file) {
  results.hidden = false;
  resourcePanel.hidden = true;
  resourceList.replaceChildren();
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

    // Extract while WebResourceData still contains the original Uint8Array bytes.
    const resources = extractWebArchive(decoded);
    document.querySelector("#formatValue").textContent = format;
    document.querySelector("#rootValue").textContent = Array.isArray(decoded) ? "Array" : decoded instanceof Uint8Array ? "Data" : decoded instanceof Date ? "Date" : decoded === null ? "Null" : typeof decoded;
    output.textContent = JSON.stringify(toDisplayValue(decoded), null, 2);
    renderResources(resources);
    status.textContent = "Decoded successfully";
  } catch (error) {
    document.querySelector("#formatValue").textContent = "Unknown";
    document.querySelector("#rootValue").textContent = "Error";
    output.textContent = error instanceof Error ? error.message : String(error);
    status.textContent = "Decode failed";
  }
}

function renderResources(resources) {
  resourceList.replaceChildren();
  resourceCount.textContent = resources.length + " found";
  resourcePanel.hidden = false;

  if (!resources.length) {
    const empty = document.createElement("p");
    empty.className = "empty-resources";
    empty.textContent = "No resources containing raw WebResourceData were found.";
    resourceList.append(empty);
    return;
  }

  const totalBytes = resources.reduce((sum, item) => sum + item.data.length, 0);
  const summary = document.createElement("p");
  summary.className = "resource-summary";
  summary.textContent = resources.length + " resources · " + formatSize(totalBytes) + " total";
  resourceList.append(summary);

  for (const resource of resources) {
    const row = document.createElement("div");
    row.className = "resource-row";

    const details = document.createElement("div");
    details.className = "resource-details";
    const name = document.createElement("strong");
    name.textContent = resource.path;
    const meta = document.createElement("span");
    meta.textContent = resource.mimeType + " · " + formatSize(resource.data.length) + (resource.url ? " · " + resource.url : "");
    details.append(name, meta);

    const download = document.createElement("button");
    download.type = "button";
    download.className = "download-button";
    download.textContent = "Download";
    download.addEventListener("click", () => downloadResource(resource));

    row.append(details, download);
    resourceList.append(row);
  }
}

function downloadResource(resource) {
  const blob = new Blob([resource.data], { type: resource.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resource.path.split("/").pop() || "resource.bin";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
