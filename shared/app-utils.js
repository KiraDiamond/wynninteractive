export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value ?? "");
}

export function splitMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeContentLinks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && item.url)
    .map((item) => ({
      label: item.label || item.url,
      url: item.url,
    }));
}

export function normalizeMarkerLookup(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractGoogleDriveId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("drive.google.com")) {
      return null;
    }

    const directId = parsed.searchParams.get("id");
    if (directId) {
      return directId;
    }

    const parts = parsed.pathname.split("/");
    const fileIndex = parts.indexOf("d");
    if (fileIndex >= 0 && parts[fileIndex + 1]) {
      return parts[fileIndex + 1];
    }
  } catch {
    return null;
  }

  return null;
}

export function youtubeEmbedMeta(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replaceAll("/", "");
      return id ? { embedUrl: `https://www.youtube.com/embed/${id}`, isShort: false } : null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? { embedUrl: `https://www.youtube.com/embed/${id}`, isShort: false } : null;
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? { embedUrl: `https://www.youtube.com/embed/${id}`, isShort: true } : null;
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return { embedUrl: url, isShort: false };
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function preferLocalAvif(url) {
  if (!url) {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.href);
    const isLocalAsset = parsed.origin === window.location.origin && parsed.pathname.includes("/assets/");
    if (!isLocalAsset) {
      return url;
    }

    parsed.pathname = parsed.pathname.replace(/\.(png|jpe?g|webp)$/i, ".avif");
    return parsed.toString();
  } catch {
    return String(url).replace(/\.(png|jpe?g|webp)(\?.*)?$/i, ".avif$2");
  }
}

export function resolveImageUrl(url, iconUrls, referenceUrls) {
  const mapped = iconUrls[url] || referenceUrls[url] || url;
  const fileId = extractGoogleDriveId(mapped);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  }
  return preferLocalAvif(mapped);
}
