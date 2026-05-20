import fs from "node:fs/promises";
import path from "node:path";
import { IMPORTED_MARKERS } from "../data/imported-markers.js";
import { WORLD_EVENT_MARKERS } from "../data/world-events.js";
import { CURATED_MARKERS } from "../data/markers.js";

const API_URL = "https://api.wynncraft.com/v3/map/locations/markers";
const OUTPUT_ROOT = "E:/projects/github/wynninteractive/data/wiki-scrape/api-first";
const CATEGORY_DIR = path.join(OUTPUT_ROOT, "categories");

const ICON_CATEGORY_MAP = {
  "Content_Quest.png": "quest",
  "Content_Miniquest.png": "mini-quest",
  "Content_Cave.png": "cave",
  "Content_Dungeon.png": "dungeon",
  "Content_CorruptedDungeon.png": "dungeon",
  "Content_Raid.png": "raid",
  "Content_BossAltar.png": "boss-altar",
  "Content_UltimateDiscovery.png": "secret-discovery",
  "Special_LightRealm.png": "world-discovery",
  "Special_Rune.png": "world-discovery",
  "Special_RootsOfCorruption.png": "territorial-discovery",
};

const CATEGORY_PAGE_URLS = {
  quest: "https://wynncraft.wiki.gg/wiki/Quests",
  "mini-quest": "https://wynncraft.wiki.gg/wiki/Quests",
  cave: "https://wynncraft.wiki.gg/wiki/Caves",
  dungeon: "https://wynncraft.wiki.gg/wiki/Dungeons",
  raid: "https://wynncraft.wiki.gg/wiki/Raids",
  "boss-altar": "https://wynncraft.wiki.gg/wiki/Boss_Altar",
  "secret-discovery": "https://wynncraft.wiki.gg/wiki/Secret_Discoveries",
  "world-discovery": "https://wynncraft.wiki.gg/wiki/World_Discoveries",
  "territorial-discovery": "https://wynncraft.wiki.gg/wiki/Territorial_Discoveries",
  "world-event": "https://wynncraft.wiki.gg/wiki/World_Events",
  "lootrun-camp": "https://wynncraft.wiki.gg/wiki/Lootrunning",
};

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function wikiUrlForTitle(title, category) {
  const clean = normalizeWhitespace(title);
  if (!clean) {
    return CATEGORY_PAGE_URLS[category] || "";
  }

  if (category === "mini-quest") {
    return CATEGORY_PAGE_URLS[category];
  }

  if (category === "dungeon") {
    const stripped = clean.replace(/\s+Dungeon$/i, "");
    return `https://wynncraft.wiki.gg/wiki/${encodeURIComponent(stripped.replace(/\s+/g, "_"))}`;
  }

  if (category === "cave" || category === "boss-altar") {
    return CATEGORY_PAGE_URLS[category];
  }

  return `https://wynncraft.wiki.gg/wiki/${encodeURIComponent(clean.replace(/\s+/g, "_"))}`;
}

