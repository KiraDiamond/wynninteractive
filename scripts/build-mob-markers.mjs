import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ITEM_DATABASE_URL = "https://api.wynncraft.com/v3/item/database?fullResult";
const TERRITORY_URL = "https://api.wynncraft.com/v3/guild/list/territory";

const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "mob-drops");
const ITEM_SNAPSHOT_PATH = path.join(OUTPUT_ROOT, "items.json");
const TERRITORY_SNAPSHOT_PATH = path.join(OUTPUT_ROOT, "territories.json");
const MOB_PAGES_PATH = path.join(ROOT, "data", "wiki-scrape", "mob-areas", "mob-pages.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "summary.md");
const MARKERS_OUTPUT_PATH = path.join(ROOT, "data", "generated-mob-markers.js");
const CONTENT_OUTPUT_PATH = path.join(ROOT, "data", "generated-mob-content.js");

const MOB_FAMILY_DEFINITIONS = [
  { id: "hostile_mobs_zombie", label: "Zombies", color: "#c7644f" },
  { id: "hostile_mobs_spider", label: "Spiders", color: "#8d6549" },
  { id: "hostile_mobs_skeleton", label: "Skeletons", color: "#8a939d" },
  { id: "hostile_mobs_humanoid", label: "Humanoids", color: "#9e6a55" },
  { id: "hostile_mobs_beast", label: "Beasts", color: "#7f8f51" },
  { id: "hostile_mobs_elemental", label: "Elementals", color: "#5d8bb8" },
  { id: "hostile_mobs_construct", label: "Constructs", color: "#6c7787" },
  { id: "hostile_mobs_aquatic", label: "Aquatic", color: "#4e98a8" },
  { id: "hostile_mobs_other", label: "Other Mobs", color: "#b36f5c" },
];

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripFormattingCodes(value) {
  return String(value ?? "").replace(/§./g, "");
}

function titleKey(value) {
  return normalizeWhitespace(stripFormattingCodes(value))
    .replace(/’/g, "'")
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return titleKey(value).replace(/\s+/g, "-");
}

function simplifiedMobKey(value) {
  return titleKey(value)
    .replace(/\blv\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function compactLine(value, maxLength = 240) {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

function classifyMobFamily(name) {
  const key = titleKey(name);
  if (/\b(zombie|undead|ghast|ghoul|wraith|rott?en|corpse|cadaver|revenant|walker)\b/.test(key)) {
    return "hostile_mobs_zombie";
  }
  if (/\b(spider|arachnid|widow|tarantula|weaver|web|brood|scuttler)\b/.test(key)) {
    return "hostile_mobs_spider";
  }
  if (/\b(skeleton|skull|bones?|bonelord|archer skeleton)\b/.test(key)) {
    return "hostile_mobs_skeleton";
  }
  if (/\b(sprite|elemental|golem|construct|automaton|machine|cannon|turret|mechanism|statue|idol|sentinel|guardian|controller|generator)\b/.test(key)) {
    return /\b(golem|construct|automaton|machine|cannon|turret|mechanism|statue|idol|sentinel|guardian|controller|generator)\b/.test(key)
      ? "hostile_mobs_construct"
      : "hostile_mobs_elemental";
  }
  if (/\b(fish|squid|shark|crab|sludge|coral|eel|jelly|pirahna|piranha|aqua|watery|seahorse|kraken)\b/.test(key)) {
    return "hostile_mobs_aquatic";
  }
  if (/\b(wolf|bear|boar|fox|hawk|bat|bird|wyrm|wyvern|dragon|beast|bull|stag|goat|cow|pig|serpent|snake|toad|frog|mole|elk|horse|moa|hound|hound|harpy|vulture|rhino|pangolin|manis|turtle|tortoise|bug|beetle|ant|wasp|bee|moth|slug|snail|worm|slime|blob|mollusk|shell|lobster|octopus|ram)\b/.test(key)) {
    return "hostile_mobs_beast";
  }
  if (/\b(bandit|pirate|orc|villager|cultist|mage|warrior|soldier|archer|guard|knight|captain|commander|alchemist|poacher|lumberjack|citizen|hunter|scavenger|cavalier|mercenary|raider|outcast|devotee|gendarme|kipchak|sentry|runner|trader|warden|warder|foreman|pilot|smith|tinkerer|patroller|patrolling|member|monk|priest|witch|shaman|assassin|thief|sniper|sellsword|grenadier|swordancer)\b/.test(key)) {
    return "hostile_mobs_humanoid";
  }
  return "hostile_mobs_other";
}

function normalizeBounds(bounds) {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxZ: Math.max(bounds.minZ, bounds.maxZ),
  };
}

function centerFromBounds(bounds) {
  return {
    x: Math.round((bounds.minX + bounds.maxX) / 2),
    z: Math.round((bounds.minZ + bounds.maxZ) / 2),
  };
}

function boundsArea(bounds) {
  return Math.max(1, bounds.maxX - bounds.minX) * Math.max(1, bounds.maxZ - bounds.minZ);
}

function boundsTouchOrOverlap(left, right, proximity = 0) {
  return !(
    left.maxX + proximity < right.minX ||
    right.maxX + proximity < left.minX ||
    left.maxZ + proximity < right.minZ ||
    right.maxZ + proximity < left.minZ
  );
}

function unionBounds(boundsList, pad = 0, minSpan = 0) {
  const active = boundsList.filter(Boolean);
  if (!active.length) {
    return null;
  }

  let minX = Math.min(...active.map((bounds) => bounds.minX));
  let maxX = Math.max(...active.map((bounds) => bounds.maxX));
  let minZ = Math.min(...active.map((bounds) => bounds.minZ));
  let maxZ = Math.max(...active.map((bounds) => bounds.maxZ));

  if (maxX - minX < minSpan) {
    const extra = (minSpan - (maxX - minX)) / 2;
    minX -= extra;
    maxX += extra;
  }
  if (maxZ - minZ < minSpan) {
    const extra = (minSpan - (maxZ - minZ)) / 2;
    minZ -= extra;
    maxZ += extra;
  }

  return {
    minX: Math.round(minX - pad),
    maxX: Math.round(maxX + pad),
    minZ: Math.round(minZ - pad),
    maxZ: Math.round(maxZ + pad),
  };
}

function pointBounds(point, radius = 10) {
  const safeRadius = Math.max(8, Number.isFinite(radius) ? radius : 10);
  return normalizeBounds({
    minX: point.x - safeRadius,
    maxX: point.x + safeRadius,
    minZ: point.z - safeRadius,
    maxZ: point.z + safeRadius,
  });
}

function mergeBoundsList(boundsList, proximity = 48, minSpan = 48) {
  const pending = boundsList.filter(Boolean).map((bounds) => normalizeBounds(bounds));
  const merged = [];

  while (pending.length) {
    let current = pending.pop();
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (!boundsTouchOrOverlap(current, pending[index], proximity)) {
          continue;
        }
        current = unionBounds([current, pending[index]], 0, minSpan);
        pending.splice(index, 1);
        changed = true;
      }
    }

    merged.push(current);
  }

  return merged.sort((left, right) => boundsArea(right) - boundsArea(left));
}

function territoryBounds(entry) {
  const [startX, startZ] = entry.location?.start || [];
  const [endX, endZ] = entry.location?.end || [];
  if (![startX, startZ, endX, endZ].every(Number.isFinite)) {
    return null;
  }
  return normalizeBounds({
    minX: startX,
    maxX: endX,
    minZ: startZ,
    maxZ: endZ,
  });
}

function pointInBounds(point, bounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function distanceSquared(left, right) {
  const dx = left.x - right.x;
  const dz = left.z - right.z;
  return dx * dx + dz * dz;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function buildMobImageIndex(mobPages) {
  const exact = new Map();
  const simplified = new Map();

  function remember(map, key, image) {
    if (!key || !image) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, new Map());
    }
    const counts = map.get(key);
    counts.set(image, (counts.get(image) || 0) + 1);
  }

  for (const page of mobPages) {
    for (const section of page.sections || []) {
      for (const mob of section.mobs || []) {
        const image = normalizeWhitespace(mob.image);
        const name = normalizeWhitespace(stripFormattingCodes(mob.name));
        if (!image || !name) {
          continue;
        }
        remember(exact, titleKey(name), image);
        remember(simplified, simplifiedMobKey(name), image);
      }
    }
  }

  function bestImage(counts) {
    if (!counts) {
      return "";
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "";
  }

  return {
    resolve(name) {
      return bestImage(exact.get(titleKey(name))) || bestImage(simplified.get(simplifiedMobKey(name))) || "";
    },
  };
}

async function fetchJsonWithCache(url, cachePath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    const data = await response.json();
    await writeJson(cachePath, data);
    return data;
  } catch (error) {
    const cached = await readJson(cachePath, null);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

function buildTerritoryIndex(territoryData) {
  return Object.entries(territoryData)
    .map(([name, entry]) => {
      const bounds = territoryBounds(entry);
      return bounds
        ? { name, bounds, center: centerFromBounds(bounds), key: titleKey(name) }
        : null;
    })
    .filter(Boolean);
}

function resolveRegionName(boundsList, territoryIndex) {
  const counts = new Map();

  for (const bounds of boundsList) {
    const center = centerFromBounds(bounds);
    const matches = territoryIndex.filter((territory) => pointInBounds(center, territory.bounds));
    if (matches.length) {
      for (const match of matches) {
        counts.set(match.name, (counts.get(match.name) || 0) + 2);
      }
      continue;
    }

    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const territory of territoryIndex) {
      const distance = distanceSquared(center, territory.center);
      if (distance < nearestDistance) {
        nearest = territory;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      counts.set(nearest.name, (counts.get(nearest.name) || 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "";
}

function buildMobMap(items) {
  const mobs = new Map();
  for (const item of items) {
    if (item.type !== "ingredient") {
      continue;
    }
    const ingredientName = normalizeWhitespace(stripFormattingCodes(item.displayName || item.internalName));
    const droppedBy = Array.isArray(item.droppedBy) ? item.droppedBy : [];
    for (const dropper of droppedBy) {
      const mobName = normalizeWhitespace(stripFormattingCodes(dropper.name));
      if (!mobName) {
        continue;
      }
      if (!mobs.has(mobName)) {
        mobs.set(mobName, {
          name: mobName,
          ingredients: new Set(),
          pointKeys: new Set(),
          points: [],
          itemSources: new Set(),
        });
      }
      const entry = mobs.get(mobName);
      entry.ingredients.add(ingredientName);
      entry.itemSources.add(`https://wynncraft.com/item/${encodeURIComponent(ingredientName)}`);

      const coordEntries = Array.isArray(dropper.coords)
        ? (Array.isArray(dropper.coords[0]) ? dropper.coords : [dropper.coords])
        : [];

      for (const coords of coordEntries) {
        const [x, y, z, radius] = coords;
        if (![x, z].every(Number.isFinite)) {
          continue;
        }
        const point = {
          x,
          y: Number.isFinite(y) ? y : null,
          z,
          radius: Number.isFinite(radius) ? radius : 10,
        };
        const key = `${point.x}:${point.y ?? "na"}:${point.z}:${point.radius}`;
        if (entry.pointKeys.has(key)) {
          continue;
        }
        entry.pointKeys.add(key);
        entry.points.push(point);
      }
    }
  }

  return [...mobs.values()]
    .map((entry) => ({
      ...entry,
      ingredients: [...entry.ingredients].sort((left, right) => left.localeCompare(right)),
      itemSources: [...entry.itemSources].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildMarkerEntry(mob, territoryIndex, mobImageIndex) {
  if (!mob.points.length) {
    return null;
  }

  const pointBoxes = mob.points.map((point) => pointBounds(point, point.radius));
  const spawnRegions = mergeBoundsList(pointBoxes, 52, 56);
  const spawnBounds = unionBounds(spawnRegions, 10, 80);
  if (!spawnBounds) {
    return null;
  }

  const primaryBounds = spawnRegions[0] || spawnBounds;
  const position = centerFromBounds(primaryBounds);
  const region = resolveRegionName(spawnRegions, territoryIndex);

  return {
    id: `mob-${slugify(mob.name)}`,
    title: mob.name,
    category: classifyMobFamily(mob.name),
    region,
    iconImage: mobImageIndex.resolve(mob.name),
    description: `${mob.ingredients.length} ingredient drop${mob.ingredients.length === 1 ? "" : "s"} across ${mob.points.length} mapped spawn point${mob.points.length === 1 ? "" : "s"}.`,
    tags: dedupe(["mob", "ingredient drops", region, ...mob.ingredients.slice(0, 6)]),
    position: { world: position },
    spawnBounds,
    spawnNodes: pointBoxes,
    spawnRegions,
    spawnZoneApproximate: false,
    spawnPointCount: mob.points.length,
  };
}

function buildContentEntry(mob, marker) {
  const sourceUrl = mob.itemSources[0] || "";
  const sampleCoords = mob.points
    .slice(0, 12)
    .map((point) => `• [${point.x}, ${point.y ?? "?"}, ${point.z}] radius ${point.radius}`)
    .join("\n");

  const clustersLine = marker.spawnRegions.length === 1
    ? "• Spawn data forms 1 exact cluster."
    : `• Spawn data forms ${marker.spawnRegions.length} exact clusters.`;

  const explanation = [
    "Drops",
    ...mob.ingredients.map((ingredient) => `• ${ingredient}`),
    "",
    "Spawn Data",
    `• Exact spawn coordinates pulled from official ingredient drop data.`,
    `• ${mob.points.length} unique spawn points recorded.`,
    clustersLine,
    ...(sampleCoords ? ["", "Sample Coordinates", sampleCoords] : []),
  ].join("\n");

  return [
    marker.id,
    {
      summary: `${mob.name} drops ${mob.ingredients.length} ingredient${mob.ingredients.length === 1 ? "" : "s"} across ${mob.points.length} mapped spawn point${mob.points.length === 1 ? "" : "s"}.`,
      explanation,
      coverImage: marker.iconImage || "",
      gallery: [],
      sourceUrl,
      tutorials: [],
    },
  ];
}

function buildMarkersModule(markers) {
  return [
    "// Generated by scripts/build-mob-markers.mjs",
    "",
    "export const GENERATED_MOB_MARKERS = ",
    `${JSON.stringify(markers, null, 2)};`,
    "",
  ].join("\n");
}

function buildContentModule(content) {
  return [
    "// Generated by scripts/build-mob-markers.mjs",
    "",
    "export const GENERATED_MOB_CONTENT = ",
    `${JSON.stringify(content, null, 2)};`,
    "",
  ].join("\n");
}

function buildSummaryMarkdown(items, mobs, markers) {
  const ingredients = items.filter((item) => item.type === "ingredient");
  const ingredientsWithDroppedBy = ingredients.filter((item) => Array.isArray(item.droppedBy) && item.droppedBy.length).length;
  const totalPoints = mobs.reduce((sum, mob) => sum + mob.points.length, 0);
  return [
    "# Mob Markers",
    "",
    `- Ingredient items scanned: ${ingredients.length}`,
    `- Ingredient items with dropper data: ${ingredientsWithDroppedBy}`,
    `- Unique mob droppers mapped: ${markers.length}`,
    `- Unique spawn points captured: ${totalPoints}`,
    "",
    "## Families",
    "",
    ...MOB_FAMILY_DEFINITIONS.map((family) => {
      const count = markers.filter((marker) => marker.category === family.id).length;
      return `- ${family.label}: ${count}`;
    }),
    "",
    "## Notes",
    "",
    "- Coordinates come from the official item database dropper payload used by Wynncraft item pages.",
    "- This source is exact for ingredient-dropping mobs, but it does not cover mobs with no ingredient drop data.",
    "",
  ].join("\n");
}

async function main() {
  await ensureDir(OUTPUT_ROOT);

  const items = await fetchJsonWithCache(ITEM_DATABASE_URL, ITEM_SNAPSHOT_PATH);
  const territoryData = await fetchJsonWithCache(TERRITORY_URL, TERRITORY_SNAPSHOT_PATH);
  const mobPages = await readJson(MOB_PAGES_PATH, []);
  const territoryIndex = buildTerritoryIndex(territoryData);
  const mobImageIndex = buildMobImageIndex(mobPages);

  const mobs = buildMobMap(items);
  const markers = [];
  const contentEntries = [];

  for (const mob of mobs) {
    const marker = buildMarkerEntry(mob, territoryIndex, mobImageIndex);
    if (!marker) {
      continue;
    }
    markers.push(marker);
    contentEntries.push(buildContentEntry(mob, marker));
  }

  const content = Object.fromEntries(contentEntries);

  await fs.writeFile(MARKERS_OUTPUT_PATH, buildMarkersModule(markers), "utf8");
  await fs.writeFile(CONTENT_OUTPUT_PATH, buildContentModule(content), "utf8");
  await fs.writeFile(SUMMARY_PATH, buildSummaryMarkdown(items, mobs, markers), "utf8");

  console.log(JSON.stringify({
    ingredients: items.filter((item) => item.type === "ingredient").length,
    mobs: markers.length,
    spawnPoints: mobs.reduce((sum, mob) => sum + mob.points.length, 0),
  }, null, 2));
}

await main();
