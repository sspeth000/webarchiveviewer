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
const viewButton = document.querySelector("#viewButton");

let currentResources = [];
let viewerObjectURLs = [];
let viewerOverlay = null;
let previousTitle = document.title;

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
  closeViewer();
  input.value = "";
  results.hidden = true;
  resourcePanel.hidden = true;
  resourceList.replaceChildren();
  output.textContent = "";
  currentResources = [];
  viewButton.hidden = true;
});
viewButton.addEventListener("click", openViewer);

async function decodeFile(file) {
  closeViewer();
  currentResources = [];
  viewButton.hidden = true;
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
    currentResources = resources;
    document.querySelector("#formatValue").textContent = format;
    document.querySelector("#rootValue").textContent = Array.isArray(decoded) ? "Array" : decoded instanceof Uint8Array ? "Data" : decoded instanceof Date ? "Date" : decoded === null ? "Null" : typeof decoded;
    output.textContent = JSON.stringify(toDisplayValue(decoded), null, 2);
    renderResources(resources);
    const hasHTML = resources.some(resource => resource.role === "main" && /^text\/html(?:;|$)/i.test(resource.mimeType));
    viewButton.hidden = !hasHTML;
    status.textContent = "Decoded successfully";
  } catch (error) {
    currentResources = [];
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

/**
 * Rebuilds the main archived document in the current tab (no iframe).
 * Archived scripts and embedded active content are deliberately omitted:
 * a webarchive is user-supplied HTML, so rendering it as inert content keeps
 * its markup/styles useful without letting it execute code in this app.
 */
function openViewer() {
  const main = currentResources.find(resource =>
    resource.role === "main" && /^text\/html(?:;|$)/i.test(resource.mimeType)
  );
  if (!main) return;

  closeViewer();
  previousTitle = document.title;

  try {
    const objectURLByResource = new Map();
    for (const resource of currentResources) {
      if (!resource.url) continue;
      const url = URL.createObjectURL(new Blob([resource.data], { type: resource.mimeType }));
      viewerObjectURLs.push(url);
      objectURLByResource.set(resource.url, url);
      try { objectURLByResource.set(new URL(resource.url).href, url); } catch {}
    }

    const mainHTML = new TextDecoder("utf-8").decode(main.data);
    const parsed = new DOMParser().parseFromString(mainHTML, "text/html");
    const baseURL = main.url || parsed.querySelector("base[href]")?.href || location.href;

    const resolveLocal = (value, base = baseURL) => {
      if (!value || value.startsWith("#") || /^(data:|blob:|javascript:|mailto:|tel:)/i.test(value.trim())) return value;
      try {
        const absolute = new URL(value, base).href;
        return objectURLByResource.get(absolute) || objectURLByResource.get(absolute.split("#")[0]) || value;
      } catch {
        return value;
      }
    };

    const rewriteCSS = (css, base) => css
      .replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, value) => {
        const replacement = resolveLocal(value.trim(), base);
        return replacement === value.trim() ? match : "url(" + quote + replacement + quote + ")";
      })
      .replace(/@import\s+(["'])(.*?)\1/gi, (match, quote, value) => {
        const replacement = resolveLocal(value, base);
        return replacement === value ? match : "@import " + quote + replacement + quote;
      });

    // Replace CSS resource blobs with rewritten versions so their own images/fonts work.
    for (const resource of currentResources) {
      if (!/text\/css/i.test(resource.mimeType) || !resource.url) continue;
      const oldURL = objectURLByResource.get(resource.url);
      if (!oldURL) continue;
      const cssText = new TextDecoder("utf-8").decode(resource.data);
      const rewritten = rewriteCSS(cssText, resource.url);
      const newURL = URL.createObjectURL(new Blob([rewritten], { type: "text/css" }));
      viewerObjectURLs.push(newURL);
      objectURLByResource.set(resource.url, newURL);
      try { objectURLByResource.set(new URL(resource.url).href, newURL); } catch {}
      URL.revokeObjectURL(oldURL);
      viewerObjectURLs = viewerObjectURLs.filter(url => url !== oldURL);
    }

    const contentRoot = document.createElement("div");
    contentRoot.className = "archive-content";
    const contentShadow = contentRoot.attachShadow({ mode: "open" });
    const reset = document.createElement("style");
    reset.textContent = ":host{display:block;min-height:100%;color-scheme:normal} .archive-page{min-height:100vh} img,video{max-width:100%}";
    contentShadow.append(reset);

    // Keep document styles in the shadow root, isolated from the viewer controls.
    for (const node of parsed.head.querySelectorAll("style, link[rel~='stylesheet']")) {
      if (node.tagName === "STYLE") {
        const style = document.createElement("style");
        style.textContent = rewriteCSS(node.textContent, baseURL);
        contentShadow.append(style);
      } else {
        const href = node.getAttribute("href");
        if (!href) continue;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = resolveLocal(href, baseURL);
        contentShadow.append(link);
      }
    }

    const page = document.createElement("div");
    page.className = "archive-page";
    for (const child of Array.from(parsed.body.childNodes)) {
      const imported = document.importNode(child, true);
      sanitizeArchiveNode(imported, baseURL, resolveLocal, rewriteCSS);
      page.append(imported);
    }
    contentShadow.append(page);

    const title = parsed.title || main.url || "Archived website";
    document.title = title;
    viewerOverlay = document.createElement("div");
    viewerOverlay.className = "archive-viewer-overlay";
    const toolbar = document.createElement("div");
    toolbar.className = "archive-viewer-toolbar";
    const toolbarShadow = toolbar.attachShadow({ mode: "open" });
    toolbarShadow.innerHTML = `
      <style>
        :host{all:initial;display:block;font:13px/1.3 system-ui,-apple-system,sans-serif}
        .bar{height:44px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 14px;background:#111820;color:#f4f7fb;border-bottom:1px solid #354253}
        button{font:600 12px system-ui;border:1px solid #526174;border-radius:7px;background:#263445;color:#fff;padding:7px 11px;cursor:pointer}
        button:hover{background:#35475d}
        .title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}
        .note{margin-left:auto;font-size:10px;opacity:.65;white-space:nowrap}
      </style>
      <div class="bar">
        <button type="button" id="back">← Back to viewer</button>
        <span class="title"></span>
        <span class="note">Archived page · scripts disabled</span>
      </div>`;
    toolbarShadow.querySelector(".title").textContent = title;
    toolbarShadow.querySelector("#back").addEventListener("click", closeViewer);

    const viewport = document.createElement("div");
    viewport.className = "archive-viewer-viewport";
    viewport.append(contentRoot);
    viewerOverlay.append(toolbar, viewport);
    document.body.append(viewerOverlay);
    document.body.classList.add("archive-viewing");
  } catch (error) {
    closeViewer();
    status.textContent = "Could not render page";
    output.textContent = error instanceof Error ? error.message : String(error);
  }
}