function formatCoordinateText({ x, y, z }) {
  const parts = [x, y, z].filter((value) => value !== null && value !== undefined);
  return parts.length ? `[${parts.join(", ")}]` : "";
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function splitDescription(description) {
  return dedupe(
    String(description ?? "")
      .split(/[.\n]/)
      .map((value) => normalizeWhitespace(value))
  );
}

function buildImportedLookup() {
  const relevant = IMPORTED_MARKERS.filter((marker) => marker.sourceIcon && ICON_CATEGORY_MAP[marker.sourceIcon]);
  return new Map(
    relevant.map((marker) => {
      const key = `${marker.sourceIcon}|${marker.position.world.x}|${marker.position.world.z}|${normalizeWhitespace(marker.title)}`;
      return [key, marker];
    })
  );
}

function buildApiRecord(marker, importedLookup) {
  const category = ICON_CATEGORY_MAP[marker.icon];
  if (!category) {
    return null;
  }

  const x = Number(marker.x);
  const y = Number(marker.y);
  const z = Number(marker.z);
  const imported =
    importedLookup.get(`${marker.icon}|${x}|${z}|${normalizeWhitespace(marker.name)}`) ||
    importedLookup.get(`${marker.icon}|${x}|${z}|Cave`) ||
    importedLookup.get(`${marker.icon}|${x}|${z}|Boss Altar`) ||
    importedLookup.get(`${marker.icon}|${x}|${z}|Ultimate Discovery`) ||
    null;

  const genericTitle = normalizeWhitespace(marker.name);
  let title = genericTitle;
  const notes = ["Built from the official Wynncraft map markers API."];

  if (category === "cave" && genericTitle === "Cave") {
    title = `Cave @ [${x}, ${y}, ${z}]`;
    notes.push("The API does not expose a unique cave name for this marker; title is coordinate-derived.");
  }

  if (category === "boss-altar" && genericTitle === "Boss Altar") {
    title = `Boss Altar @ [${x}, ${y}, ${z}]`;
    notes.push("The API does not expose a unique boss altar name for this marker; title is coordinate-derived.");
  }

  if (category === "secret-discovery" && genericTitle === "Ultimate Discovery") {
    title = `Ultimate Discovery @ [${x}, ${y}, ${z}]`;
    notes.push("Mapped to secret-discovery for Atlas compatibility; the source marker is labeled Ultimate Discovery.");
  }

  if (category === "world-discovery" && (genericTitle === "Uth Shrine" || genericTitle === "Tol Altar")) {
    notes.push(
      "Mapped to world-discovery using the current Atlas icon mapping; source marker is a special shrine/altar icon."
    );
  }

  if (category === "territorial-discovery") {
    notes.push("Mapped to territorial-discovery using the current Atlas icon mapping.");
  }

  if (category === "mini-quest") {
    notes.push("Mini-quest markers come from the official map feed; individual wiki page URLs are not resolved here.");
  }

  const region = imported?.region || "";
  const tags = dedupe([category, ...(imported?.tags || []), marker.icon.replace(/\.png$/i, "")]);
  const coordinates = { x, y, z };

  return {
    id: `${category}-${slugify(title)}-${x}-${z}`,
    title,
    url: wikiUrlForTitle(title, category),
    category,
    region,
    summary: `${title} is an official Wynncraft map marker in the ${category} category.`,
    description: imported?.description
      ? imported.description
      : `${title} was imported from the official Wynncraft map markers API for Wynn Atlas.`,
    coordinates_raw: formatCoordinateText(coordinates),
    coordinates,
    requirements: [],
    enemies: [],
    bosses: [],
    drops: [],
    rewards: [],
    images: [],
    videos: [],
    tags,
    notes: notes.join(" "),
  };
}

function buildWorldEventRecord(marker) {
  const point = marker.details?.coordinates?.[0] || marker.position?.world || {};
  const x = point.x ?? null;
  const z = point.z ?? null;
  const coordinates = { x, y: null, z };

  return {
    id: marker.id,
    title: marker.title,
    url: CATEGORY_PAGE_URLS["world-event"],
    category: "world-event",
    region: marker.region || "",
    summary: `${marker.title} is a curated world event marker in ${marker.region}.`,
    description: marker.description || "",
    coordinates_raw: formatCoordinateText(coordinates),
    coordinates,
    requirements: dedupe([
      marker.details?.level ? `Suggested level ${marker.details.level}` : "",
      marker.details?.requiredQuest ? `Required quest: ${marker.details.requiredQuest}` : "",
    ]),
    enemies: marker.details?.enemies || [],
    bosses: marker.details?.boss ? [marker.details.boss] : [],
    drops: marker.details?.drops || [],
    rewards: marker.details?.drops || [],
    images: [],
    videos: [],
    tags: marker.tags || ["world-event"],
    notes: "Built from the curated local world-events dataset.",
  };
}

function buildLootrunCampRecord(marker) {
  const x = marker.position?.world?.x ?? null;
  const z = marker.position?.world?.z ?? null;
  const coordinates = { x, y: null, z };

  return {
    id: marker.id,
    title: marker.title,
    url: CATEGORY_PAGE_URLS["lootrun-camp"],
    category: "lootrun-camp",
    region: marker.region || "",
    summary: `${marker.title} is a curated lootrun camp marker in ${marker.region}.`,
    description: marker.description || "",
    coordinates_raw: formatCoordinateText(coordinates),
    coordinates,
    requirements: [],
    enemies: [],
    bosses: [],
    drops: [],
    rewards: [],
    images: [],
    videos: [],
    tags: marker.tags || ["lootrun-camp"],
    notes: "Built from the curated local lootrun camp dataset.",
  };
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.title.localeCompare(b.title);
  });
}

