import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_WIKI = "https://wynncraft.wiki.gg/wiki";
const OUTPUT_ROOT = "E:/projects/github/wynninteractive/data/wiki-scrape/browser-persistent";
const CATEGORY_DIR = path.join(OUTPUT_ROOT, "categories");
const PROFILE_DIR = path.join(OUTPUT_ROOT, "chrome-profile");
const STATE_PATH = path.join(OUTPUT_ROOT, "progress.json");
const MASTER_PATH = path.join(OUTPUT_ROOT, "master.json");
const SUMMARY_PATH = path.join(OUTPUT_ROOT, "summary.md");
const LOG_PATH = path.join(OUTPUT_ROOT, "run.log");
const DEBUG_PORT = 9333;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;

const SEEDS = [
  { slug: "Quests", kind: "index", category: "quest" },
  { slug: "Caves", kind: "index", category: "cave" },
  { slug: "Dungeons", kind: "index", category: "dungeon" },
  { slug: "Raids", kind: "index", category: "raid" },
  { slug: "Boss_Altar", kind: "index", category: "boss-altar" },
  { slug: "World_Events", kind: "index", category: "world-event" },
  { slug: "Secret_Discoveries", kind: "index", category: "secret-discovery" },
];

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function toWikiUrl(slug) {
  return `${BASE_WIKI}/${slug}`;
}

function parseCoords(text) {
  const nums = [...String(text ?? "").matchAll(/-?\d+/g)].map((m) => Number(m[0]));
  if (nums.length >= 3) {
    return { x: nums[0], y: nums[1], z: nums[2] };
  }
  if (nums.length === 2) {
    return { x: nums[0], y: null, z: nums[1] };
  }
  return { x: null, y: null, z: null };
}

function coordText(coords) {
  const parts = [coords.x, coords.y, coords.z].filter((x) => x !== null && x !== undefined);
  return parts.length ? `[${parts.join(", ")}]` : "";
}

