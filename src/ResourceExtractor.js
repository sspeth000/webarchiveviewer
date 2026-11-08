/** Extracts raw WebArchive resources without converting their data to previews. */
export function extractWebArchive(archive) {
  if (!isRecord(archive)) throw new TypeError("WebArchive root must be a dictionary.");

  const resources = [];
  const usedPaths = new Map();
  const MAX_DEPTH = 64;

  function addResource(resource, frameName = "main", role = "subresource") {
    if (!isRecord(resource)) return;
    const data = resource.WebResourceData;
    if (!(data instanceof Uint8Array)) return;

    const url = stringValue(resource.WebResourceURL);
    const mimeType = stringValue(resource.WebResourceMIMEType) || "application/octet-stream";
    const suggestedPath = makePath(url, mimeType, resources.length, frameName, role);
    const path = uniquePath(suggestedPath, usedPaths);

    resources.push({
      index: resources.length,
      url,
      mimeType,
      frameName,
      role,
      path,
      data
    });
  }

  function visitArchive(node, frameName = "main", depth = 0) {
    if (depth > MAX_DEPTH) throw new Error("Nested WebArchive depth limit exceeded.");
    if (!isRecord(node)) return;

    if (isRecord(node.WebMainResource)) {
      addResource(node.WebMainResource, frameName, "main");
    }

    if (Array.isArray(node.WebSubresources)) {
      for (const resource of node.WebSubresources) addResource(resource, frameName, "subresource");
    }

    if (Array.isArray(node.WebSubframeArchives)) {
      node.WebSubframeArchives.forEach((frame, index) => {
        if (!isRecord(frame)) return;
        const childName = stringValue(frame.WebFrameName) || frameName + "-frame-" + (index + 1);
        visitArchive(frame, childName, depth + 1);
      });
    }
  }

  visitArchive(archive);
  return resources;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array) && !(value instanceof Date);
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function makePath(url, mimeType, index, frameName, role) {
  let parts = [];
  try {
    const parsed = new URL(url);
    parts = [safeSegment(parsed.hostname), ...parsed.pathname.split("/").filter(Boolean).map(safeSegment)];
  } catch {
    parts = [];
  }

  if (!parts.length || !parts.some(Boolean)) {
    parts = ["resources", safeSegment(frameName), role + "-" + (index + 1) + extensionForMime(mimeType)];
  } else if (!/\.[a-z0-9]{1,10}$/i.test(parts[parts.length - 1])) {
    parts[parts.length - 1] += extensionForMime(mimeType);
  }

  return parts.filter(Boolean).join("/") || "resource-" + (index + 1) + extensionForMime(mimeType);
}

function safeSegment(value) {
  return String(value)
    .replace(/\\/g, "_")
    .replace(/[^a-zA-Z0-9._~-]/g, "_")
    .replace(/^\.+$/, "_")
    .slice(0, 120) || "_";
}

function extensionForMime(mime) {
  const known = {
    "text/html": ".html",
    "text/css": ".css",
    "text/javascript": ".js",
    "application/javascript": ".js",
    "application/json": ".json",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "application/font-woff": ".woff",
    "application/font-woff2": ".woff2"
  };
  return known[mime.toLowerCase()] || ".bin";
}

function uniquePath(path, used) {
  const count = used.get(path) || 0;
  used.set(path, count + 1);
  if (!count) return path;
  const dot = path.lastIndexOf(".");
  const base = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  return base + "-" + (count + 1) + ext;
}
