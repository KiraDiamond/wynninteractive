import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CATEGORY_META,
  CURATED_MARKERS,
  STARTER_MARKERS,
  loadDeferredMarkersForCategory,
} from "../data/markers.js";
import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function projectFiles(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git") return [];
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? projectFiles(absolutePath) : [absolutePath];
  });
}

const files = projectFiles();

for (const file of files.filter((entry) => /\.(?:js|mjs)$/i.test(entry))) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    errors.push(`JavaScript syntax failed: ${path.relative(root, file)}\n${error.stderr || error.message}`);
  }
}

for (const file of files.filter((entry) => /\.json$/i.test(entry))) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON: ${path.relative(root, file)} (${error.message})`);
  }
}

function validateRelativeReference(sourceFile, reference) {
  if (!reference.startsWith(".")) return;
  const cleanReference = reference.split(/[?#]/, 1)[0];
  const target = path.resolve(path.dirname(sourceFile), cleanReference);
  if (!fs.existsSync(target)) {
    errors.push(`Missing reference: ${path.relative(root, sourceFile)} -> ${reference}`);
  }
}

for (const file of files.filter((entry) => /\.html$/i.test(entry))) {
  const source = fs.readFileSync(file, "utf8");
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    if (ids.filter((candidate) => candidate === id).length > 1) {
      errors.push(`Duplicate HTML id in ${path.relative(root, file)}: ${id}`);
    }
  }
  for (const match of source.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    validateRelativeReference(file, match[1]);
  }
}

for (const file of files.filter((entry) => /\.(?:js|mjs)$/i.test(entry))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    validateRelativeReference(file, match[1]);
  }
  for (const match of source.matchAll(/new URL\(["'](\.{1,2}\/[^"']+)["'],\s*import\.meta\.url\)/g)) {
    validateRelativeReference(file, match[1]);
  }
}

for (const file of files.filter((entry) => /\.css$/i.test(entry))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    validateRelativeReference(file, match[1].trim());
  }
}

const [mobMarkers, professionMarkers] = await Promise.all([
  loadDeferredMarkersForCategory("hostile_mobs_zombie"),
  loadDeferredMarkersForCategory("profession_fishing"),
]);
const markers = [
  ...STARTER_MARKERS,
  ...CURATED_MARKERS,
  ...WIKI_MAP_MARKERS,
  ...mobMarkers,
  ...professionMarkers,
];
const markerIds = new Set();
const duplicateMarkerIds = new Set();
for (const marker of markers) {
  if (!marker?.id) {
    errors.push("Missing marker id.");
  } else if (markerIds.has(marker.id)) {
    duplicateMarkerIds.add(marker.id);
  }
  markerIds.add(marker.id);
  if (!CATEGORY_META[marker.category]) {
    errors.push(`Unknown marker category for ${marker.id}: ${marker.category}`);
  }
  if (!Number.isFinite(marker.position?.world?.x) || !Number.isFinite(marker.position?.world?.z)) {
    errors.push(`Invalid world position for marker: ${marker.id}`);
  }
}

const overlay = JSON.parse(fs.readFileSync(path.join(root, "data/live-map-overlay.beta.json"), "utf8"));
for (const collection of ["worldEvents", "camps", "raids", "lootPools"]) {
  if (!Array.isArray(overlay[collection]) || !overlay[collection].length) {
    errors.push(`Beta live-map overlay has no ${collection}.`);
  }
}
if (Number.isNaN(Date.parse(overlay.generatedAt))) {
  errors.push("Beta live-map overlay has an invalid generatedAt timestamp.");
}

if (errors.length) {
  console.error(errors.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log(`Project checks passed: ${files.length} files, ${markers.length} markers.`);
  if (duplicateMarkerIds.size) {
    console.warn(
      `Generated marker ID collisions handled at runtime: ${[...duplicateMarkerIds].sort().join(", ")}`,
    );
  }
}
