import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IMPORTED_MARKERS } from "../data/imported-markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRAPE_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "master.json");
const OUTPUT_PATH = path.join(ROOT, "data", "wiki-map-markers.js");

const IMPORT_ICON_META = {
  "Content_Quest.png": { category: "quests" },
  "Content_Miniquest.png": { category: "mini_quests" },
  "Special_LightRealm.png": { category: "world_discovery" },
  "Special_Rune.png": { category: "world_discovery" },
  "Special_RootsOfCorruption.png": { category: "territorial_discovery" },
  "Content_Dungeon.png": { category: "dungeon" },
  "Content_CorruptedDungeon.png": { category: "dungeon" },
  "Content_Raid.png": { category: "raid" },
  "Content_BossAltar.png": { category: "boss_altar" },
};

const BLOCKED_IMPORT_IDS = new Set([
  "import-650-mini-quest-slay-angels",
]);

const BOSS_ALTAR_NAME_BY_COORD = new Map([
  ["471,-2912", "Bovine Barn"],
  ["321,-2035", "Rotten Passage"],
  ["1417,-1462", "Sunrise Canyon"],
  ["51,-485", "Prison of Souls"],
  ["-1833,-5259", "Plague Laboratory"],
  ["-711,-657", "Tribal Sanctuary"],
  ["-1025,-3657", "Magmastream Core"],
  ["-692,-1068", "Arena of the Legends"],
  ["-802,-5394", "Challenge of the Blades"],
  ["-911,-623", "Altar of Sanctification"],
  ["-1573,-3204", "Geyser Pit"],
  ["-1746,-3069", "Aerie of the Recluse"],
  ["1296,-4670", "Unknown Area"],
  ["1332,-516", "Bottomless Pit"],
  ["-1728,-947", "Deserter's Refuge"],
]);

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleKey(value) {
  return normalizeWhitespace(value)
    .replace(/\s*\(\d+(?:\.\d+)+\)\s*$/g, "")
    .replace(/\s+\(Quest\)\s*$/gi, "")
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function parseBracketTriplets(text) {
  return [...String(text ?? "").matchAll(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  }));
}

function parseLabeledTriplets(text) {
  return [...String(text ?? "").matchAll(/X\s*(-?\d+)\s*Y\s*(-?\d+)?\s*Z\s*(-?\d+)/g)].map((match) => ({
    x: Number(match[1]),
    y: match[2] === undefined ? null : Number(match[2]),
    z: Number(match[3]),
  }));
}

function centroid(points) {
  if (!points.length) {
    return null;
  }

  const totals = points.reduce((acc, point) => {
    acc.x += point.x;
    acc.z += point.z;
    return acc;
  }, { x: 0, z: 0 });

  return {
    x: Math.round(totals.x / points.length),
    z: Math.round(totals.z / points.length),
  };
}

function categoryTag(category) {
  return category.replace(/_/g, "-");
}

function buildImportedDescription(title, category) {
  const labels = {
    quests: "Quest",
    mini_quests: "Mini-quest",
    world_discovery: "World discovery",
    territorial_discovery: "Territorial discovery",
    dungeon: "Dungeon",
    raid: "Raid",
    boss_altar: "Boss altar",
  };

  return `I marked ${title} as a current ${labels[category]?.toLowerCase() ?? "marker"} on the live map.`;
}

function importedCategory(marker) {
  return IMPORT_ICON_META[marker.sourceIcon]?.category ?? null;
}

function normalizeImportedMarkers() {
  return IMPORTED_MARKERS
    .filter((marker) => !BLOCKED_IMPORT_IDS.has(marker.id))
    .map((marker) => {
      const category = importedCategory(marker);
      if (!category) {
        return null;
      }

      return {
        ...marker,
        category,
      };
    })
    .filter(Boolean);
}

function isHeaderLike(title) {
  return /^(cave name|name suggested|discovery location|icon name|x z|location|name recommended)/i.test(title);
}

function isHistoricalVariant(title) {
  return /\(\d+(?:\.\d+)+\)\s*$/i.test(title);
}

function parseCaveRegion(description) {
  const match = description.match(/\]\s+(.+?)\s+\d+(?:-\d+)?\s+(?:Short|Medium|Long|\?)/);
  return normalizeWhitespace(match?.[1] || "");
}

function caveTitleFromDescription(record) {
  const rawTitle = normalizeWhitespace(record.title);
  if (!/^-?\d+\s*,\s*-?\d+\s*,\s*-?\d+$/.test(rawTitle)) {
    return rawTitle;
  }

  const prefix = normalizeWhitespace(String(record.description || "").split("[")[0] || "");
  if (!prefix) {
    return rawTitle;
  }

  return normalizeWhitespace(
    prefix
      .replace(/\s+\d+(?:-\d+)?\s*$/i, "")
      .replace(/\s+(?:Loot Grind|XP Grind|Combat Grind|Mob Grind|Resource Grind)\s*$/i, "")
      .replace(/\s+(?:Normal|Grind)\s*$/i, ""),
  ) || rawTitle;
}

function parseWorldEventRegion(description) {
  const match = description.match(/(?:\[[^\]]+\]\s*)+(.+?)\s+(?:Short|Medium|Long)\s+\(/);
  return normalizeWhitespace(match?.[1] || "");
}

function parseSecretRegion(description) {
  const match = description.match(/Location\s+(.+?)\s+X\s/);
  return normalizeWhitespace(match?.[1] || "");
}

