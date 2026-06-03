const SNAPSHOT_URL = new URL("../data/live-map-overlay.beta.json", import.meta.url).href;

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

export async function loadLiveMapOverlay() {
  const response = await fetch(SNAPSHOT_URL, {
    headers: { accept: "application/json" },
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
