import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";
import { GENERATED_FAST_TRAVEL_MARKERS } from "../data/generated-fast-travel-markers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://api.wynncraft.com/v3/map/locations/markers";
const WIKI_API_URL = "https://wynncraft.wiki.gg/api.php";
const SUPPLEMENT_OUTPUT = path.join(ROOT, "data", "generated-marker-supplements.js");
const POSITION_OVERRIDES_OUTPUT = path.join(ROOT, "data", "generated-marker-position-overrides.js");
const FAST_TRAVEL_OUTPUT = path.join(ROOT, "data", "generated-fast-travel-markers.js");
const SUMMARY_OUTPUT = path.join(ROOT, "data", "marker-refresh-summary.md");

const USER_AGENT = "WynnInteractive marker refresh/1.0 (https://github.com/KiraDiamond/wynninteractive)";
const ICON_CATEGORY = new Map([
  ["Content_Cave.png", "caves"],
  ["Content_Miniquest.png", "mini_quests"],
  ["Content_UltimateDiscovery.png", "secret_discovery"],
]);

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripWikiMarkup(value) {
  return normalizeWhitespace(
    String(value ?? "")
      .replace(/<!--.*?-->/gs, " ")
      .replace(/<ref\b[^>]*>.*?<\/ref>/gis, " ")
      .replace(/<ref\b[^>]*\/\s*>/gis, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\{\{[^{}]*\}\}/g, " ")
      .replace(/'{2,}/g, "")
      .replace(/<[^>]+>/g, " "),
  );
}

function tableCell(line) {
  let value = line.replace(/^\|/, "").trim();
  const attributeSeparator = value.indexOf("|");
  if (attributeSeparator !== -1 && /=/.test(value.slice(0, attributeSeparator))) {
    value = value.slice(attributeSeparator + 1).trim();
  }
  return value;
}

function tableRows(wikitext) {
  return String(wikitext)
    .split(/\n\|-\s*\n/g)
    .map((block) => block.split(/\r?\n/).filter((line) => /^\|(?![}\-])/.test(line)).map(tableCell))
    .filter((cells) => cells.length >= 3);
}

function coordinatesFromText(value) {
  const mapLink = /\{\{MapLink\|([^}]+)\}\}/i.exec(value);
  if (mapLink) {
    const parameters = Object.fromEntries(
      mapLink[1]
        .split("|")
        .map((part) => part.split("=").map((entry) => entry.trim()))
        .filter(([key, entry]) => ["x", "y", "z"].includes(key?.toLowerCase()) && /^-?\d+$/.test(entry || ""))
        .map(([key, entry]) => [key.toLowerCase(), Number(entry)]),
    );
    if (Number.isFinite(parameters.x) && Number.isFinite(parameters.z)) {
      return { x: parameters.x, y: Number.isFinite(parameters.y) ? parameters.y : null, z: parameters.z };
    }
  }
  const triplet = /(?:^|[^\d-])(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)(?:[^\d]|$)/.exec(stripWikiMarkup(value));
  return triplet ? { x: Number(triplet[1]), y: Number(triplet[2]), z: Number(triplet[3]) } : null;
}

