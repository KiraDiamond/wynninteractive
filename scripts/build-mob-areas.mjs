import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";
import { STARTER_MARKERS, CURATED_MARKERS } from "../data/markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9788;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const CATEGORY_URL = "https://wynncraft.wiki.gg/wiki/Category:Lists_of_mobs";
const TERRITORY_URL = "https://api.wynncraft.com/v3/guild/list/territory";
const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "mob-areas");
const PROFILE_DIR = path.join(OUTPUT_ROOT, "chrome-profile");
const PROGRESS_PATH = path.join(OUTPUT_ROOT, "progress.json");
const RAW_PATH = path.join(OUTPUT_ROOT, "mob-pages.json");
const TERRITORY_SNAPSHOT_PATH = path.join(OUTPUT_ROOT, "territories.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "summary.md");
const MARKERS_OUTPUT_PATH = path.join(ROOT, "data", "generated-mob-area-markers.js");
const CONTENT_OUTPUT_PATH = path.join(ROOT, "data", "generated-mob-area-content.js");

const TOKEN_STOP_WORDS = new Set([
  "city", "county", "island", "isles", "plains", "forest", "woods", "wood", "desert", "swamp", "mesa",
  "jungle", "tundra", "trail", "suburbs", "district", "bay", "cove", "peaks", "heights", "mountainside",
  "territory", "road", "path", "pit", "mines", "barrows", "crypt", "ruins", "factory", "outlook", "sanctum",
  "fair", "hike", "west", "east", "south", "north", "upper", "lower", "general", "guild", "war",
  "expedition", "exploration", "claim", "heroism", "foray", "the",
]);

const GENERIC_LOCATION_CANDIDATES = new Set([
  "from leaf piles",
  "from mole dens",
  "from ursa major",
  "from lord estalis",
  "from patrolling cavaliers",
  "from wings cavalier",
  "from ice carver moles",
  "from leaf pile",
  "from mole den",
]);

const LOCATION_ALIAS_MAP = new Map([
  ["the barracks", ["Royal Barracks", "Citadel Barracks"]],
  ["aelumia citadel walls", ["Gates to Aelumia"]],
  ["aelumia citadel entrance", ["Gates to Aelumia"]],
  ["aelumia safe zone", ["Gates to Aelumia"]],
  ["citadel barracks", ["Citadel Barracks"]],
  ["palace guards", ["Palace Guards"]],
  ["royal alchemists", ["Royal Alchemists"]],
  ["grand aisles", ["Aelumia Citadel"]],
  ["queen's palace", ["Aelumia Citadel"]],
  ["regal ballroom", ["Aelumia Citadel"]],
  ["statuary hall", ["Aelumia Citadel"]],
  ["spire's shadow", ["Aelumia Citadel"]],
  ["spire's crown", ["Aelumia Citadel"]],
  ["aelumia lighthouse", ["Lighthouse Lookout"]],
  ["auburn lumbermill", ["The Lumbermill"]],
  ["frog bog", ["The Frog Bog"]],
  ["highway blockade", ["Auburn Forest"]],
  ["electrifying outpost", ["Auburn Forest"]],
  ["riverbed village", ["Auburn Forest"]],
  ["marsh assault", ["Auburn Forest"]],
  ["swampland squabble", ["Auburn Forest"]],
  ["autumn poachers", ["Auburn Forest"]],
  ["patrolling soldiers", ["Highlands"]],
]);

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function titleKey(value) {
  return normalizeWhitespace(value)
    .replace(/’/g, "'")
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function geoKey(value) {
  return titleKey(value)
    .replace(/\b(guild war|expedition|exploration|city|county|island|isles|plains|forest|woods|wood|desert|swamp|mesa|jungle|tundra|trail|suburbs|district|bay|cove|peaks|heights|mountainside|territory|road|path|pit|mines|barrows|crypt|ruins|factory|outlook|sanctum|fair|hike|west|east|south|north|upper|lower|claim|heroism|foray)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return titleKey(value).replace(/\s+/g, "-");
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

function parseCoords(text) {
  const numbers = [...String(text ?? "").matchAll(/-?\d+/g)].map((match) => Number(match[0]));
  if (numbers.length >= 3) {
    return { x: numbers[0], z: numbers[2] };
  }
  if (numbers.length === 2) {
    return { x: numbers[0], z: numbers[1] };
  }
  return null;
}

function pointBounds(points, pad = 120, minSpan = 220) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minZ = Math.min(...zs);
  let maxZ = Math.max(...zs);

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

function normalizeRectBounds(bounds) {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxZ: Math.max(bounds.minZ, bounds.maxZ),
  };
}

function territoryBoundsFromLocation(location) {
  const [startX, startZ] = location.start || [];
  const [endX, endZ] = location.end || [];
  if (![startX, startZ, endX, endZ].every(Number.isFinite)) {
    return null;
  }
  return normalizeRectBounds({
    minX: startX,
    maxX: endX,
    minZ: startZ,
    maxZ: endZ,
  });
}

function unionBounds(boundsList, points = [], pad = 40, minSpan = 220) {
  const xs = [];
  const zs = [];
  for (const bounds of boundsList.filter(Boolean)) {
    xs.push(bounds.minX, bounds.maxX);
    zs.push(bounds.minZ, bounds.maxZ);
  }
  for (const point of points.filter(Boolean)) {
    xs.push(point.x);
    zs.push(point.z);
  }
  if (!xs.length || !zs.length) {
    return null;
  }

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minZ = Math.min(...zs);
  let maxZ = Math.max(...zs);

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

function expandBounds(bounds, pad = 0) {
  return {
    minX: Math.round(bounds.minX - pad),
    maxX: Math.round(bounds.maxX + pad),
    minZ: Math.round(bounds.minZ - pad),
    maxZ: Math.round(bounds.maxZ + pad),
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

function mergeBoundsList(boundsList, proximity = 120, minSpan = 180) {
  const pending = boundsList.filter(Boolean).map((bounds) => normalizeRectBounds(bounds));
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
        current = unionBounds([current, pending[index]], [], 0, minSpan);
        pending.splice(index, 1);
        changed = true;
      }
    }

    merged.push(current);
  }

  return merged.sort((left, right) => boundsArea(right) - boundsArea(left));
}

function centerFromBounds(bounds) {
  return {
    x: Math.round((bounds.minX + bounds.maxX) / 2),
    z: Math.round((bounds.minZ + bounds.maxZ) / 2),
  };
}

function compactMobLine(mob) {
  const parts = [
    mob.name,
    mob.level ? `Lv. ${mob.level}` : "",
    mob.health ? `${mob.health} HP` : "",
    mob.aiType || "",
  ].filter(Boolean);

  const detail = [
    mob.abilities && mob.abilities !== "-" ? `Abilities: ${mob.abilities}` : "",
    mob.elementalStats && mob.elementalStats !== "-" ? `Element: ${mob.elementalStats}` : "",
    mob.drops && mob.drops !== "-" ? `Drops: ${mob.drops}` : "",
    mob.location && mob.location !== "-" ? `Spawn: ${mob.location}` : "",
  ].filter(Boolean).join(". ");

  return compactLine(detail ? `${parts.join(" — ")}. ${detail}` : parts.join(" — "));
}

function buildExistingIndex() {
  const allMarkers = [...STARTER_MARKERS, ...CURATED_MARKERS, ...WIKI_MAP_MARKERS]
    .filter((marker) => marker.position?.world)
    .map((marker) => ({
      ...marker,
      searchText: titleKey([marker.title, marker.region, marker.description, ...(marker.tags || [])].join(" ")),
      titleKey: titleKey(marker.title),
      regionKey: titleKey(marker.region),
      geoKeys: dedupe([geoKey(marker.title), geoKey(marker.region)]),
    }));

  const titleMap = new Map();
  const regionMap = new Map();
  const geoMap = new Map();

  for (const marker of allMarkers) {
    if (marker.titleKey) {
      if (!titleMap.has(marker.titleKey)) {
        titleMap.set(marker.titleKey, []);
      }
      titleMap.get(marker.titleKey).push(marker);
    }
    if (marker.regionKey) {
      if (!regionMap.has(marker.regionKey)) {
        regionMap.set(marker.regionKey, []);
      }
      regionMap.get(marker.regionKey).push(marker);
    }
    for (const key of marker.geoKeys) {
      if (!key) {
        continue;
      }
      if (!geoMap.has(key)) {
        geoMap.set(key, []);
      }
      geoMap.get(key).push(marker);
    }
  }

  return { allMarkers, titleMap, regionMap, geoMap };
}

function buildTerritoryIndex(territoryData) {
  const territories = Object.entries(territoryData).map(([name, entry]) => {
    const bounds = territoryBoundsFromLocation(entry.location || {});
    return {
      name,
      bounds,
      center: bounds ? centerFromBounds(bounds) : null,
      titleKey: titleKey(name),
      geoKey: geoKey(name),
      searchText: titleKey(name),
    };
  }).filter((territory) => territory.bounds && territory.center);

  const titleMap = new Map();
  const geoMap = new Map();

  for (const territory of territories) {
    if (!titleMap.has(territory.titleKey)) {
      titleMap.set(territory.titleKey, []);
    }
    titleMap.get(territory.titleKey).push(territory);

    if (territory.geoKey) {
      if (!geoMap.has(territory.geoKey)) {
        geoMap.set(territory.geoKey, []);
      }
      geoMap.get(territory.geoKey).push(territory);
    }
  }

  return { territories, titleMap, geoMap };
}

function lookupMarkerMatches(title, index) {
  const exactKey = titleKey(title);
  const simplifiedKey = geoKey(title);
  const exact = [
    ...(index.titleMap.get(exactKey) || []),
    ...(index.regionMap.get(exactKey) || []),
  ];
  if (exact.length) {
    return { quality: "exact", matches: dedupeMarkerMatches(exact) };
  }

  const geo = index.geoMap.get(simplifiedKey) || [];
  if (geo.length) {
    return { quality: "geo", matches: dedupeMarkerMatches(geo) };
  }

  const tokens = simplifiedKey
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !TOKEN_STOP_WORDS.has(token));

  if (!tokens.length) {
    return { quality: "none", matches: [] };
  }

  const fuzzy = index.allMarkers.filter((marker) => tokens.every((token) => marker.searchText.includes(token)));
  if (fuzzy.length && fuzzy.length <= 12) {
    return { quality: "fuzzy", matches: dedupeMarkerMatches(fuzzy) };
  }

  return { quality: "none", matches: [] };
}

function lookupTerritoryMatches(title, index) {
  const exactKey = titleKey(title);
  const simplifiedKey = geoKey(title);
  const exact = index.titleMap.get(exactKey) || [];
  if (exact.length) {
    return { quality: "exact", matches: exact };
  }

  const geo = index.geoMap.get(simplifiedKey) || [];
  if (geo.length) {
    return { quality: "geo", matches: geo };
  }

  const tokens = simplifiedKey
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !TOKEN_STOP_WORDS.has(token));

  if (!tokens.length) {
    return { quality: "none", matches: [] };
  }

  const fuzzy = index.territories.filter((territory) => tokens.every((token) => territory.searchText.includes(token)));
  if (fuzzy.length && fuzzy.length <= 8) {
    return { quality: "fuzzy", matches: fuzzy };
  }

  return { quality: "none", matches: [] };
}

function collectLocationCandidates(pageData) {
  const weighted = new Map();
  const add = (value, weight = 1) => {
    const normalized = normalizeWhitespace(value)
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\s+at\s+-?\d[\d,\s-]*/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[,;:/-]+|[,;:/-]+$/g, "")
      .trim();

    if (!normalized) {
      return;
    }

    const key = titleKey(normalized);
    if (!key || GENERIC_LOCATION_CANDIDATES.has(key)) {
      return;
    }

    weighted.set(normalized, (weighted.get(normalized) || 0) + weight);

    for (const alias of LOCATION_ALIAS_MAP.get(key) || []) {
      const aliasNormalized = normalizeWhitespace(alias);
      weighted.set(aliasNormalized, (weighted.get(aliasNormalized) || 0) + weight);
    }
  };

  add(pageData.title, 4);
  for (const section of pageData.sections) {
    for (const mob of section.mobs) {
      const location = normalizeWhitespace(mob.location);
      if (!location || location === "-" || location === "?") {
        continue;
      }
      add(location, 1.5);
      for (const fragment of location.split(/\s*,\s*/g)) {
        add(fragment, 1);
      }
    }
  }

  return [...weighted.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((left, right) => right.weight - left.weight || left.value.localeCompare(right.value));
}

function qualityWeight(quality) {
  if (quality === "exact") {
    return 4;
  }
  if (quality === "geo") {
    return 2.5;
  }
  if (quality === "fuzzy") {
    return 1;
  }
  return 0;
}

function pushWeightedBounds(scoreMap, entryKey, entryValue, weight) {
  if (!scoreMap.has(entryKey)) {
    scoreMap.set(entryKey, { value: entryValue, score: 0 });
  }
  scoreMap.get(entryKey).score += weight;
}

function deriveAnchors(pageData, existingIndex, territoryIndex) {
  const candidates = collectLocationCandidates(pageData);
  const markerScores = new Map();
  const territoryScores = new Map();

  for (const candidate of candidates) {
    const markerLookup = lookupMarkerMatches(candidate.value, existingIndex);
    const markerWeight = qualityWeight(markerLookup.quality) * candidate.weight;
    if (markerWeight > 0 && markerLookup.matches.length) {
      const perMatch = markerWeight / markerLookup.matches.length;
      for (const marker of markerLookup.matches) {
        pushWeightedBounds(markerScores, marker.id, marker, perMatch);
      }
    }

    const territoryLookup = lookupTerritoryMatches(candidate.value, territoryIndex);
    const territoryWeight = qualityWeight(territoryLookup.quality) * candidate.weight;
    if (territoryWeight > 0 && territoryLookup.matches.length) {
      const perMatch = territoryWeight / territoryLookup.matches.length;
      for (const territory of territoryLookup.matches) {
        pushWeightedBounds(territoryScores, territory.name, territory, perMatch);
      }
    }
  }

  const matchedMarkers = [...markerScores.values()]
    .filter((entry) => entry.score >= 1.5)
    .sort((left, right) => right.score - left.score)
    .slice(0, 18)
    .map((entry) => entry.value);

  const matchedTerritories = [...territoryScores.values()]
    .filter((entry) => entry.score >= 1.5)
    .sort((left, right) => right.score - left.score)
    .slice(0, 18)
    .map((entry) => entry.value);

  return { candidates, matchedMarkers, matchedTerritories };
}

function dedupeMarkerMatches(markers) {
  const seen = new Set();
  return markers.filter((marker) => {
    if (seen.has(marker.id)) {
      return false;
    }
    seen.add(marker.id);
    return true;
  });
}

function deriveZone(pageData, existingIndex, territoryIndex) {
  const exactPoints = [];
  for (const section of pageData.sections) {
    for (const mob of section.mobs) {
      if (mob.coords) {
        exactPoints.push(mob.coords);
      }
    }
  }

  const { matchedMarkers, matchedTerritories } = deriveAnchors(pageData, existingIndex, territoryIndex);
  const territoryBounds = matchedTerritories.map((territory) => territory.bounds);
  const markerPoints = matchedMarkers.map((marker) => ({
    x: marker.position.world.x,
    z: marker.position.world.z,
  }));
  const exactCoordBounds = exactPoints.length ? pointBounds(exactPoints, exactPoints.length >= 2 ? 90 : 110, 260) : null;

  if (exactPoints.length >= 2) {
    const bounds = unionBounds([exactCoordBounds], [], 0, 260);
    return {
      position: centerFromBounds(bounds),
      bounds,
      regions: [bounds],
      anchorSource: "spawn-coords",
      approximate: false,
    };
  }

  if (exactPoints.length === 1 && (territoryBounds.length || markerPoints.length)) {
    const regions = mergeBoundsList([
      expandBounds(exactCoordBounds, 0),
      ...territoryBounds.map((bounds) => expandBounds(bounds, 18)),
      ...markerPoints.map((point) => pointBounds([point], 70, 180)),
    ], 110, 180);
    const bounds = unionBounds(regions, [], 16, 240);
    return {
      position: centerFromBounds(regions[0] || bounds),
      bounds,
      regions,
      anchorSource: territoryBounds.length ? "single-spawn-plus-territories" : "single-spawn-plus-landmarks",
      approximate: true,
    };
  }

  if (exactPoints.length === 1) {
    const point = exactPoints[0];
    const bounds = pointBounds([point], 120, 260);
    return {
      position: point,
      bounds,
      regions: [bounds],
      anchorSource: "single-spawn-coord",
      approximate: true,
    };
  }

  if (territoryBounds.length || markerPoints.length) {
    const regions = mergeBoundsList([
      ...territoryBounds.map((bounds) => expandBounds(bounds, 18)),
      ...markerPoints.map((point) => pointBounds([point], 72, 180)),
    ], 120, 180);
    const bounds = unionBounds(regions, [], 18, markerPoints.length + territoryBounds.length === 1 ? 320 : 240);
    return {
      position: centerFromBounds(regions[0] || bounds),
      bounds,
      regions,
      anchorSource: territoryBounds.length && markerPoints.length
        ? "territories-and-landmarks"
        : territoryBounds.length
          ? "territory-union"
          : "landmark-union",
      approximate: true,
    };
  }

  return null;
}

function buildSummary(pageData) {
  const mobCount = pageData.sections.reduce((sum, section) => sum + section.mobs.length, 0);
  const parts = [`${mobCount} hostile mobs listed for ${pageData.title}.`];
  if (pageData.firstParagraph) {
    parts.push(compactLine(pageData.firstParagraph, 180));
  }
  return parts.join(" ");
}

function buildExplanation(pageData, zone) {
  const blocks = [];
  if (zone?.regions?.length > 1) {
    blocks.push("Spawn Zone\n• Border is split into separate clusters when the mob page points at multiple subareas.");
  } else if (zone?.approximate && /territor|landmark/i.test(zone.anchorSource || "")) {
    blocks.push("Spawn Zone\n• Border is approximate and based on named territories and mapped subareas mentioned on the mob page.");
  } else if (zone?.approximate) {
    blocks.push("Spawn Zone\n• Border is approximate and based on the mob list page plus listed location anchors.");
  } else if (zone) {
    blocks.push("Spawn Zone\n• Border is based on exact spawn coordinates listed on the mob page.");
  }

  for (const section of pageData.sections) {
    const lines = section.mobs.map(compactMobLine).filter(Boolean);
    if (!lines.length) {
      continue;
    }
    blocks.push(`${section.title}\n• ${lines.join("\n• ")}`);
  }
  return blocks.join("\n\n");
}

function buildMarker(pageData, zone) {
  if (!zone?.position || !zone?.bounds) {
    return null;
  }

  const mobCount = pageData.sections.reduce((sum, section) => sum + section.mobs.length, 0);
  return {
    id: `mob-area-${slugify(pageData.title)}`,
    title: pageData.title,
    category: "hostile_mobs",
    region: pageData.title,
    description: `${mobCount} hostile mobs listed here.`,
    tags: dedupe(["mob area", "wiki.gg", pageData.title]),
    position: { world: zone.position },
    spawnBounds: zone.bounds,
    spawnRegions: zone.regions || [zone.bounds],
    spawnZoneApproximate: Boolean(zone.approximate),
  };
}

function buildContentEntry(pageData, zone, markerId) {
  const images = dedupe(pageData.sections.flatMap((section) => section.mobs.map((mob) => mob.image)).filter(Boolean));
  return [
    markerId,
    {
      summary: buildSummary(pageData),
      explanation: buildExplanation(pageData, zone),
      coverImage: images[0] || "",
      gallery: images.slice(0, 8),
      sourceUrl: pageData.url,
      tutorials: [],
    },
  ];
}

function buildMarkersModule(markers) {
  return [
    "// Generated by scripts/build-mob-areas.mjs",
    "",
    "export const GENERATED_MOB_AREA_MARKERS = ",
    `${JSON.stringify(markers, null, 2)};`,
    "",
  ].join("\n");
}

function buildContentModule(content) {
  return [
    "// Generated by scripts/build-mob-areas.mjs",
    "",
    "export const GENERATED_MOB_AREA_CONTENT = ",
    `${JSON.stringify(content, null, 2)};`,
    "",
  ].join("\n");
}

function buildSummaryMarkdown(progress, markers, rawPages) {
  const mapped = markers.length;
  const total = rawPages.length;
  const mobCount = rawPages.reduce((sum, page) => sum + page.sections.reduce((sectionSum, section) => sectionSum + section.mobs.length, 0), 0);
  return [
    "# Mob Areas",
    "",
    `- Source pages scraped: ${total}`,
    `- Mapped area overlays: ${mapped}`,
    `- Source-only pages without geometry: ${total - mapped}`,
    `- Total hostile mob rows captured: ${mobCount}`,
    "",
    "## Unmapped Pages",
    "",
    ...(progress.unmappedPages.length ? progress.unmappedPages.map((title) => `- ${title}`) : ["- none"]),
    "",
  ].join("\n");
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

async function loadTerritorySnapshot() {
  try {
    const response = await fetch(TERRITORY_URL);
    if (!response.ok) {
      throw new Error(`Territory API returned ${response.status}`);
    }
    const live = await response.json();
    await writeJson(TERRITORY_SNAPSHOT_PATH, live);
    return live;
  } catch (error) {
    const cached = await readJson(TERRITORY_SNAPSHOT_PATH, null);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function canReachChromeDebug() {
  try {
    const response = await fetch(`${DEBUG_URL}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startChromeDebugSession() {
  const args = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "about:blank",
  ];

  spawn(CHROME_PATH, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await canReachChromeDebug()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Chrome remote debugging endpoint did not come up at ${DEBUG_URL}`);
}

async function connectToChrome() {
  if (!(await canReachChromeDebug())) {
    await startChromeDebugSession();
  }
  const browser = await chromium.connectOverCDP(DEBUG_URL);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("Chrome CDP connection succeeded but no browser context was available.");
  }
  return { browser, context };
}

async function ensureUsablePage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    throw new Error(`Challenge page detected for ${url}`);
  }
}

async function extractCategoryPages(page) {
  await ensureUsablePage(page, CATEGORY_URL);
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll("main a")]
      .map((anchor) => ({ text: normalize(anchor.textContent), href: anchor.href }))
      .filter((entry) => /\/wiki\/Lists_of_mobs\//.test(entry.href));
  });
}

