/**
 * Clamps a number between an inclusive minimum and maximum.
 * @param {number} value - Number to constrain.
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Inclusive upper bound.
 * @returns {number} Clamped number.
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Wraps a callback in a debounce guard so rapid calls collapse into one trailing call.
 * @param {Function} callback - Callback to invoke after the debounce window.
 * @param {number} delayMs - Debounce delay in milliseconds.
 * @returns {Function} Debounced callback.
 */
export function debounce(callback, delayMs) {
  let timeoutId = 0;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, delayMs);
  };
}

/**
 * Escapes user-facing HTML to prevent unsafe markup injection.
 * @param {string} value - Raw string value.
 * @returns {string} HTML-escaped string.
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Escapes a string for safe placement inside an HTML attribute.
 * @param {string} value - Raw attribute value.
 * @returns {string} Escaped attribute string.
 */
export function escapeAttribute(value) {
  return escapeHtml(value ?? "");
}

/**
 * Tagged template helper that escapes interpolated values by default.
 * Use `html.raw()` for trusted prebuilt markup.
 * @param {TemplateStringsArray} strings - Raw template string segments.
 * @param {...unknown} values - Interpolated values to escape or flatten.
 * @returns {string} Safe HTML string.
 */
export function html(strings, ...values) {
  let output = "";
  for (let index = 0; index < strings.length; index += 1) {
    output += strings[index];
    if (index < values.length) {
      output += renderHtmlValue(values[index]);
    }
  }
  return output;
}

/**
 * Marks a string as trusted HTML for the `html` template helper.
 * @param {string} value - Already-escaped or trusted markup.
 * @returns {{__html: string}} Trusted HTML wrapper.
 */
html.raw = function raw(value) {
  return { __html: String(value ?? "") };
};

function renderHtmlValue(value) {
  if (value == null || value === false) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(renderHtmlValue).join("");
  }
  if (typeof value === "object" && "__html" in value) {
    return String(value.__html);
  }
  return escapeHtml(String(value));
}

/**
 * Splits a multi-line string into trimmed, non-empty lines.
 * @param {string|string[]} value - Source text to split.
 * @returns {string[]} Cleaned list of lines.
 */
export function splitMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Normalizes a list of content links to a consistent `{ label, url }` shape.
 * @param {Array<{label?: string, url?: string}>} value - Raw content links.
 * @returns {Array<{label: string, url: string}>} Normalized link objects.
 */
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

/**
 * Normalizes marker text for tolerant title and tag matching.
 * @param {string} value - Marker text to normalize.
 * @returns {string} Folded, punctuation-light lookup key.
 */
export function normalizeMarkerLookup(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Reads a numeric query parameter with a numeric fallback.
 * @param {URLSearchParams} params - Query parameters to read from.
 * @param {string} name - Parameter name.
 * @param {number} fallback - Fallback number when parsing fails.
 * @returns {number} Parsed finite number or the fallback.
 */
export function parseNumberParam(params, name, fallback) {
  const raw = params.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Loads the saved theme preference from local storage.
 * @param {string} storageKey - Local storage key for the theme setting.
 * @param {"light"|"dark"} fallbackTheme - Theme used when nothing valid is stored.
 * @returns {"light"|"dark"} Stored theme or the provided fallback.
 */
export function loadTheme(storageKey, fallbackTheme) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === "dark" || raw === "light") {
      return raw;
    }
  } catch {}
  return fallbackTheme;
}

/**
 * Loads a boolean-style dismissal flag from local storage.
 * @param {string} storageKey - Local storage key for the flag.
 * @returns {boolean} `true` when the flag is stored as `"1"`.
 */
export function loadDismissedFlag(storageKey) {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {}
  return false;
}

/**
 * Persists a boolean-style dismissal flag to local storage.
 * @param {string} storageKey - Local storage key for the flag.
 * @param {boolean} isDismissed - Whether the flag should be stored as enabled.
 * @returns {void} No return value.
 */
export function persistDismissedFlag(storageKey, isDismissed) {
  try {
    localStorage.setItem(storageKey, isDismissed ? "1" : "0");
  } catch {}
}

/**
 * Finds a marker by title using exact and normalized title matching.
 * @param {Array<{title?: string}>} markers - Marker list to search.
 * @param {string} markerQuery - Human-readable marker title query.
 * @returns {object|null} Matching marker or `null` when no title matches.
 */