function buildQuestDescription(wikiRecord, fallbackDescription) {
  if (!wikiRecord) {
    return fallbackDescription;
  }

  const parts = [];
  if (wikiRecord.summary) {
    const cleanedSummary = normalizeWhitespace(wikiRecord.summary)
      .replace(new RegExp(`^${escapeRegex(wikiRecord.title)}\\s+scraped from the Quests wiki index page\\.\\s*`, "i"), "")
      .replace(/^scraped from the Quests wiki index page\.\s*/i, "");
    if (cleanedSummary) {
      parts.push(cleanedSummary);
    }
  }
  if (wikiRecord.requirements?.length) {
    parts.push(`Requirements: ${wikiRecord.requirements.join(", ")}.`);
  }
  if (wikiRecord.rewards?.length) {
    parts.push(`Rewards: ${wikiRecord.rewards.join(", ")}.`);
  }

  return parts.join(" ") || fallbackDescription;
}

function buildImportedContentMarkers(imported, wikiRecords) {
  const questWikiByTitle = new Map(
    wikiRecords
      .filter((record) => record.category === "quest")
      .filter((record) => !isHistoricalVariant(record.title))
      .map((record) => [titleKey(record.title), record]),
  );

  return imported
    .filter((marker) => [
      "quests",
      "mini_quests",
      "world_discovery",
      "territorial_discovery",
      "dungeon",
      "raid",
      "boss_altar",
    ].includes(marker.category))
    .map((marker) => {
      const coordKey = `${marker.position.world.x},${marker.position.world.z}`;
      const title = marker.category === "boss_altar"
        ? (BOSS_ALTAR_NAME_BY_COORD.get(coordKey) || marker.title)
        : marker.title;
      const wikiRecord = marker.category === "quests"
        ? questWikiByTitle.get(titleKey(title))
        : null;

      return {
        id: `atlas-${marker.category}-${slugify(title)}-${marker.position.world.x}-${marker.position.world.z}`,
        title,
        category: marker.category,
        region: marker.region,
        description: buildQuestDescription(wikiRecord, buildImportedDescription(title, marker.category)),
        tags: dedupe([
          ...(marker.tags || []),
          categoryTag(marker.category),
          "wiki-map",
        ]),
        position: marker.position,
      };
    });
}

function buildCaveMarkers(wikiRecords) {
  return wikiRecords
    .filter((record) => record.category === "cave")
    .filter((record) => !isHeaderLike(record.title))
    .map((record) => {
      const coords = parseBracketTriplets(record.description);
      const point = coords[0];
      if (!point) {
        return null;
      }

      const region = parseCaveRegion(record.description) || record.region || "Wynncraft";
      const title = caveTitleFromDescription(record);
      return {
        id: `atlas-caves-${slugify(title)}-${point.x}-${point.z}`,
        title,
        category: "caves",
        region,
        description: normalizeWhitespace(record.description),
        tags: dedupe(["cave", slugify(region), "wiki-map"]),
        position: {
          world: {
            x: point.x,
            z: point.z,
          },
        },
      };
    })
    .filter(Boolean);
}

function buildWorldEventMarkers(wikiRecords) {
  return wikiRecords
    .filter((record) => record.category === "world-event")
    .filter((record) => !isHeaderLike(record.title))
    .map((record) => {
      const points = parseBracketTriplets(record.description);
      const point = centroid(points);
      if (!point) {
        return null;
      }

      const region = parseWorldEventRegion(record.description) || record.region || "Wynncraft";
      return {
        id: `atlas-world-events-${slugify(record.title)}-${point.x}-${point.z}`,
        title: record.title,
        category: "world_events",
        region,
        description: normalizeWhitespace(record.description),
        tags: dedupe(["world-event", slugify(region), "wiki-map"]),
        position: {
          world: {
            x: point.x,
            z: point.z,
          },
        },
        details: {
          coordinates: points.map(({ x, z }) => ({ x, z })),
        },
      };
    })
    .filter(Boolean);
}

function buildSecretDiscoveryMarkers(wikiRecords) {
  return wikiRecords
    .filter((record) => record.category === "secret-discovery")
    .filter((record) => !isHeaderLike(record.title))
    .filter((record) => !/^location\b/i.test(normalizeWhitespace(record.description)))
    .map((record) => {
      const points = parseLabeledTriplets(record.description);
      const point = centroid(points);
      if (!point) {
        return null;
      }

      const region = parseSecretRegion(record.description) || record.region || "Wynncraft";
      return {
        id: `atlas-secret-discovery-${slugify(record.title)}-${point.x}-${point.z}`,
        title: record.title,
        category: "secret_discovery",
        region,
        description: normalizeWhitespace(record.description),
        tags: dedupe(["secret-discovery", slugify(region), "wiki-map"]),
        position: {
          world: {
            x: point.x,
            z: point.z,
          },
        },
      };
    })
    .filter(Boolean);
}

function dedupeMarkers(markers) {
  return [...new Map(markers.map((marker) => [marker.id, marker])).values()];
}

async function main() {
  const wikiRecords = JSON.parse(await fs.readFile(SCRAPE_PATH, "utf8"));
  const imported = normalizeImportedMarkers();

  const markers = dedupeMarkers([
    ...buildImportedContentMarkers(imported, wikiRecords),
    ...buildCaveMarkers(wikiRecords),
    ...buildWorldEventMarkers(wikiRecords),
    ...buildSecretDiscoveryMarkers(wikiRecords),
  ]);

  const counts = markers.reduce((acc, marker) => {
    acc[marker.category] = (acc[marker.category] || 0) + 1;
    return acc;
  }, {});

  const file = [
    "// Generated by scripts/build-wiki-map-markers.mjs",
    `// Source: ${path.relative(ROOT, SCRAPE_PATH).replace(/\\/g, "/")}`,
    "",
    `export const WIKI_MAP_MARKERS = ${JSON.stringify(markers, null, 2)};`,
    "",
  ].join("\n");

  await fs.writeFile(OUTPUT_PATH, file, "utf8");
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/"),
    total: markers.length,
    counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