async function appendLog(line) {
  await fs.appendFile(LOG_PATH, `${new Date().toISOString()} ${line}\n`, "utf8");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSummary(state) {
  const categories = Object.entries(state.countsByCategory)
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");
  return [
    "# Persistent Browser Wiki Scrape",
    "",
    `- Status: ${state.status}`,
    `- Current URL: ${state.currentUrl || ""}`,
    `- Records scraped: ${state.records.length}`,
    `- Challenge cleared: ${state.challengeCleared ? "yes" : "no"}`,
    "",
    "## Categories",
    "",
    categories || "- none",
    "",
    "## Notes",
    "",
    ...state.notes.map((note) => `- ${note}`),
  ].join("\n") + "\n";
}

async function persist(state) {
  const countsByCategory = state.records.reduce((acc, record) => {
    acc[record.category] = (acc[record.category] || 0) + 1;
    return acc;
  }, {});
  state.countsByCategory = countsByCategory;

  const grouped = new Map();
  for (const record of state.records) {
    if (!grouped.has(record.category)) {
      grouped.set(record.category, []);
    }
    grouped.get(record.category).push(record);
  }

  await writeJson(STATE_PATH, state);
  await writeJson(MASTER_PATH, state.records);
  for (const [category, records] of grouped) {
    await writeJson(path.join(CATEGORY_DIR, `${category}.json`), records);
  }
  await fs.writeFile(SUMMARY_PATH, buildSummary(state), "utf8");
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

  const child = spawn(CHROME_PATH, args, {
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

async function connectToChrome(state) {
  if (!(await canReachChromeDebug())) {
    state.notes = dedupe([
      ...state.notes,
      "The scraper now attaches to a regular Chrome session over CDP instead of launching Chrome through Playwright.",
    ]);
    await persist(state);
    await appendLog("Launching regular Chrome with remote debugging.");
    await startChromeDebugSession();
  } else {
    await appendLog("Reusing existing Chrome remote debugging session.");
  }

  const browser = await chromium.connectOverCDP(DEBUG_URL);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("Chrome CDP connection succeeded but no browser context was available.");
  }
  return { browser, context };
}

async function waitForHumanClearance(page, state) {
  state.status = "waiting-for-clearance";
  state.notes = dedupe([
    ...state.notes,
    "Cloudflare or anti-bot challenge detected. Clear it in the visible Chrome window, then the scraper will continue.",
  ]);
  await persist(state);
  await appendLog("Challenge detected; waiting for human clearance.");

  const started = Date.now();
  while (Date.now() - started < 15 * 60 * 1000) {
    const title = await page.title().catch(() => "");
    if (!/just a moment|attention required|verify you are human/i.test(title)) {
      state.challengeCleared = true;
      state.status = "running";
      state.notes = dedupe([...state.notes, "Initial browser challenge was cleared manually in Chrome."]);
      await persist(state);
      await appendLog("Challenge cleared.");
      return true;
    }
    await page.waitForTimeout(3000);
  }

  state.status = "stalled";
  state.notes = dedupe([...state.notes, "Challenge was not cleared within 15 minutes."]);
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

async function extractQuestIndex(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const rows = [...document.querySelectorAll("table.wikitable tr")];
    const records = [];
    for (const row of rows.slice(4)) {
      const cells = [...row.querySelectorAll("th, td")].map((cell) => normalize(cell.textContent));
      const links = [...row.querySelectorAll("a")];
      if (!cells.length || !links.length) continue;
      const title = normalize(links[0]?.textContent);
      if (!title || /hint: sort/i.test(title)) continue;
      const category = /mini-quest/i.test(title) ? "mini-quest" : "quest";
      const rewardsCell = cells[cells.length - 1] || "";
      records.push({
        title,
        url: new URL(links[0].getAttribute("href"), location.origin).toString().split("#")[0],
        category,
        region: cells[8] || "",
        requirements: [cells[1] ? `Combat level ${cells[1]}` : ""].filter(Boolean),
        rewards: rewardsCell.split("\n").map((x) => normalize(x)).filter(Boolean),
      });
    }
    return records;
  });
}

async function extractSimpleTable(page, category) {
  return page.evaluate(({ category }) => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const rows = [...document.querySelectorAll("table.wikitable tr")];
    const out = [];
    for (const row of rows.slice(1)) {
      const text = normalize(row.textContent);
      if (!text) continue;
      const link = row.querySelector("a");
      const href = link?.getAttribute("href") || "";
      const title = normalize(link?.textContent) || normalize(text.split("\t")[0]);
      out.push({
        title,
        url: href ? new URL(href, location.origin).toString().split("#")[0] : location.href,
        raw: text,
        category,
      });
    }
    return out;
  }, { category });
}

async function main() {
  await fs.mkdir(CATEGORY_DIR, { recursive: true });
  await fs.writeFile(LOG_PATH, "", "utf8");

  const state = {
    startedAt: new Date().toISOString(),
    status: "starting",
    currentUrl: "",
    challengeCleared: false,
    records: [],
    countsByCategory: {},
    notes: [
      "This scraper uses a visible persistent Chrome session so wiki.gg cookies and challenge clearance can persist across runs.",
      "If a challenge page appears, clear it in the Chrome window and the scraper will resume.",
    ],
  };
  await persist(state);

  const { browser, context } = await connectToChrome(state);
  const page = context.pages()[0] || (await context.newPage());
  state.status = "running";
  await persist(state);

  try {
    for (const seed of SEEDS) {
      const url = toWikiUrl(seed.slug);
      await appendLog(`Opening ${url}`);
      await ensureUsablePage(page, url, state);

      let records = [];
      if (seed.slug === "Quests") {
        records = await extractQuestIndex(page);
      } else {
        records = await extractSimpleTable(page, seed.category);
      }

      for (const record of records) {
        const coords = parseCoords(record.raw || "");
        state.records.push({
          id: `${seed.category}-${slugify(record.title)}-${coords.x ?? "na"}-${coords.z ?? "na"}`,
          title: record.title,
          url: record.url,
          category: record.category,
          region: record.region || "",
          summary: `${record.title} scraped from the ${seed.slug} wiki index page.`,
          description: normalizeWhitespace(record.raw || ""),
          coordinates_raw: coordText(coords),
          coordinates: coords,
          requirements: record.requirements || [],
          enemies: [],
          bosses: [],
          drops: [],
          rewards: record.rewards || [],
          images: [],
          videos: [],
          tags: dedupe([seed.category, seed.slug]),
          notes: `Scraped from ${url} using persistent browser automation.`,
        });
      }

      state.records = [...new Map(state.records.map((record) => [record.id, record])).values()];
      await persist(state);
      await appendLog(`Seed ${seed.slug} produced ${records.length} rows.`);
    }

    state.status = "completed";
    state.notes = dedupe([...state.notes, "Seed-page scrape completed. Detail-page enrichment is the next pass."]);
    await persist(state);
    await appendLog("Completed seed scrape.");
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  await appendLog(`Fatal error: ${error.stack || error.message}`);
  throw error;
});
