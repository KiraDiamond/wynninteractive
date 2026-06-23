const SNAPSHOT_URL = new URL("../data/live-map-overlay.beta.json", import.meta.url);

function isLocalRuntime() {
  const hostname = window.location.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function snapshotUrl({ bustCache = false } = {}) {
  const url = new URL(SNAPSHOT_URL);
  if (bustCache || isLocalRuntime()) {
    url.searchParams.set("t", String(Date.now()));
  }
  return url.href;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapByTitle(entries) {
  const next = new Map();
  if (!Array.isArray(entries)) {
    return next;
  }
  entries.forEach((entry) => {
    const key = normalizeKey(entry?.title || entry?.name);
    if (key) {
      next.set(key, entry);
    }
  });
  return next;
}

function mapByInternalName(entries) {
  const next = new Map();
  if (!Array.isArray(entries)) {
    return next;
  }
  entries.forEach((entry) => {
    const key = String(entry?.internalName || "").trim();
    if (key) {
      next.set(key, entry);
    }
  });
  return next;
}

export async function loadLiveMapOverlay({ bustCache = false } = {}) {
  const response = await fetch(snapshotUrl({ bustCache }), {
    headers: { accept: "application/json" },
    cache: bustCache ? "no-store" : "default",
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const snapshot = await response.json();
  return {
    generatedAt: String(snapshot?.generatedAt || ""),
    worldEventsByTitle: mapByTitle(snapshot?.worldEvents),
    campsByTitle: mapByTitle(snapshot?.camps),
    raidsByTitle: mapByTitle(snapshot?.raids),
    lootPoolsByInternalName: mapByInternalName(snapshot?.lootPools),
  };
}