export function findMarkerByTitle(markers, markerQuery) {
  if (!markerQuery) {
    return null;
  }

  const exactFolded = markerQuery.toLowerCase();
  const normalized = normalizeMarkerLookup(markerQuery);
  const exact = markers.find((marker) => String(marker.title || "").toLowerCase() === exactFolded);
  if (exact) {
    return exact;
  }

  return markers.find((marker) => normalizeMarkerLookup(marker.title) === normalized) || null;
}

/**
 * Builds a shareable URL that opens a specific marker on the current route.
 * @param {string} currentUrl - Current page URL.
 * @param {string} markerTitle - Marker title to deep-link.
 * @returns {string} Shareable marker URL.
 */
export function markerShareUrl(currentUrl, markerTitle) {
  const url = new URL(currentUrl);
  url.searchParams.delete("v");
  url.searchParams.set("marker", markerTitle);
  return url.toString();
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

/**
 * Converts a local filesystem-backed asset URL into a site-relative asset URL.
 * This repairs generated mappings that were built from local `file:///` paths.
 * @param {string} url - Source URL that may point at a local file.
 * @returns {string} Browser-servable asset URL when the path targets `/assets/`.
 */
export function normalizeLocalAssetUrl(url) {
  if (!url) {
    return url;
  }

  const resolveAssetUrl = (assetPath) => {
    const normalizedAssetPath = assetPath.startsWith("/assets/") ? assetPath : `/assets/${assetPath}`;
    const pathname = window.location.pathname || "/";
    const betaIndex = pathname.indexOf("/beta/");
    const basePath = betaIndex >= 0
      ? pathname.slice(0, betaIndex)
      : pathname.replace(/\/[^/]*$/, "");
    return `${window.location.origin}${basePath}${normalizedAssetPath}`;
  };

  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== "file:") {
      return url;
    }

    const assetIndex = parsed.pathname.toLowerCase().indexOf("/assets/");
    if (assetIndex < 0) {
      return url;
    }

    return resolveAssetUrl(parsed.pathname.slice(assetIndex));
  } catch {
    const normalized = String(url).replaceAll("\\", "/");
    const lower = normalized.toLowerCase();
    const assetIndex = lower.indexOf("/assets/");
    if (assetIndex < 0) {
      return url;
    }
    return resolveAssetUrl(normalized.slice(assetIndex));
  }
}

/**
 * Builds YouTube embed metadata from a YouTube watch, share, shorts, or embed URL.
 * @param {string} url - Source YouTube URL.
 * @returns {{embedUrl: string, isShort: boolean}|null} Embed metadata when recognized.
 */
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

/**
 * Prefers a local AVIF asset variant when the input URL points to a same-origin asset.
 * @param {string} url - Source asset URL.
 * @returns {string} AVIF-upgraded URL when applicable, otherwise the original URL.
 */
export function preferLocalAvif(url) {
  if (!url) {
    return url;
  }

  const normalizedUrl = normalizeLocalAssetUrl(url);

  try {
    const parsed = new URL(normalizedUrl, window.location.href);
    const isLocalAsset = parsed.origin === window.location.origin && parsed.pathname.includes("/assets/");
    if (!isLocalAsset) {
      return normalizedUrl;
    }

    parsed.pathname = parsed.pathname.replace(/\.(png|jpe?g|webp)$/i, ".avif");
    return parsed.toString();
  } catch {
    return String(normalizedUrl).replace(/\.(png|jpe?g|webp)(\?.*)?$/i, ".avif$2");
  }
}

/**
 * Resolves image URLs against icon and reference-image maps, including Google Drive thumbnails.
 * @param {string} url - Original image URL.
 * @param {Record<string, string>} iconUrls - Icon URL overrides by source URL.
 * @param {Record<string, string>} referenceUrls - Reference image overrides by source URL.
 * @returns {string} Final image URL to render.
 */
export function resolveImageUrl(url, iconUrls, referenceUrls) {
  const mapped = normalizeLocalAssetUrl(iconUrls[url] || referenceUrls[url] || url);
  const fileId = extractGoogleDriveId(mapped);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  }
  return preferLocalAvif(mapped);
}
