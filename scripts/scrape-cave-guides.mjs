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
const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "caves");
const PROGRESS_PATH = path.join(OUTPUT_ROOT, "progress.json");
const RAW_PATH = path.join(OUTPUT_ROOT, "cave-pages.json");
const MARKER_CONTENT_PATH = path.join(OUTPUT_ROOT, "cave-marker-content.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "summary.md");
const INDEX_URL = "https://wynncraft.wiki.gg/wiki/Caves";

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

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function firstSentence(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return "";
  }
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] || text).trim();
}

function compactLine(value, maxLength = 220) {
  const text = normalizeWhitespace(value).replace(/\s+Wynncraft Map\b/gi, "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

function chestTiersFromText(values) {
  return dedupe(
    values.flatMap((value) => (
      [...String(value ?? "").matchAll(/(\d+x Tier \d(?:\s*\[[^\]]+\])?)/g)].map((match) => normalizeWhitespace(match[1]))
    )),
  );
}

function buildExplanation(pageData) {
  const relevantSections = pageData.sections
    .filter((section) => /mobs?|enemies|loot|chests?|notes?|tips?|access|entrance|rewards?/i.test(section.heading))
    .slice(0, 6)
    .map((section) => ({
      heading: section.heading,
      blocks: dedupe((section.blocks || []).map((block) => compactLine(block, 260))).slice(0, 4),
    }))
    .filter((section) => section.heading && section.blocks.length);

  const sectionsText = relevantSections.map((section) => [
    section.heading,
    ...section.blocks.map((block) => `• ${block}`),
  ].join("\n")).join("\n\n");

  const chestTiers = chestTiersFromText([
    pageData.summary,
    ...pageData.infoboxRows,
    ...pageData.sections.flatMap((section) => section.blocks || []),
  ]);

  if (!sectionsText && !chestTiers.length) {
    return "";
  }

  const parts = [];
  if (chestTiers.length) {
    parts.push(["Loot Chests", ...chestTiers.map((tier) => `• ${tier}`)].join("\n"));
  }
  if (sectionsText) {
    parts.push(sectionsText);
  }
  return parts.join("\n\n");
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeSummary(state) {
  const lines = [
    "# Cave Scrape Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Index matches: ${state.indexMatches.length}`,
    `- Pages scraped: ${state.pages.length}`,
    `- Marker-content records: ${Object.keys(state.markerContent).length}`,
    `- Unmatched current cave markers: ${state.unmatchedCurrentMarkers.length}`,
    "",
    "## Unmatched current cave markers",
    "",
    ...state.unmatchedCurrentMarkers.map((item) => `- ${item.title} (${item.region})`),
    "",
  ];
  await fs.writeFile(SUMMARY_PATH, lines.join("\n"), "utf8");
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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    throw new Error(`Challenge page for ${url}`);
  }
}

async function extractIndexSeeds(page, currentCaves) {
  const seeds = await page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll("#mw-content-text .mw-parser-output table tr")]
      .map((row) => {
        const firstLink = row.querySelector("a[href^='/wiki/']");
        const href = firstLink?.getAttribute("href") || "";
        const title = normalize(firstLink?.textContent);
        const rowText = normalize(row.textContent);
        return {
          title,
          url: href ? new URL(href, location.origin).toString() : "",
          rowText,
        };
      })
      .filter((item) =>
        item.title &&
        item.url &&
        /^https?:\/\/[^/]+\/wiki\//i.test(item.url) &&
        /\[-?\d+,\s*-?\d+,\s*-?\d+\]/.test(item.rowText),
      );
  });

  const markerByKey = new Map(currentCaves.map((marker) => [titleKey(marker.title), marker]));
  const matched = [];
  const seen = new Set();
  for (const seed of seeds) {
    const key = titleKey(seed.title);
    const marker = markerByKey.get(key);
    if (!marker || seen.has(marker.id)) {
      continue;
    }
    seen.add(marker.id);
    matched.push({
      markerId: marker.id,
      markerTitle: marker.title,
      markerRegion: marker.region,
      pageTitle: seed.title,
      url: seed.url,
    });
  }
  return matched.sort((left, right) => left.markerTitle.localeCompare(right.markerTitle));
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
      .slice(0, 8);
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

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const currentCaves = WIKI_MAP_MARKERS.filter((marker) => marker.category === "caves");
  const { browser, context } = await connectToChrome();
  const page = context.pages()[0] || (await context.newPage());

  try {
    await ensureUsablePage(page, INDEX_URL);
    const indexMatches = await extractIndexSeeds(page, currentCaves);
    const pages = [];
    const markerContent = {};

    for (const seed of indexMatches) {
      await ensureUsablePage(page, seed.url);
      const pageData = await extractCavePage(page);
      const explanation = buildExplanation(pageData);
      const summary = firstSentence(pageData.summary) || firstSentence(pageData.topParagraphs[0] || "");
      pages.push({
        markerId: seed.markerId,
        markerTitle: seed.markerTitle,
        markerRegion: seed.markerRegion,
        url: seed.url,
        ...pageData,
      });
      markerContent[seed.markerId] = {
        summary,
        explanation,
        coverImage: pageData.images[0] || "",
        gallery: dedupe(pageData.images),
        sourceUrl: seed.url,
        tutorials: dedupe(pageData.videos),
      };
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const matchedIds = new Set(indexMatches.map((item) => item.markerId));
    const unmatchedCurrentMarkers = currentCaves
      .filter((marker) => !matchedIds.has(marker.id))
      .map((marker) => ({ title: marker.title, region: marker.region, id: marker.id }));

    const state = {
      scrapedAt: new Date().toISOString(),
      indexUrl: INDEX_URL,
      indexMatches,
      pages,
      markerContent,
      unmatchedCurrentMarkers,
    };

    await writeJson(PROGRESS_PATH, {
      status: "completed",
      scrapedAt: state.scrapedAt,
      indexMatches: indexMatches.length,
      pages: pages.length,
      unmatchedCurrentMarkers: unmatchedCurrentMarkers.length,
    });
    await writeJson(RAW_PATH, pages);
    await writeJson(MARKER_CONTENT_PATH, markerContent);
    await writeSummary(state);

    console.log(JSON.stringify({
      output: {
        progress: path.relative(ROOT, PROGRESS_PATH).replace(/\\/g, "/"),
        pages: path.relative(ROOT, RAW_PATH).replace(/\\/g, "/"),
        markerContent: path.relative(ROOT, MARKER_CONTENT_PATH).replace(/\\/g, "/"),
        summary: path.relative(ROOT, SUMMARY_PATH).replace(/\\/g, "/"),
      },
      indexMatches: indexMatches.length,
      pages: pages.length,
      unmatchedCurrentMarkers: unmatchedCurrentMarkers.length,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