function byCategory(records) {
  return records.reduce((map, record) => {
    if (!map.has(record.category)) {
      map.set(record.category, []);
    }
    map.get(record.category).push(record);
    return map;
  }, new Map());
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  await fs.mkdir(CATEGORY_DIR, { recursive: true });

  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch official markers API: ${response.status} ${response.statusText}`);
  }

  const apiMarkers = await response.json();
  const importedLookup = buildImportedLookup();
  const apiRecords = apiMarkers.map((marker) => buildApiRecord(marker, importedLookup)).filter(Boolean);
  const worldEventRecords = WORLD_EVENT_MARKERS.map(buildWorldEventRecord);
  const lootrunCampRecords = CURATED_MARKERS.filter((marker) => marker.category === "lootrun_camp").map(
    buildLootrunCampRecord
  );

  const records = sortRecords([...apiRecords, ...worldEventRecords, ...lootrunCampRecords]);
  const grouped = byCategory(records);

  for (const [category, categoryRecords] of grouped) {
    await writeJson(path.join(CATEGORY_DIR, `${category}.json`), categoryRecords);
  }

  const coverage = Object.fromEntries(
    [...grouped.entries()].map(([category, categoryRecords]) => [category, categoryRecords.length])
  );
  const ambiguous = records.filter(
    (record) =>
      record.notes.toLowerCase().includes("does not expose") || record.notes.toLowerCase().includes("mapped to")
  );
  const withCoordinates = records.filter(
    (record) => record.coordinates.x !== null || record.coordinates.z !== null
  ).length;
  const withoutCoordinates = records.length - withCoordinates;

  const metadata = {
    generatedAt: new Date().toISOString(),
    method: "api-first",
    source: {
      markersApi: API_URL,
      docs: "https://docs.wynncraft.com/modules/map/list-map-markers",
    },
    counts: {
      total: records.length,
      withCoordinates,
      withoutCoordinates,
      ambiguous: ambiguous.length,
    },
    categories: coverage,
    notes: [
      "This dataset uses the official Wynncraft map markers API as the coordinate backbone.",
      "Region and tag enrichment is joined from the local imported marker dataset where possible.",
      "World events and lootrun camps are merged from curated local data because they are not fully covered by the official marker feed.",
      "The stale browser-scrape JSON under data/wiki-scrape was left untouched on purpose.",
    ],
  };

  const summaryLines = [
    "# Atlas API-First Dataset",
    "",
    `- Generated: ${metadata.generatedAt}`,
    `- Method: ${metadata.method}`,
    `- Official markers source: ${metadata.source.markersApi}`,
    `- Total records: ${metadata.counts.total}`,
    `- Records with coordinates: ${metadata.counts.withCoordinates}`,
    `- Records missing coordinates: ${metadata.counts.withoutCoordinates}`,
    `- Ambiguous or inferred records: ${metadata.counts.ambiguous}`,
    "",
    "## Category Counts",
    "",
    ...Object.entries(coverage).map(([category, count]) => `- ${category}: ${count}`),
    "",
    "## Notes",
    "",
    ...metadata.notes.map((note) => `- ${note}`),
  ];

  await writeJson(path.join(OUTPUT_ROOT, "official-markers.raw.json"), apiMarkers);
  await writeJson(path.join(OUTPUT_ROOT, "master.json"), records);
  await writeJson(path.join(OUTPUT_ROOT, "meta.json"), metadata);
  await writeJson(
    path.join(OUTPUT_ROOT, "ambiguous-records.json"),
    ambiguous.map((record) => ({
      id: record.id,
      title: record.title,
      category: record.category,
      url: record.url,
      coordinates_raw: record.coordinates_raw,
      notes: record.notes,
    }))
  );
  await fs.writeFile(path.join(OUTPUT_ROOT, "summary.md"), summaryLines.join("\n") + "\n", "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outputRoot: OUTPUT_ROOT,
        total: records.length,
        categories: coverage,
        ambiguous: ambiguous.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