function parseCaves(wikitext) {
  return tableRows(wikitext)
    .map((cells) => {
      const coordinateIndex = cells.findIndex((cell) => coordinatesFromText(cell));
      const coordinates = coordinateIndex === -1 ? null : coordinatesFromText(cells[coordinateIndex]);
      if (!coordinates || coordinateIndex < 1) return null;
      const title = stripWikiMarkup(cells[0]);
      const caveType = stripWikiMarkup(cells[1]);
      const region = stripWikiMarkup(cells[coordinateIndex + 1]) || "Wynncraft";
      const level = stripWikiMarkup(cells[coordinateIndex + 2]);
      if (!title || /^cave name$/i.test(title)) return null;
      return {
        title,
        region,
        description: `${title} is a ${caveType || "mapped"} cave in ${region}.${level ? ` Suggested level: ${level}.` : ""}`,
        coordinates,
        sourceUrl: `https://wynncraft.wiki.gg/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
      };
    })
    .filter(Boolean);
}

function parseMiniQuests(wikitext) {
  return tableRows(wikitext)
    .map((cells) => {
      const coordinateIndex = cells.findIndex((cell) => coordinatesFromText(cell));
      const coordinates = coordinateIndex === -1 ? null : coordinatesFromText(cells[coordinateIndex]);
      if (!coordinates || coordinateIndex < 2) return null;
      const title = stripWikiMarkup(cells[0]);
      if (!/^(?:Slay|Collect|Gather|Hunt)\b/i.test(title)) return null;
      const level = stripWikiMarkup(cells[1]);
      const region = stripWikiMarkup(cells[coordinateIndex - 1]) || "Wynncraft";
      const required = stripWikiMarkup(cells[coordinateIndex + 2]);
      const reward = stripWikiMarkup(cells[coordinateIndex + 3]);
      return {
        title,
        region,
        description: `${title} is a level ${level || "unknown"} mini-quest in ${region}.${required ? ` Requirement: ${required}.` : ""}${reward ? ` XP: ${reward}.` : ""}`,
        coordinates,
        sourceUrl: "https://wynncraft.wiki.gg/wiki/Quests#Mini-Quests",
      };
    })
    .filter(Boolean);
}

function distance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.z) - Number(right.z));
}

function nearby(markers, point, tolerance = 15) {
  return markers.some((marker) => distance(marker.position.world, point) <= tolerance);
}

function closestUnused(markers, point, usedIds, maxDistance) {
  return markers
    .filter((marker) => !usedIds.has(marker.id))
    .map((marker) => ({ marker, distance: distance(marker.position.world, point) }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function matchingWikiRecord(records, point, tolerance = 4) {
  return records
    .map((record) => ({ record, distance: distance(record.coordinates, point) }))
    .filter((entry) => entry.distance <= tolerance)
    .sort((left, right) => left.distance - right.distance)[0]?.record || null;
}

function supplementMarker(record, category, point) {
  return {
    id: `live-${category}-${slugify(record.title)}-${point.x}-${point.z}`,
    title: record.title,
    category,
    region: record.region,
    description: record.description,
    tags: [category.replace(/_/g, "-"), "official-map", "wiki-refresh"],
    sourceUrl: record.sourceUrl,
    position: { world: { x: Number(point.x), z: Number(point.z) } },
  };
}

function territoryIndex(payload) {
  return Object.entries(payload)
    .map(([name, entry]) => {
      const [startX, startZ] = entry?.location?.start || [];
      const [endX, endZ] = entry?.location?.end || [];
      if (![startX, startZ, endX, endZ].every(Number.isFinite)) return null;
      const bounds = {
        minX: Math.min(startX, endX),
        maxX: Math.max(startX, endX),
        minZ: Math.min(startZ, endZ),
        maxZ: Math.max(startZ, endZ),
      };
      return { name, bounds, center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } };
    })
    .filter(Boolean);
}

function regionForPoint(point, territories) {
  const containing = territories.find(({ bounds }) =>
    point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ,
  );
  if (containing) return containing.name;
  return territories
    .map((territory) => ({ territory, distance: distance(territory.center, point) }))
    .sort((left, right) => left.distance - right.distance)[0]?.territory?.name || "Wynncraft";
}

function officialCaveFallback(point, territories) {
  const region = regionForPoint(point, territories);
  return supplementMarker({
    title: `Cave near ${region} (${point.x}, ${point.z})`,
    region,
    description: `Official Wynncraft cave entrance at [${point.x}, ${point.y ?? "?"}, ${point.z}]. The current wiki cave table does not expose a matching named row, so the authoritative coordinate is retained for coverage and flagged for naming review.`,
    sourceUrl: "https://docs.wynncraft.com/modules/map/list-map-markers",
  }, "caves", point);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  return response.json();
}

async function wikiWikitext(page) {
  const url = new URL(WIKI_API_URL);
  url.search = new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json", origin: "*" });
  const payload = await fetchJson(url);
  return payload?.parse?.wikitext?.["*"] || "";
}

function moduleSource(name, value, generator) {
  return [`// Generated by ${generator}`, "", `export const ${name} = ${JSON.stringify(value, null, 2)};`, ""].join("\n");
}

async function main() {
  const [officialMarkers, caveText, questText, territoryPayload] = await Promise.all([
    fetchJson(API_URL),
    wikiWikitext("Caves"),
    wikiWikitext("Quests"),
    fetchJson("https://api.wynncraft.com/v3/guild/list/territory"),
  ]);
  const caveWiki = parseCaves(caveText);
  const miniQuestWiki = parseMiniQuests(questText);
  const wikiByCategory = { caves: caveWiki, mini_quests: miniQuestWiki };
  const supplements = [];
  const unresolved = [];
  const coordinateDriftCovered = [];
  const namingReview = [];
  const territories = territoryIndex(territoryPayload);
  const cavePositionOverrides = {};
  const officialOverridePoints = officialMarkers
    .filter((marker) => ["Content_Cave.png", "Content_UltimateDiscovery.png"].includes(marker.icon))
    .map((marker) => ({ category: ICON_CATEGORY.get(marker.icon), x: Number(marker.x), z: Number(marker.z) }));
  const usedPositionOverrideIds = new Set(
    WIKI_MAP_MARKERS
      .filter((marker) => ["caves", "secret_discovery", "world_discovery"].includes(marker.category))
      .filter((marker) => officialOverridePoints.some((point) => {
        const categoryMatches = point.category === "secret_discovery"
          ? ["secret_discovery", "world_discovery"].includes(marker.category)
          : marker.category === point.category;
        return categoryMatches && distance(marker.position.world, point) <= 15;
      }))
      .map((marker) => marker.id),
  );

  for (const official of officialMarkers) {
    const category = ICON_CATEGORY.get(official.icon);
    if (!category) continue;
    const point = { x: Number(official.x), y: Number(official.y), z: Number(official.z) };
    const existing = WIKI_MAP_MARKERS.filter((marker) =>
      category === "secret_discovery"
        ? ["secret_discovery", "world_discovery"].includes(marker.category)
        : marker.category === category,
    );
    if (nearby(existing, point)) continue;
    const record = wikiByCategory[category] ? matchingWikiRecord(wikiByCategory[category], point) : null;
    if (!record) {
      const driftTolerance = category === "caves" ? 125 : category === "secret_discovery" ? 50 : 0;
      const driftMatch = driftTolerance
        ? closestUnused(existing, point, usedPositionOverrideIds, driftTolerance)
        : null;
      if (driftMatch) {
        usedPositionOverrideIds.add(driftMatch.marker.id);
        cavePositionOverrides[driftMatch.marker.id] = { world: { x: point.x, z: point.z } };
        coordinateDriftCovered.push(point);
        continue;
      }
      if (category === "caves") {
        const fallback = officialCaveFallback(point, territories);
        fallback.tags.push("needs-name-review");
        supplements.push(fallback);
        namingReview.push(fallback.id);
        continue;
      }
      unresolved.push({ category, point });
      continue;
    }
    supplements.push(supplementMarker(record, category, point));
  }

  const fastTravelOfficial = officialMarkers.filter((marker) => marker.icon === "Special_FastTravel.png");
  const usedIds = new Set();
  const coordinateUpdates = new Map();
  for (const official of fastTravelOfficial) {
    const point = { x: Number(official.x), z: Number(official.z) };
    const match = closestUnused(GENERATED_FAST_TRAVEL_MARKERS, point, usedIds, 130);
    if (!match) continue;
    usedIds.add(match.marker.id);
    coordinateUpdates.set(match.marker.id, point);
  }
  const fastTravel = GENERATED_FAST_TRAVEL_MARKERS.map((marker) => {
    const point = coordinateUpdates.get(marker.id);
    return point ? { ...marker, position: { ...marker.position, world: point } } : marker;
  });

  await fs.writeFile(
    SUPPLEMENT_OUTPUT,
    moduleSource("GENERATED_MARKER_SUPPLEMENTS", supplements, "scripts/refresh-marker-catalog.mjs"),
    "utf8",
  );
  await fs.writeFile(
    FAST_TRAVEL_OUTPUT,
    moduleSource("GENERATED_FAST_TRAVEL_MARKERS", fastTravel, "scripts/refresh-marker-catalog.mjs"),
    "utf8",
  );
  await fs.writeFile(
    POSITION_OVERRIDES_OUTPUT,
    moduleSource("GENERATED_MARKER_POSITION_OVERRIDES", cavePositionOverrides, "scripts/refresh-marker-catalog.mjs"),
    "utf8",
  );

  const counts = Object.fromEntries(
    [...new Set(supplements.map((marker) => marker.category))]
      .sort()
      .map((category) => [category, supplements.filter((marker) => marker.category === category).length]),
  );
  const summary = [
    "# Marker Refresh Summary",
    "",
    `- Official markers scanned: ${officialMarkers.length}`,
    `- Wiki cave rows parsed: ${caveWiki.length}`,
    `- Wiki mini-quest rows parsed: ${miniQuestWiki.length}`,
    `- Supplemental markers added: ${supplements.length}`,
    `- Existing fast-travel coordinates aligned: ${coordinateUpdates.size}`,
    `- Existing named markers aligned to official coordinates: ${coordinateDriftCovered.length}`,
    `- Official cave coordinates awaiting a better public name: ${namingReview.length}`,
    `- Unresolved in-scope official markers: ${unresolved.length}`,
    "",
    "## Supplements",
    "",
    ...Object.entries(counts).map(([category, count]) => `- ${category}: ${count}`),
    "",
    "Existing records are preserved. This refresh only adds verified missing records and aligns known fast-travel coordinates.",
    "",
  ].join("\n");
  await fs.writeFile(SUMMARY_OUTPUT, summary, "utf8");

  console.log(JSON.stringify({
    official: officialMarkers.length,
    caveWiki: caveWiki.length,
    miniQuestWiki: miniQuestWiki.length,
    supplements: counts,
    fastTravelAligned: coordinateUpdates.size,
    coordinateDriftCovered: coordinateDriftCovered.length,
    namingReview: namingReview.length,
    unresolved,
  }, null, 2));
}

await main();
