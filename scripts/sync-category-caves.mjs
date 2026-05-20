import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9444;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const PROFILE_DIR = path.join(ROOT, "data", "wiki-scrape", "quest-guides", "chrome-profile");
const CATEGORY_URL = "https://wynncraft.wiki.gg/wiki/Category:Cave";
const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "caves");
const RAW_PATH = path.join(OUTPUT_ROOT, "cave-pages.json");
const CATEGORY_PATH = path.join(OUTPUT_ROOT, "category-cave-pages.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "category-sync-summary.md");
const WIKI_MARKERS_OUTPUT = path.join(ROOT, "data", "wiki-map-markers.js");

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function titleKey(value) {
  return normalizeWhitespace(value)
    .replace(/’/g, "'")
    .replace(/\s+\(Quest\)\s*$/gi, "")
    .replace(/\s*\(\d+(?:\.\d+)+\)\s*$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupe(values) {
  return [...new Set((values || []).map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function parseCoordinates(pageData, fallbackMarker) {
  const text = [
    ...(pageData.infoboxRows || []),
    ...(pageData.topParagraphs || []),
    pageData.summary || "",
  ].join(" ");

  let match = text.match(/Coordinates\s*X:\s*(-?\d+)\s*,?\s*Y:\s*(-?\d+)\s*,?\s*Z:\s*(-?\d+)/i);
  if (!match) {
    match = text.match(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/);
  }

  if (match) {
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    };
  }

  if (fallbackMarker?.position?.world) {
    return {
      x: fallbackMarker.position.world.x,
      y: null,
      z: fallbackMarker.position.world.z,
    };
  }

  return null;
}

function parseRegion(pageData, fallbackMarker) {
  const candidates = [
    pageData.summary,
    ...(pageData.topParagraphs || []),
  ].map((value) => normalizeWhitespace(value));

  for (const text of candidates) {
    let match = text.match(/\bfound in the (.+?) subregion of the .+?[.!?]$/i);
    if (match) {
      return normalizeWhitespace(match[1]);
    }

    match = text.match(/\bfound (?:in|on) the (.+?)[.!?]$/i);
    if (match) {
      return normalizeWhitespace(match[1]);
    }

    match = text.match(/\b(?:found|located) (?:east|west|north|south) of .+? in the (.+?)[.!?]$/i);
    if (match) {
      return normalizeWhitespace(match[1]);
    }

    match = text.match(/\blocated in the (.+?)[.!?]$/i);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
  }

  return fallbackMarker?.region || "Wynncraft";
}

function buildMarkerDescription(pageData) {
  return normalizeWhitespace(pageData.summary || pageData.topParagraphs?.[0] || "");
}

function buildCaveMarker(pageData, fallbackMarker) {
  const coords = parseCoordinates(pageData, fallbackMarker);
  if (!coords) {
    return null;
  }

  const title = normalizeWhitespace(pageData.pageTitle || fallbackMarker?.title || "");
  if (!title) {
    return null;
  }

  const region = parseRegion(pageData, fallbackMarker);
  return {
    id: `atlas-caves-${slugify(title)}-${coords.x}-${coords.z}`,
    title,
    category: "caves",
    region,
    description: buildMarkerDescription(pageData),
    tags: dedupe(["cave", slugify(region), "wiki-map"]),
    position: {
      world: {
        x: coords.x,
        z: coords.z,
      },
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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
  const child = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "about:blank",
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    throw new Error(`Challenge page for ${url}`);
  }
}

async function extractCategorySeeds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#mw-pages .mw-category-group a")]
      .map((a) => ({
        title: a.textContent.trim(),
        url: a.href,
      }))
      .filter((row) => row.title && row.url),
  );
}

async function extractCavePage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/\/icons?\//i.test(src))
      .slice(0, 12);
    const videos = [...document.querySelectorAll("a[href*='youtube.com'], a[href*='youtu.be']")]
      .map((a) => a.href)
      .filter(Boolean);

    const topParagraphs = content
      ? [...content.children]
        .filter((node) => node.tagName === "P")
        .map((node) => normalize(node.textContent))
        .filter(Boolean)
      : [];

    const infoboxRows = [...document.querySelectorAll(".portable-infobox .pi-item, .infobox tr")]
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    const sections = [];
    if (content) {
      let current = null;
      for (const child of [...content.children]) {
        if (/^H[234]$/.test(child.tagName)) {
          current = { heading: normalize(child.textContent), blocks: [] };
          sections.push(current);
          continue;
        }
        if (!current) {
          continue;
        }
        if (["P", "UL", "OL", "DL", "TABLE", "BLOCKQUOTE"].includes(child.tagName)) {
          const text = normalize(child.textContent);
          if (text) {
            current.blocks.push(text);
          }
        }
      }
    }

    return {
      pageTitle: title,
      summary: topParagraphs[0] || "",
      topParagraphs,
      infoboxRows,
      sections,
      images,
      videos,
    };
  });
}

function buildWikiMapFile(markers) {
  return [
    "// Generated by scripts/sync-category-caves.mjs",
    "// Source: https://wynncraft.wiki.gg/wiki/Category:Cave",
    "",
    `export const WIKI_MAP_MARKERS = ${JSON.stringify(markers, null, 2)};`,
    "",
  ].join("\n");
}

async function writeSummary({ categorySeeds, addedMarkers, removedMarkers, skippedPages }) {
  const lines = [
    "# Category Cave Sync",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Category cave pages: ${categorySeeds.length}`,
    `- Added cave markers: ${addedMarkers.length}`,
    `- Removed cave markers: ${removedMarkers.length}`,
    `- Skipped category pages without usable coordinates: ${skippedPages.length}`,
    "",
    "## Added cave markers",
    "",
    ...addedMarkers.map((row) => `- ${row.title}`),
    "",
    "## Removed cave markers",
    "",
    ...removedMarkers.map((row) => `- ${row.title}`),
    "",
    "## Skipped category pages",
    "",
    ...skippedPages.map((row) => `- ${row.title}`),
    "",
  ];
  await fs.writeFile(SUMMARY_PATH, lines.join("\n"), "utf8");
}

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const currentCaves = WIKI_MAP_MARKERS.filter((marker) => marker.category === "caves");
  const currentCaveByKey = new Map(currentCaves.map((marker) => [titleKey(marker.title), marker]));
  const { browser, context } = await connectToChrome();
  const page = context.pages()[0] || (await context.newPage());

  try {
    await ensureUsablePage(page, CATEGORY_URL);
    const categorySeeds = await extractCategorySeeds(page);
    const pageRecords = [];
    const categoryMarkers = [];
    const skippedPages = [];

    for (const seed of categorySeeds) {
      await ensureUsablePage(page, seed.url);
      const pageData = await extractCavePage(page);
      const fallbackMarker = currentCaveByKey.get(titleKey(seed.title));
      pageRecords.push({
        markerId: fallbackMarker?.id || "",
        markerTitle: fallbackMarker?.title || seed.title,
        markerRegion: fallbackMarker?.region || "",
        url: seed.url,
        ...pageData,
      });

      const marker = buildCaveMarker({ ...pageData, pageTitle: seed.title }, fallbackMarker);
      if (marker) {
        categoryMarkers.push(marker);
      } else {
        skippedPages.push({ title: seed.title, url: seed.url });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const categoryMarkerByKey = new Map(categoryMarkers.map((marker) => [titleKey(marker.title), marker]));
    const addedMarkers = categoryMarkers.filter((marker) => !currentCaveByKey.has(titleKey(marker.title)));
    const removedMarkers = currentCaves.filter((marker) => !categoryMarkerByKey.has(titleKey(marker.title)));

    const nonCaveMarkers = WIKI_MAP_MARKERS.filter((marker) => marker.category !== "caves");
    const nextMarkers = [...nonCaveMarkers, ...categoryMarkers];

    await writeJson(RAW_PATH, pageRecords);
    await writeJson(CATEGORY_PATH, pageRecords);
    await fs.writeFile(WIKI_MARKERS_OUTPUT, buildWikiMapFile(nextMarkers), "utf8");
    await writeSummary({ categorySeeds, addedMarkers, removedMarkers, skippedPages });

    console.log(JSON.stringify({
      categoryPages: categorySeeds.length,
      categoryMarkers: categoryMarkers.length,
      addedMarkers: addedMarkers.length,
      removedMarkers: removedMarkers.length,
      skippedPages: skippedPages.length,
      output: {
        markers: path.relative(ROOT, WIKI_MARKERS_OUTPUT).replace(/\\/g, "/"),
        rawPages: path.relative(ROOT, RAW_PATH).replace(/\\/g, "/"),
        summary: path.relative(ROOT, SUMMARY_PATH).replace(/\\/g, "/"),
      },
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