async function extractMobPage(page, url) {
  await ensureUsablePage(page, url);
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const main = document.querySelector("main .mw-parser-output");
    const title = normalize(document.querySelector("main h1")?.textContent).replace(/^Lists of mobs\//i, "") || location.pathname.split("/").pop().replaceAll("_", " ");
    const firstParagraph = normalize([...document.querySelectorAll("main .mw-parser-output > p")].find((paragraph) => normalize(paragraph.textContent))?.textContent || "");
    const sections = [];
    let currentTitle = "General Mobs";

    for (const child of [...(main?.children || [])]) {
      if (/^H[23]$/i.test(child.tagName)) {
        const heading = normalize(child.textContent).replace(/\[.*?\]$/, "");
        if (heading && !/contents|navigation/i.test(heading)) {
          currentTitle = heading;
        }
        continue;
      }

      if (!child.matches("table.wikitable")) {
        continue;
      }

      const rows = [...child.querySelectorAll("tr")].slice(1);
      const mobs = rows.map((row) => {
        const cells = [...row.querySelectorAll("th, td")].map((cell) => normalize(cell.textContent));
        const image = row.querySelector("img")?.src || "";
        return {
          image,
          name: cells[1] || "",
          level: cells[2] || "",
          health: cells[3] || "",
          aiType: cells[4] || "",
          abilities: cells[5] || "",
          elementalStats: cells[6] || "",
          drops: cells[7] || "",
          location: cells[8] || "",
        };
      }).filter((mob) => mob.name);

      if (mobs.length) {
        sections.push({
          title: currentTitle,
          mobs,
        });
      }
    }

    return {
      url: location.href,
      title,
      firstParagraph,
      sections,
    };
  });
}