function sanitizeArchiveNode(node, baseURL, resolveLocal, rewriteCSS) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName.toLowerCase();
  if (["script", "iframe", "frame", "object", "embed", "applet", "base"].includes(tag)) {
    node.remove();
    return;
  }

  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (name.startsWith("on") || name === "srcdoc") {
      node.removeAttribute(attribute.name);
      continue;
    }
    if ((name === "href" || name === "src" || name === "action" || name === "formaction") && /^\s*javascript:/i.test(value)) {
      node.removeAttribute(attribute.name);
      continue;
    }
    if (name === "style") node.setAttribute(attribute.name, rewriteCSS(value, baseURL));
    else if (name === "src" || name === "poster" || name === "data") node.setAttribute(attribute.name, resolveLocal(value, baseURL));
    else if (name === "srcset") {
      const rewritten = value.split(",").map(part => {
        const bits = part.trim().split(/\s+/, 2);
        bits[0] = resolveLocal(bits[0], baseURL);
        return bits.join(" ");
      }).join(", ");
      node.setAttribute(attribute.name, rewritten);
    } else if (name === "href" && resolveLocal(value, baseURL) !== value) {
      node.setAttribute(attribute.name, resolveLocal(value, baseURL));
    }
  }

  if (tag === "meta" && node.getAttribute("http-equiv")?.toLowerCase() === "refresh") {
    node.remove();
    return;
  }
  if (tag === "form") {
    node.removeAttribute("action");
    node.setAttribute("autocomplete", "off");
  }
  if (tag === "style") node.textContent = rewriteCSS(node.textContent, baseURL);

  for (const child of Array.from(node.childNodes)) sanitizeArchiveNode(child, baseURL, resolveLocal, rewriteCSS);
}

function closeViewer() {
  if (viewerOverlay) viewerOverlay.remove();
  viewerOverlay = null;
  document.body.classList.remove("archive-viewing");
  for (const url of viewerObjectURLs) URL.revokeObjectURL(url);
  viewerObjectURLs = [];
  if (previousTitle) document.title = previousTitle;
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
