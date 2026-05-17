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
const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "quest-guides");
const PROFILE_DIR = path.join(OUTPUT_ROOT, "chrome-profile");
const LOG_PATH = path.join(OUTPUT_ROOT, "run.log");
const PROGRESS_PATH = path.join(OUTPUT_ROOT, "progress.json");
const GUIDES_PATH = path.join(OUTPUT_ROOT, "quest-guides.json");
const MARKER_CONTENT_PATH = path.join(OUTPUT_ROOT, "marker-content.json");
const QUEST_SEED_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "categories", "quest.json");

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
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

async function appendLog(line) {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.appendFile(LOG_PATH, `${new Date().toISOString()} ${line}\n`, "utf8");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    await wait(1000);
  }

  throw new Error(`Chrome remote debugging endpoint did not come up at ${DEBUG_URL}`);
}

async function connectToChrome() {
  if (!(await canReachChromeDebug())) {
    await appendLog("Launching regular Chrome with remote debugging for quest-guide scrape.");
    await startChromeDebugSession();
  } else {
    await appendLog("Reusing existing quest-guide Chrome debugging session.");
  }

  const browser = await chromium.connectOverCDP(DEBUG_URL);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("Chrome CDP connection succeeded but no browser context was available.");
  }
  return { browser, context };
}

async function loadQuestTargets() {
  const rawSeeds = JSON.parse(await fs.readFile(QUEST_SEED_PATH, "utf8"));
  const seedByTitle = new Map(
    rawSeeds
      .filter((record) => record.category === "quest")
      .map((record) => [titleKey(record.title), record.url]),
  );

  return WIKI_MAP_MARKERS
    .filter((marker) => marker.category === "quests")
    .map((marker) => ({
      markerId: marker.id,
      title: marker.title,
      key: titleKey(marker.title),
      url: seedByTitle.get(titleKey(marker.title)) || null,
    }))
    .filter((target) => target.url);
}

async function loadProgress(targets) {
  try {
    const current = JSON.parse(await fs.readFile(PROGRESS_PATH, "utf8"));
    current.targets = current.targets || targets;
    current.guides = current.guides || [];
    current.completedKeys = current.completedKeys || [];
    current.failed = current.failed || [];
    return current;
  } catch {
    return {
      startedAt: new Date().toISOString(),
      status: "starting",
      currentUrl: "",
      challengeCleared: false,
      targets,
      guides: [],
      completedKeys: [],
      failed: [],
      notes: [
        "Quest-guide scraper uses a regular Chrome session over CDP instead of launching a Playwright-owned browser.",
        "The run is quest-only, heavily throttled, and checkpoints after every successful page.",
      ],
    };
  }
}

async function persist(state) {
  const markerContent = Object.fromEntries(
    state.guides.map((guide) => [
      guide.markerId,
      {
        summary: guide.summary,
        explanation: guide.solution,
        coverImage: guide.images[0] || "",
        gallery: guide.images,
        tutorials: guide.videos,
      },
    ]),
  );

  await writeJson(PROGRESS_PATH, state);
  await writeJson(GUIDES_PATH, state.guides);
  await writeJson(MARKER_CONTENT_PATH, markerContent);
}

async function waitForHumanClearance(page, state) {
  state.status = "waiting-for-clearance";
  state.notes = dedupe([
    ...(state.notes || []),
    "Quest-guide scrape hit a challenge page. Clear it in the visible Chrome window, then the scraper will resume.",
  ]);
  await persist(state);
  await appendLog(`Challenge detected at ${state.currentUrl}; waiting for human clearance.`);

  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const title = await page.title().catch(() => "");
    if (!/just a moment|attention required|verify you are human/i.test(title)) {
      state.challengeCleared = true;
      state.status = "running";
      await persist(state);
      await appendLog("Challenge cleared.");
      return true;
    }
    await page.waitForTimeout(3000);
  }

  state.status = "stalled";
  state.notes = dedupe([...(state.notes || []), "Challenge was not cleared within 10 minutes."]);
  await persist(state);
  await appendLog("Challenge not cleared within timeout.");
  return false;
}

async function ensureUsablePage(page, url, state) {
  state.currentUrl = url;
  await persist(state);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    const cleared = await waitForHumanClearance(page, state);
    if (!cleared) {
      throw new Error(`Challenge page for ${url}`);
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  }
}

async function extractQuestGuide(page) {
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

    const summary = topParagraphs[0] || "";

    const infoboxRows = [...document.querySelectorAll(".portable-infobox .pi-item, .infobox tr")]
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    const sections = [];
    if (content) {
      let current = null;
      for (const child of [...content.children]) {
        const headingTag = child.tagName;
        if (/^H[234]$/.test(headingTag)) {
          const heading = normalize(child.textContent);
          current = { heading, blocks: [] };
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

    const walkthroughSections = sections.filter((section) =>
      /^stage\s+\d+$/i.test(section.heading) ||
      /walkthrough|guide|steps|objective|description|starting\s+npc/i.test(section.heading),
    );

    const walkthrough = walkthroughSections
      .map((section) => `${section.heading}\n${section.blocks.join("\n\n")}`.trim())
      .filter(Boolean)
      .join("\n\n");

    return {
      pageTitle: title,
      summary,
      infoboxRows,
      walkthrough,
      images,
      videos,
    };
  });
}

function summarizeInfoboxRows(rows) {
  const filtered = rows.filter((row) => !/^quest info$/i.test(row));
  return filtered.slice(0, 8).join(" | ");
}

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const targets = await loadQuestTargets();
  const state = await loadProgress(targets);
  await persist(state);

  const pending = targets.filter((target) => !state.completedKeys.includes(target.key));
  const { browser, context } = await connectToChrome();
  const page = context.pages()[0] || (await context.newPage());
  state.status = "running";
  await persist(state);

  try {
    for (const target of pending) {
      await appendLog(`Opening ${target.url}`);
      try {
        await ensureUsablePage(page, target.url, state);
        const guide = await extractQuestGuide(page);
        const summary = guide.summary || summarizeInfoboxRows(guide.infoboxRows);
        const solution = guide.walkthrough || guide.infoboxRows.join("\n");

        state.guides = state.guides
          .filter((entry) => entry.markerId !== target.markerId)
          .concat({
            markerId: target.markerId,
            title: target.title,
            url: target.url,
            summary,
            solution,
            images: dedupe(guide.images),
            videos: dedupe(guide.videos),
            scrapedAt: new Date().toISOString(),
          });
        state.completedKeys = dedupe([...state.completedKeys, target.key]);
        state.currentUrl = target.url;
        await persist(state);
        await appendLog(`Scraped ${target.title}`);
        await page.waitForTimeout(5000 + Math.floor(Math.random() * 4000));
      } catch (error) {
        state.failed.push({
          title: target.title,
          url: target.url,
          message: error.message,
          failedAt: new Date().toISOString(),
        });
        await persist(state);
        await appendLog(`Failed ${target.title}: ${error.message}`);
        if (/Challenge page/.test(error.message)) {
          throw error;
        }
      }
    }

    state.status = "completed";
    await persist(state);
    await appendLog("Completed quest-guide scrape.");
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  await appendLog(`Fatal error: ${error.stack || error.message}`);
  throw error;
});