async function main() {
  await ensureDir(OUTPUT_ROOT);
  const progress = await readJson(PROGRESS_PATH, {
    status: "running",
    pages: {},
    links: [],
    unmappedPages: [],
  });

  const existingIndex = buildExistingIndex();
  const territoryData = await loadTerritorySnapshot();
  const territoryIndex = buildTerritoryIndex(territoryData);
  const { browser, context } = await connectToChrome();
  const page = await context.newPage();

  try {
    const links = progress.links.length ? progress.links : await extractCategoryPages(page);
    progress.links = links;

    for (const link of links) {
      if (progress.pages[link.href]) {
        continue;
      }
      const pageData = await extractMobPage(page, link.href);
      progress.pages[link.href] = pageData;
      await writeJson(PROGRESS_PATH, progress);
      await page.waitForTimeout(450);
    }

    const rawPages = links.map((link) => progress.pages[link.href]).filter(Boolean);
    const markers = [];
    const contentEntries = [];
    const unmappedPages = [];

    for (const rawPage of rawPages) {
      for (const section of rawPage.sections) {
        section.mobs = section.mobs.map((mob) => ({
          ...mob,
          coords: parseCoords(mob.location),
        }));
      }

      const zone = deriveZone(rawPage, existingIndex, territoryIndex);
      const marker = buildMarker(rawPage, zone);
      if (marker) {
        markers.push(marker);
        contentEntries.push(buildContentEntry(rawPage, zone, marker.id));
      } else {
        unmappedPages.push(rawPage.title);
      }
    }

    const content = Object.fromEntries(contentEntries);
    progress.status = "completed";
    progress.unmappedPages = unmappedPages;

    await writeJson(PROGRESS_PATH, progress);
    await writeJson(RAW_PATH, rawPages);
    await fs.writeFile(SUMMARY_PATH, buildSummaryMarkdown(progress, markers, rawPages), "utf8");
    await fs.writeFile(MARKERS_OUTPUT_PATH, buildMarkersModule(markers), "utf8");
    await fs.writeFile(CONTENT_OUTPUT_PATH, buildContentModule(content), "utf8");

    console.log(JSON.stringify({
      scrapedPages: rawPages.length,
      mappedMarkers: markers.length,
      unmappedPages: unmappedPages.length,
      totalMobRows: rawPages.reduce((sum, pageEntry) => sum + pageEntry.sections.reduce((sectionSum, section) => sectionSum + section.mobs.length, 0), 0),
    }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

await main();
