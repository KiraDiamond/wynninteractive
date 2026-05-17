import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9666;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const OUTPUT_ROOT = path.join(ROOT, "data", "wiki-scrape", "supplemental-marker-content");
const PROFILE_DIR = path.join(OUTPUT_ROOT, "chrome-profile");
const PROGRESS_PATH = path.join(OUTPUT_ROOT, "progress.json");
const RAW_PATH = path.join(OUTPUT_ROOT, "supplemental-content.json");
const JS_OUTPUT_PATH = path.join(ROOT, "data", "generated-supplemental-marker-content.js");
const QUESTS_INDEX_URL = "https://wynncraft.wiki.gg/wiki/Quests";
const BOSS_ALTAR_INDEX_URL = "https://wynncraft.wiki.gg/wiki/Boss_Altar";
const CORRUPTED_DUNGEONS_URL = "https://wynncraft.fandom.com/wiki/Dungeons";
const RAID_PAGE_URLS = new Map([
  ["nest of the grootslangs", "https://wynncraft.wiki.gg/wiki/Nest_of_the_Grootslangs"],
  ["the canyon colossus", "https://wynncraft.wiki.gg/wiki/The_Canyon_Colossus_(Raid)"],
  ["the nameless anomaly", "https://wynncraft.wiki.gg/wiki/The_Nameless_Anomaly_(Raid)"],
  ["the wartorn palace", "https://wynncraft.wiki.gg/wiki/The_Wartorn_Palace"],
  ["orphion s nexus of light", "https://wynncraft.wiki.gg/wiki/Orphion%27s_Nexus_of_Light"],
]);
const RAID_OVERRIDES = new Map([
  ["nest of the grootslangs", {
    minLevel: "54",
    quest: "Realm of Light I - The Worm Holes",
    rune: "Az Rune",
    bosses: ["The Grootslang Wyrmlings"],
  }],
  ["the canyon colossus", {
    minLevel: "95",
    quest: "The Breaking Point",
    rune: "Tol Rune",
    bosses: ["The Canyon Colossus"],
  }],
  ["the nameless anomaly", {
    minLevel: "103",
    quest: "A Journey Further",
    rune: "Tol Rune",
    bosses: ["The Nameless Anomaly"],
  }],
  ["the wartorn palace", {
    minLevel: "119",
    quest: "The Hero of Gavel",
    rune: "Ek Rune",
    bosses: ["Anathema"],
  }],
  ["orphion s nexus of light", {
    minLevel: "79",
    quest: "Realm of Light V - The Realm of Light",
    rune: "Uth Rune",
    bosses: ["Orphion, the Light Beast", "The Parasite"],
  }],
]);
const WORLD_EVENT_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "categories", "world-event.json");
const CAVE_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "categories", "cave.json");
const SECRET_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "categories", "secret-discovery.json");
const BOSS_ALTAR_PATH = path.join(ROOT, "data", "wiki-scrape", "browser-persistent", "categories", "boss-altar.json");

const QUEST_FALLBACKS = [
  {
    markerId: "atlas-quests-the-qira-hive-372--5501",
    title: "The Qira Hive",
    url: "https://wynncraft.fandom.com/wiki/The_Qira_Hive_(Quest)",
    kind: "quest-fallback",
  },
  {
    markerId: "atlas-quests-tower-of-ascension--350--389",
    title: "Tower of Ascension",
    url: "https://wynncraft.fandom.com/wiki/Tower_of_Ascension_(Quest)",
    kind: "quest-fallback",
  },
];

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function titleKey(value) {
  return normalizeWhitespace(value)
    .replace(/’/g, "'")
    .replace(/^mini-quest\s*-\s*/i, "")
    .replace(/\s+Dungeon$/i, "")
    .replace(/\s+\(Quest\)\s*$/gi, "")
    .replace(/\s*\(\d+(?:\.\d+)+\)\s*$/g, "")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function stripNotes(value) {
  return normalizeWhitespace(value).replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : "")
    .join(" ");
}

function miniQuestDisplayTitle(markerTitle) {
  return normalizeWhitespace(markerTitle).replace(/^Mini-Quest\s*-\s*/i, "");
}

function dungeonDisplayTitle(markerTitle) {
  return normalizeWhitespace(markerTitle).replace(/\s+Dungeon$/i, "");
}

function compactLine(value, maxLength = 220) {
  const text = stripNotes(compactParagraph(value));
  if (text.length <= maxLength) {
    return text;
  }
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((part) => normalizeWhitespace(part)).filter(Boolean) || [text];
  let output = "";
  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }
    const next = output ? `${output} ${sentence}` : sentence;
    if (next.length > maxLength) {
      break;
    }
    output = next;
  }
  return output || text.slice(0, maxLength - 1).trimEnd() + "…";
}

function joinLabelValue(label, value) {
  const cleanValue = stripNotes(value);
  if (!cleanValue) {
    return "";
  }
  return label ? `${label}: ${cleanValue}` : cleanValue;
}

function withoutNpcDialogue(items) {
  return (items || []).filter((item) => {
    const text = stripNotes(item);
    if (!text) {
      return false;
    }
    if (/^Dialogue:?$/i.test(text)) {
      return false;
    }
    if (/^(?:\?{3}|[A-Z][A-Za-z' -]{1,40}):\s/.test(text)) {
      return false;
    }
    return true;
  });
}

function normalizeInfoboxLabel(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getInfoboxValue(infobox, patterns) {
  for (const [label, value] of Object.entries(infobox || {})) {
    const normalizedLabel = normalizeInfoboxLabel(label);
    if (patterns.some((pattern) => pattern.test(normalizedLabel))) {
      return stripNotes(value);
    }
  }
  return "";
}

function buildSection(title, items) {
  const normalized = dedupe((items || []).map((item) => compactLine(item)).filter(Boolean));
  if (!title || !normalized.length) {
    return null;
  }
  return { title, items: normalized };
}

function wikiEncodeTitle(value) {
  return encodeURIComponent(String(value ?? "").replace(/ /g, "_")).replace(/%2F/g, "/");
}

function fandomDungeonUrl(title) {
  const normalized = normalizeWhitespace(title).replace(/\s+Dungeon$/i, "");
  return `https://wynncraft.fandom.com/wiki/${wikiEncodeTitle(normalized)}`;
}

function officialRaidUrl(title) {
  return RAID_PAGE_URLS.get(titleKey(title)) || `https://wynncraft.wiki.gg/wiki/${wikiEncodeTitle(title)}`;
}

function officialBossAltarUrl(title) {
  return `https://wynncraft.wiki.gg/wiki/${wikiEncodeTitle(title)}`;
}

function firstSentence(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return "";
  }
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] || text).trim();
}

function trimWikiHeading(value) {
  return normalizeWhitespace(value).replace(/\[\]$/, "").trim();
}

function compactParagraph(value) {
  return normalizeWhitespace(value)
    .replace(/\s+Wynncraft Map\b/gi, "")
    .replace(/\s+This page contains spoilers\./gi, "")
    .trim();
}

function buildStageExplanation(steps) {
  const blocks = steps
    .map((items, index) => {
      const normalized = dedupe(items);
      if (!normalized.length) {
        return "";
      }
      return [`Stage ${index + 1}`, ...normalized.map((item) => `• ${item}`)].join("\n");
    })
    .filter(Boolean);

  return blocks.join("\n\n");
}

function buildSectionExplanation(sections) {
  return sections
    .filter((section) => section.title && section.items.length)
    .map((section) => [
      section.title,
      ...section.items.map((item) => `• ${item}`),
    ].join("\n"))
    .join("\n\n");
}

function parseChestTiers(description) {
  return [...String(description ?? "").matchAll(/(\d+x Tier \d(?:\s*\[[^\]]+\])?)/g)]
    .map((match) => normalizeWhitespace(match[1]));
}

function parseCoordinateTriple(value) {
  const match = String(value ?? "").match(/(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/);
  if (!match) {
    return null;
  }
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

function chooseCoverImage(images) {
  const nonIcon = images.find((url) => url && !url.startsWith("data:") && !/CBQuestIcon|QuestIcon|PinpointConcept|map\.png|icon/i.test(url));
  return nonIcon || images[0] || "";
}

function cleanGallery(images) {
  return dedupe(images.filter((url) => url && !url.startsWith("data:")));
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    await wait(1000);
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

async function loadProgress(targets) {
  try {
    const current = JSON.parse(await fs.readFile(PROGRESS_PATH, "utf8"));
    current.targets = current.targets || targets;
    current.entries = current.entries || {};
    current.failed = current.failed || [];
    return current;
  } catch {
    return {
      startedAt: new Date().toISOString(),
      status: "starting",
      currentUrl: "",
      targets,
      entries: {},
      failed: [],
      notes: [
        "Supplemental marker content adds world-event reward pools, cave chest tiers, secret-discovery routes, and quest fallback guides.",
        "The run uses a regular Chrome session over CDP and checkpoints after every target.",
      ],
    };
  }
}

function buildRawExport(progress) {
  return Object.values(progress.entries)
    .sort((a, b) => a.markerId.localeCompare(b.markerId));
}

async function persist(progress) {
  const raw = buildRawExport(progress);
  const generated = Object.fromEntries(raw.map((entry) => [
    entry.markerId,
    {
      summary: entry.summary,
      explanation: entry.explanation,
      coverImage: entry.coverImage,
      gallery: entry.gallery,
      sourceUrl: entry.sourceUrl,
      tutorials: entry.tutorials,
    },
  ]));

  await writeJson(PROGRESS_PATH, progress);
  await writeJson(RAW_PATH, raw);

  const file = [
    "// Generated by scripts/build-supplemental-marker-content.mjs",
    `// Source: ${path.relative(ROOT, RAW_PATH).replace(/\\/g, "/")}`,
    "",
    `export const GENERATED_SUPPLEMENTAL_MARKER_CONTENT = ${JSON.stringify(generated, null, 2)};`,
    "",
  ].join("\n");
  await fs.writeFile(JS_OUTPUT_PATH, file, "utf8");
}

function seedMap(records) {
  return new Map(records.map((record) => [titleKey(record.title), record]));
}

function buildTargets(worldEvents, caves, secrets, bossAltars) {
  const worldEventSource = seedMap(worldEvents);
  const caveSource = seedMap(caves);
  const secretSource = seedMap(secrets);
  const bossAltarSource = seedMap(bossAltars);

  const targets = [{
    markerId: "__mini_quests__",
    title: "Mini Quests",
    url: QUESTS_INDEX_URL,
    kind: "mini-quest-index",
  }];

  for (const marker of WIKI_MAP_MARKERS) {
    const key = titleKey(marker.title);
    if (marker.category === "world_events") {
      const record = worldEventSource.get(key);
      if (record?.url) {
        targets.push({
          markerId: marker.id,
          title: marker.title,
          url: record.url,
          kind: "world-event",
        });
      }
      continue;
    }

    if (marker.category === "caves") {
      const record = caveSource.get(key);
      if (record?.url) {
        targets.push({
          markerId: marker.id,
          title: marker.title,
          url: record.url,
          kind: "cave",
          seedDescription: record.description,
        });
      }
      continue;
    }

    if (marker.category === "secret_discovery") {
      const record = secretSource.get(key);
      if (record?.url) {
        targets.push({
          markerId: marker.id,
          title: marker.title,
          url: record.url,
          kind: "secret-discovery",
        });
      }
      continue;
    }

    if (marker.category === "dungeon") {
      if (normalizeWhitespace(marker.title) === "Corrupted Dungeons") {
        targets.push({
          markerId: marker.id,
          title: marker.title,
          url: CORRUPTED_DUNGEONS_URL,
          kind: "corrupted-dungeons",
        });
      } else {
        targets.push({
          markerId: marker.id,
          title: marker.title,
          url: fandomDungeonUrl(marker.title),
          kind: "dungeon",
        });
      }
      continue;
    }

    if (marker.category === "raid") {
      targets.push({
        markerId: marker.id,
        title: marker.title,
        url: officialRaidUrl(marker.title),
        kind: "raid",
      });
      continue;
    }

    if (marker.category === "boss_altar") {
      const record = bossAltarSource.get(key);
      targets.push({
        markerId: marker.id,
        title: marker.title,
        url: officialBossAltarUrl(marker.title),
        kind: "boss-altar",
        seedDescription: record?.description || "",
        seedUrl: record?.url || "",
      });
    }
  }

  return [...targets, ...QUEST_FALLBACKS];
}

async function ensureUsablePage(page, url, progress) {
  progress.currentUrl = url;
  await persist(progress);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    throw new Error(`Challenge page for ${url}`);
  }
}

async function extractMiniQuestIndex(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    if (!content) {
      return { rows: [], sourceUrl: location.href };
    }

    const rows = [];

    function parseTable(table, sectionLabel) {
      const headerCells = [...table.querySelectorAll("tr:first-child th, thead th")]
        .map((cell) => normalize(cell.textContent))
        .filter(Boolean);
      const bodyRows = [...table.querySelectorAll("tbody tr, tr")]
        .map((row) => [...row.querySelectorAll("td")].map((cell) => normalize(cell.textContent)).filter(Boolean))
        .filter((cells) => cells.length >= 5);

      if (!bodyRows.length) {
        return;
      }

      for (const cells of bodyRows) {
        const [
          rawName,
          level,
          startLocation,
          coordinates,
          province,
          itemsRequired,
          combatXp,
          extraXp,
        ] = cells;

        const name = normalize(rawName).replace(/^Mini-Quest\s*-\s*/i, "");
        if (!name || /Mini-Quest Name|Name/i.test(name)) {
          continue;
        }

        const professionHeader = headerCells.find((header) => /Min\.?\s*Level/i.test(header) && !/^Min\.?\s*Level$/i.test(header)) || "";
        const professionRewardHeader = headerCells.find((header) => /XP Given/i.test(header) && !/Combat XP/i.test(header)) || "";
        rows.push({
          section: sectionLabel,
          name,
          level,
          startLocation,
          coordinates,
          province,
          itemsRequired,
          combatXp,
          extraXp,
          professionHeader,
          professionRewardHeader,
        });
      }
    }

    let currentSection = "";
    for (const node of [...content.children]) {
      const tag = node.tagName;
      if (tag === "H2" || tag === "H3") {
        currentSection = normalize(node.textContent);
        continue;
      }

      if (tag === "TABLE" && /Slaying Posts|Gathering Posts/i.test(currentSection)) {
        parseTable(node, currentSection);
        continue;
      }

      if (tag === "DIV" && /Slaying Posts|Gathering Posts/i.test(currentSection)) {
        for (const table of node.querySelectorAll("table")) {
          parseTable(table, currentSection);
        }
      }
    }

    return { rows, sourceUrl: location.href };
  });
}

async function extractDungeonPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/QuestIcon|CBQuestIcon|\/icons?\//i.test(src))
      .slice(0, 10);

    const infobox = {};
    for (const item of document.querySelectorAll(".portable-infobox .pi-item.pi-data")) {
      const label = normalize(item.querySelector(".pi-data-label")?.textContent);
      const value = normalize(item.querySelector(".pi-data-value")?.textContent);
      if (label && value) {
        infobox[label] = value;
      }
    }
    if (!Object.keys(infobox).length) {
      for (const row of document.querySelectorAll(".infobox tr")) {
        const label = normalize(row.querySelector("th")?.textContent);
        const value = normalize(row.querySelector("td")?.textContent);
        if (label && value) {
          infobox[label] = value;
        }
      }
    }

    const intro = [];
    if (content) {
      for (const node of [...content.children]) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }
        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            intro.push(text);
          }
        }
      }
    }

    const sections = [];
    if (content) {
      const headings = [...content.querySelectorAll(":scope > h2, :scope > h3")];
      for (const heading of headings) {
        const headingText = normalize(heading.textContent);
        if (!/Preparing|Room\s+\d+|Boss Room|Dungeon Merchant|Merchant|Rewards?|Tips|Strategy/i.test(headingText)) {
          continue;
        }

        const items = [];
        const tableRows = [];
        for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
          if (/^H[23]$/.test(node.tagName)) {
            break;
          }

          if (node.tagName === "P") {
            const text = normalize(node.textContent);
            if (text) {
              items.push(text);
            }
            continue;
          }

          if (node.tagName === "UL" || node.tagName === "OL") {
            items.push(...[...node.querySelectorAll(":scope > li")].map((item) => normalize(item.textContent)).filter(Boolean));
            continue;
          }

          if (node.tagName === "TABLE") {
            const rows = [...node.querySelectorAll("tr")]
              .map((row) => [...row.querySelectorAll("th, td")].map((cell) => normalize(cell.textContent)).filter(Boolean))
              .filter((cells) => cells.length);
            if (rows.length) {
              tableRows.push(...rows);
            }
          }
        }

        sections.push({ title: headingText, items, tableRows });
      }
    }

    return { title, intro, infobox, sections, images, sourceUrl: location.href };
  });
}

async function extractCorruptedDungeonsPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const intro = [];
    const variants = [];

    if (content) {
      for (const node of [...content.children]) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }
        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            intro.push(text);
          }
        }
      }

      for (const table of content.querySelectorAll("table")) {
        const rows = [...table.querySelectorAll("tr")]
          .map((row) => [...row.querySelectorAll("th, td")].map((cell) => normalize(cell.textContent)).filter(Boolean))
          .filter((cells) => cells.length >= 3);
        for (const cells of rows) {
          if (!/^Corrupted /i.test(cells[0])) {
            continue;
          }
          variants.push({
            name: cells[0],
            level: cells[1] || "",
            boss: cells.at(-1) || "",
          });
        }
      }
    }

    return { title, intro, variants, sourceUrl: location.href };
  });
}

async function extractBossAltarPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/QuestIcon|CBQuestIcon|\/icons?\//i.test(src))
      .slice(0, 10);

    const infobox = {};
    for (const item of document.querySelectorAll(".portable-infobox .pi-item.pi-data")) {
      const label = normalize(item.querySelector(".pi-data-label")?.textContent);
      const value = normalize(item.querySelector(".pi-data-value")?.textContent);
      if (label && value) {
        infobox[label] = value;
      }
    }
    if (!Object.keys(infobox).length) {
      for (const row of document.querySelectorAll(".infobox tr")) {
        const label = normalize(row.querySelector("th")?.textContent);
        const value = normalize(row.querySelector("td")?.textContent);
        if (label && value) {
          infobox[label] = value;
        }
      }
    }

    const intro = [];
    if (content) {
      for (const node of [...content.children]) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }
        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            intro.push(text);
          }
        }
      }
    }

    const sections = [];
    if (content) {
      for (const heading of content.querySelectorAll(":scope > h2, :scope > h3")) {
        const headingText = normalize(heading.textContent);
        if (!/Location|Items Required|Bosses|Rewards?|Drops?|Tips/i.test(headingText)) {
          continue;
        }

        const items = [];
        const tables = [];
        for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
          if (/^H[23]$/.test(node.tagName)) {
            break;
          }

          if (node.tagName === "P") {
            const text = normalize(node.textContent);
            if (text) {
              items.push(text);
            }
            continue;
          }

          if (node.tagName === "UL" || node.tagName === "OL") {
            items.push(...[...node.querySelectorAll(":scope > li")].map((item) => normalize(item.textContent)).filter(Boolean));
            continue;
          }

          if (node.tagName === "TABLE") {
            const rows = [...node.querySelectorAll("tr")]
              .map((row) => [...row.querySelectorAll("th, td")].map((cell) => normalize(cell.textContent)).filter(Boolean))
              .filter((cells) => cells.length);
            if (rows.length) {
              tables.push(rows);
            }
          }
        }

        sections.push({ title: headingText, items, tables });
      }
    }

    return { title, intro, infobox, sections, images, sourceUrl: location.href };
  });
}

async function extractRaidPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/QuestIcon|CBQuestIcon|\/icons?\//i.test(src))
      .slice(0, 10);

    const infobox = {};
    for (const item of document.querySelectorAll(".portable-infobox .pi-item.pi-data")) {
      const label = normalize(item.querySelector(".pi-data-label")?.textContent);
      const value = normalize(item.querySelector(".pi-data-value")?.textContent);
      if (label && value) {
        infobox[label] = value;
      }
    }
    if (!Object.keys(infobox).length) {
      for (const row of document.querySelectorAll(".infobox tr")) {
        const label = normalize(row.querySelector("th")?.textContent);
        const value = normalize(row.querySelector("td")?.textContent);
        if (label && value) {
          infobox[label] = value;
        }
      }
    }

    const intro = [];
    if (content) {
      for (const node of [...content.children]) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }
        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            intro.push(text);
          }
        }
      }
    }

    const sections = [];
    if (content) {
      for (const heading of content.querySelectorAll(":scope > h2, :scope > h3")) {
        const headingText = normalize(heading.textContent);
        if (!/Walkthrough|Mechanics|Strategy|Tips|Rewards?/i.test(headingText)) {
          continue;
        }

        const items = [];
        for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
          if (/^H[23]$/.test(node.tagName)) {
            break;
          }

          if (node.tagName === "P") {
            const text = normalize(node.textContent);
            if (text) {
              items.push(text);
            }
            continue;
          }

          if (node.tagName === "UL" || node.tagName === "OL") {
            items.push(...[...node.querySelectorAll(":scope > li")].map((item) => normalize(item.textContent)).filter(Boolean));
          }
        }

        sections.push({ title: headingText, items });
      }
    }

    return { title, intro, infobox, sections, images, sourceUrl: location.href };
  });
}

async function extractWorldEventPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/PinpointConcept|renderlocation|CBQuestIcon|QuestIcon|\/icons?\//i.test(src))
      .slice(0, 8);

    if (!content) {
      return { title, paragraphs: [], sections: [], images, sourceUrl: location.href };
    }

    const headings = [...content.querySelectorAll("h2, h3")];
    const rewardsHeading = headings.find((node) => normalize(node.textContent).toLowerCase() === "rewards");
    const paragraphs = [];
    const sections = [];

    if (rewardsHeading) {
      for (let node = rewardsHeading.nextElementSibling; node; node = node.nextElementSibling) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }

        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            paragraphs.push(text);
          }
        }

        if (node.tagName === "TABLE") {
          for (const table of node.querySelectorAll("table.wikitable")) {
            const titleText = normalize(table.querySelector("th")?.textContent);
            if (!titleText) {
              continue;
            }
            const listItems = [...table.querySelectorAll("li")]
              .map((item) => normalize(item.textContent))
              .filter(Boolean);
            const paragraphItems = listItems.length
              ? listItems
              : table.textContent
                .split("\n")
                .map((item) => normalize(item))
                .filter((item) => item && item !== titleText);
            sections.push({ title: titleText, items: paragraphItems });
          }
        }
      }
    }

    return { title, paragraphs, sections, images, sourceUrl: location.href };
  });
}

async function extractSecretDiscoveryPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/PinpointConcept|renderlocation|CBQuestIcon|QuestIcon|\/icons?\//i.test(src))
      .slice(0, 8);

    const paragraphs = [...content.querySelectorAll(":scope > p")]
      .map((node) => normalize(node.textContent))
      .filter((text) => text && !/This page contains spoilers/i.test(text));
    const summary = paragraphs.find((text) => /is a Secret Discovery/i.test(text)) || paragraphs[0] || "";

    const headings = [...content.querySelectorAll(":scope > h2, :scope > h3")]
      .map((node) => ({ text: normalize(node.textContent), node }))
      .filter(({ text }) => text && !/Trivia|Navigation|Contents/i.test(text));
    const sectionHeading = headings.find(({ text }) => /Towers|Route|Solution|Access|Obtaining|Interior|Discovery/i.test(text)) || headings[0] || null;

    const steps = [];
    if (sectionHeading) {
      let current = null;
      for (let node = sectionHeading.node.nextElementSibling; node; node = node.nextElementSibling) {
        if (/^H[23]$/.test(node.tagName)) {
          break;
        }

        if (node.tagName === "TABLE" && /Location/i.test(normalize(node.textContent))) {
          const locationLabel = normalize(node.querySelector("td b")?.textContent) || normalize(node.textContent.split("Wynncraft Map")[0]);
          const coords = normalize(node.querySelector("span[style*='user-select: all']")?.textContent || "");
          current = [];
          steps.push(current);
          current.push(coords ? `Visit ${locationLabel} at ${coords}.` : `Visit ${locationLabel}.`);
          continue;
        }

        if (!current) {
          continue;
        }

        if (node.tagName === "P") {
          const text = normalize(node.textContent);
          if (text) {
            current.push(text);
          }
          continue;
        }

        if (node.tagName === "UL") {
          const items = [...node.querySelectorAll(":scope > li")]
            .map((item) => normalize(item.textContent))
            .filter(Boolean)
            .filter((text) => /\b(jump|climb|enter|use|press|walk|head|talk|go|visit|follow|collect|listen|reach|find)\b/i.test(text));
          if (items.length) {
            current.push(...items);
          }
        }
      }
    }

    return { title, summary, steps, images, sourceUrl: location.href };
  });
}

async function extractQuestFallbackPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const content = document.querySelector("#mw-content-text .mw-parser-output, .mw-parser-output");
    const title = normalize(document.querySelector(".page-header__title, .mw-page-title-main, h1")?.textContent);
    const images = [...document.querySelectorAll(".mw-parser-output img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => new URL(src, location.origin).toString())
      .filter((src) => !/CBQuestIcon|QuestIcon|\/icons?\//i.test(src))
      .slice(0, 8);
    const infobox = [...document.querySelectorAll(".portable-infobox .pi-item, .infobox tr")]
      .map((node) => normalize(node.textContent))
      .filter(Boolean);
    const headings = [...content.querySelectorAll("h2")]
      .map((node) => normalize(node.textContent))
      .filter(Boolean);
    const paragraphs = [...content.querySelectorAll(":scope > p")]
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    return { title, infobox, headings, paragraphs, images, sourceUrl: location.href };
  });
}

function worldEventEntry(target, data) {
  const completion = data.paragraphs
    .filter((text) => /awards|reward chest/i.test(text))
    .map((text) => compactParagraph(text));

  const sections = data.sections.map((section) => ({
    title: section.title,
    items: section.items.map((item) => compactParagraph(item)).filter(Boolean),
  }));

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary: completion[0] || "",
    explanation: buildSectionExplanation([
      completion.length > 1 ? { title: "Completion", items: completion } : null,
      ...sections,
    ].filter(Boolean)),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

function caveEntry(target) {
  const tiers = dedupe(parseChestTiers(target.seedDescription));
  return {
    markerId: target.markerId,
    title: target.title,
    sourceUrl: target.url,
    summary: tiers.length ? `Loot chests: ${tiers.join(", ")}.` : "",
    explanation: tiers.length ? buildSectionExplanation([{ title: "Loot Chests", items: tiers }]) : "",
    coverImage: "",
    gallery: [],
    tutorials: [],
  };
}

function compactSecretStep(value) {
  return compactParagraph(value)
    .replace(/^Visit Location at /i, "Visit ")
    .replace(/\s+Its echo, like the others, is preceded by.+$/i, "")
    .replace(/\s+The text of the echo is as follows:?$/i, "")
    .replace(/\s+Its echo says:?$/i, "")
    .replace(/\s+which says:?$/i, "")
    .trim();
}

function secretDiscoveryEntry(target, data) {
  const cleanedSteps = data.steps
    .map((items) => items.map((item) => compactSecretStep(item)).filter(Boolean))
    .filter((items) => items.length);

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary: firstSentence(data.summary),
    explanation: buildStageExplanation(cleanedSteps),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

function fallbackQuestEntry(target, data) {
  const lowerTitle = titleKey(data.title || target.title);
  const headingSet = new Set(data.headings.map((heading) => trimWikiHeading(heading)));
  let steps = [];

  if (lowerTitle === "the qira hive") {
    steps = [
      ["Talk to Yansur at The Qira Hive to start the quest."],
      ["Complete the Thunder Division and return to Yansur for the Thunder Voucher."],
      ["Complete the Air Division and return to Yansur for the Air Voucher."],
      ["Complete the Earth Division and return to Yansur for the Earth Voucher."],
      ["Complete the Water Division and return to Yansur for the Water Voucher."],
      ["Complete the Fire Division and return to Yansur for the Fire Voucher."],
      ["Complete the Master Division to unlock Qira's final challenge."],
      ["After clearing the Master Division, finish the quest with Yansur and claim the final reward."],
    ];
  } else if (lowerTitle === "tower of ascension") {
    steps = [
      ["Talk to Ankou at the Tower of Ascension to begin the quest."],
      ["Work through 7 floors in order. Each floor has 9 regular levels and 1 boss level."],
      ["On regular levels, collect 5 tokens and hand them to the Floormaster to advance."],
      ["On boss levels, collect the boss token once to unlock the next floor."],
      ["After clearing the final floor, return to Ankou for the quest reward."],
    ];
  }

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary: firstSentence(data.paragraphs.find((text) => /is .*quest/i.test(text)) || ""),
    explanation: buildStageExplanation(steps),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

function miniQuestEntry(marker, row, sourceUrl) {
  const rewards = [];
  if (row.combatXp) {
    rewards.push(joinLabelValue("Combat XP", row.combatXp));
  }
  if (row.extraXp) {
    const label = row.professionRewardHeader
      ? row.professionRewardHeader.replace(/\s*XP Given$/i, " XP")
      : "Additional XP";
    rewards.push(joinLabelValue(label, row.extraXp));
  }

  const steps = [
    row.startLocation
      ? `Start at ${stripNotes(row.startLocation)}${row.coordinates ? ` (${stripNotes(row.coordinates)})` : ""}.`
      : "",
    `Complete the objective: ${miniQuestDisplayTitle(marker.title)}.`,
    row.itemsRequired && !/^[-—–]$/.test(stripNotes(row.itemsRequired))
      ? `Bring ${stripNotes(row.itemsRequired)}.`
      : "",
    rewards.length ? `Claim rewards: ${rewards.join("; ")}.` : "",
  ].filter(Boolean);

  return {
    markerId: marker.id,
    title: marker.title,
    sourceUrl,
    summary: row.startLocation
      ? `One-stage mini-quest starting at ${stripNotes(row.startLocation)}${row.province ? ` in ${stripNotes(row.province)}` : ""}.`
      : "One-stage mini-quest.",
    explanation: buildStageExplanation([steps]),
    coverImage: "",
    gallery: [],
    tutorials: [],
  };
}

function buildMiniQuestEntryMap(rows, sourceUrl) {
  const byTitle = new Map(rows.map((row) => [titleKey(row.name), row]));
  const withCoords = rows
    .map((row) => ({ row, coordinates: parseCoordinateTriple(row.coordinates) }))
    .filter((item) => item.coordinates);
  const markers = WIKI_MAP_MARKERS.filter((marker) => marker.category === "mini_quests");
  const entries = {};

  for (const marker of markers) {
    let row = byTitle.get(titleKey(marker.title));
    if (!row) {
      const markerX = Number(marker.position?.world?.x);
      const markerZ = Number(marker.position?.world?.z);
      row = withCoords.find((item) => Math.abs(markerX - item.coordinates.x) <= 6 && Math.abs(markerZ - item.coordinates.z) <= 6)?.row;
    }
    if (!row) {
      const uncertainObjective = miniQuestDisplayTitle(marker.title);
      entries[marker.id] = {
        markerId: marker.id,
        title: marker.title,
        sourceUrl,
        summary: "Current map marker exists, but the live wiki index no longer exposes a confirmed row for this legacy mini-quest name.",
        explanation: buildStageExplanation([[
          "Start at this marker location on the map.",
          `Complete the objective shown by the marker title: ${uncertainObjective}.`,
          "The official Quests index appears to have renamed or replaced this gathering post, so item counts and rewards are left unconfirmed on purpose.",
        ]]),
        coverImage: "",
        gallery: [],
        tutorials: [],
      };
      continue;
    }

    entries[marker.id] = miniQuestEntry(marker, row, sourceUrl);
  }

  return entries;
}

function dungeonLootLines(section) {
  const products = [];
  for (const row of section.tableRows || []) {
    if (!row.length) {
      continue;
    }
    const [first, second] = row;
    if (/Product|Cost|Ingredients?/i.test(first)) {
      continue;
    }
    const line = second && second !== first ? `${stripNotes(first)} - ${stripNotes(second)}` : stripNotes(first);
    if (line) {
      products.push(line);
    }
  }
  return dedupe(products);
}

function dungeonEntry(target, data) {
  const level = getInfoboxValue(data.infobox, [/level/, /suggested level/]);
  const boss = getInfoboxValue(data.infobox, [/boss/]);
  const reward = getInfoboxValue(data.infobox, [/reward/]);
  const requirement = getInfoboxValue(data.infobox, [/quest/, /requirement/]);
  const location = getInfoboxValue(data.infobox, [/location/]);

  const preparation = data.sections.find((section) => /Preparing/i.test(section.title));
  const roomSections = data.sections.filter((section) => /Room\s+\d+|Boss Room/i.test(section.title));
  const merchant = data.sections.find((section) => /Dungeon Merchant|Merchant/i.test(section.title));
  const rewardSection = data.sections.find((section) => /Reward/i.test(section.title));

  const sections = [
    buildSection("Preparation", [
      level ? `Suggested level ${level}.` : "",
      requirement ? `Required quest: ${requirement}.` : "",
      location ? `Location: ${location}.` : "",
      ...withoutNpcDialogue(preparation?.items || []),
    ]),
    ...roomSections.map((section) => buildSection(trimWikiHeading(section.title), withoutNpcDialogue(section.items).slice(0, 6))),
    buildSection("Rewards", [
      reward ? reward : "",
      ...withoutNpcDialogue(rewardSection?.items || []),
    ]),
    buildSection("Dungeon Loot", merchant ? dungeonLootLines(merchant) : []),
  ].filter(Boolean);

  const introSummary = compactLine(data.intro[0] || "");
  const summary = dedupe([
    level ? `Level ${level}.` : "",
    boss ? `Boss: ${boss}.` : "",
    introSummary,
  ]).join(" ");

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary,
    explanation: buildSectionExplanation(sections),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

function corruptedDungeonsEntry(target, data) {
  const lines = dedupe((data.variants || []).map((variant) => {
    const level = stripNotes(variant.level);
    const boss = stripNotes(variant.boss);
    return [stripNotes(variant.name), level ? `(${level})` : "", boss ? `- Boss: ${boss}` : ""].filter(Boolean).join(" ");
  }));

  return {
    markerId: target.markerId,
    title: target.title,
    sourceUrl: data.sourceUrl,
    summary: compactLine(data.intro.find((line) => /harder|endgame|corrupted/i.test(line)) || data.intro[0] || "Harder endgame variants of the standard dungeons."),
    explanation: buildSectionExplanation([
      buildSection("Available Dungeons", lines),
    ].filter(Boolean)),
    coverImage: "",
    gallery: [],
    tutorials: [],
  };
}

function bossAltarDropLines(section) {
  const drops = [];
  for (const table of section.tables || []) {
    const headerRow = table.find((row) => row.some((cell) => /drop|reward/i.test(cell))) || [];
    const dropIndex = headerRow.findIndex((cell) => /drop|reward/i.test(cell));
    const nameIndex = headerRow.findIndex((cell) => /mob|boss|name/i.test(cell));
    if (dropIndex >= 0) {
      for (const row of table) {
        if (row === headerRow || row.length <= dropIndex) {
          continue;
        }
        const dropText = stripNotes(row[dropIndex]);
        if (!dropText || /drop|reward/i.test(dropText)) {
          continue;
        }
        const name = nameIndex >= 0 && row[nameIndex] ? stripNotes(row[nameIndex]) : "";
        drops.push(name ? `${name}: ${dropText}` : dropText);
      }
      continue;
    }

    for (const row of table) {
      const line = row.map((cell) => stripNotes(cell)).filter(Boolean).join(" - ");
      if (
        line
        && !/drop|reward/i.test(line)
        && !/^\d+\s*:/i.test(line)
        && !/\(phase\s*\d+\)/i.test(line)
      ) {
        drops.push(line);
      }
    }
  }
  return dedupe(drops);
}

function isInvalidBossDropLine(value) {
  const text = stripNotes(value);
  return !text
    || /^\d+\s*:/i.test(text)
    || /\(phase\s*\d+\)/i.test(text)
    || /^phase\s*\d+/i.test(text);
}

function bossAltarEntry(target, data) {
  const level = getInfoboxValue(data.infobox, [/level/]);
  const location = getInfoboxValue(data.infobox, [/location/]);
  const quest = getInfoboxValue(data.infobox, [/quest/]);
  const itemsRequired = getInfoboxValue(data.infobox, [/items required/, /item required/, /cost/]);
  const bosses = getInfoboxValue(data.infobox, [/boss/]);
  const rewards = getInfoboxValue(data.infobox, [/reward/, /drops?/]);

  const bossSection = data.sections.find((section) => /Bosses/i.test(section.title));
  const rewardsSection = data.sections.find((section) => /Rewards?|Drops?/i.test(section.title));
  const itemsSection = data.sections.find((section) => /Items Required/i.test(section.title));
  const tipsSection = data.sections.find((section) => /Tips/i.test(section.title));

  const sections = [
    buildSection("Access", [
      level ? `Recommended level ${level}.` : "",
      location ? `Location: ${location}.` : "",
      quest ? `Required quest: ${quest}.` : "",
      itemsRequired ? `Items required: ${itemsRequired}.` : "",
      ...withoutNpcDialogue(itemsSection?.items || []),
    ]),
    buildSection("Bosses", [
      bosses ? bosses : "",
      ...withoutNpcDialogue(bossSection?.items || []),
    ]),
    buildSection("Drops", [
      rewards ? rewards : "",
      ...bossAltarDropLines(bossSection || { tables: [] }),
      ...bossAltarDropLines(rewardsSection || { tables: [] }),
      ...withoutNpcDialogue(rewardsSection?.items || []),
    ].filter((item) => !isInvalidBossDropLine(item))),
    buildSection("Tips", withoutNpcDialogue(tipsSection?.items || [])),
  ].filter(Boolean);

  const summary = dedupe([
    level ? `Level ${level}.` : "",
    bosses ? `Boss: ${bosses}.` : "",
    compactLine(data.intro[0] || ""),
  ]).join(" ");

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary,
    explanation: buildSectionExplanation(sections),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

function raidRuneLabel(value) {
  const text = stripNotes(value);
  if (!text) {
    return "";
  }
  const match = text.match(/\b(Az|Nii|Uth|Tol|Ek)\b/i);
  return match ? `${titleCase(match[1])} Rune` : text.replace(/\bRunes?\b/i, "Rune");
}

function raidBossLines(value) {
  return dedupe(
    String(value || "")
      .split(/\s{2,}|\n|,|;/)
      .map((item) => stripNotes(item))
      .filter(Boolean),
  );
}

function raidEntry(target, data) {
  const override = RAID_OVERRIDES.get(titleKey(target.title)) || null;
  const level = override?.minLevel || getInfoboxValue(data.infobox, [/player level minimum/, /minimum level/, /^level$/]);
  const quest = override?.quest || getInfoboxValue(data.infobox, [/quest requirements?/, /^quest$/]);
  const rune = override?.rune || raidRuneLabel(getInfoboxValue(data.infobox, [/rune cost/, /rune/]));
  const bosses = override?.bosses || raidBossLines(getInfoboxValue(data.infobox, [/boss/]));

  const sections = [
    buildSection("Entry", [
      level ? `Minimum level: ${level}.` : "",
      quest ? `Required quest: ${quest}.` : "",
      rune ? `Rune: 1 ${rune}.` : "",
      "Party size: 4 players.",
    ]),
    buildSection("Bosses", bosses),
  ].filter(Boolean);

  const summary = dedupe([
    level ? `Level ${level} raid.` : "",
    quest ? `Requires ${quest}.` : "",
    rune ? `Uses 1 ${rune}.` : "",
  ]).join(" ");

  return {
    markerId: target.markerId,
    title: data.title || target.title,
    sourceUrl: data.sourceUrl,
    summary,
    explanation: buildSectionExplanation(sections),
    coverImage: chooseCoverImage(data.images),
    gallery: cleanGallery(data.images),
    tutorials: [],
  };
}

async function main() {
  const [worldEvents, caves, secrets, bossAltars] = await Promise.all([
    fs.readFile(WORLD_EVENT_PATH, "utf8").then(JSON.parse),
    fs.readFile(CAVE_PATH, "utf8").then(JSON.parse),
    fs.readFile(SECRET_PATH, "utf8").then(JSON.parse),
    fs.readFile(BOSS_ALTAR_PATH, "utf8").then(JSON.parse),
  ]);

  const targets = buildTargets(worldEvents, caves, secrets, bossAltars);
  const progress = await loadProgress(targets);
  const forceRefreshIds = new Set(
    String(process.env.FORCE_REFRESH_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  progress.status = "running";
  await persist(progress);

  const { browser, context } = await connectToChrome();
  const page = context.pages()[0] || await context.newPage();
  const miniQuestMarkers = WIKI_MAP_MARKERS.filter((marker) => marker.category === "mini_quests");

  for (const target of targets) {
    if (target.kind === "mini-quest-index") {
      const needsMiniQuestRefresh = miniQuestMarkers.some((marker) => !progress.entries[marker.id] || forceRefreshIds.has(marker.id));
      if (!needsMiniQuestRefresh) {
        continue;
      }
    } else if (progress.entries[target.markerId] && !forceRefreshIds.has(target.markerId)) {
      continue;
    }

    if (target.kind === "cave") {
      progress.entries[target.markerId] = caveEntry(target);
      await persist(progress);
      continue;
    }

    try {
      await ensureUsablePage(page, target.url, progress);
      let entry;
      if (target.kind === "mini-quest-index") {
        Object.assign(progress.entries, buildMiniQuestEntryMap((await extractMiniQuestIndex(page)).rows, target.url));
        await persist(progress);
        await page.waitForTimeout(400);
        continue;
      } else if (target.kind === "world-event") {
        entry = worldEventEntry(target, await extractWorldEventPage(page));
      } else if (target.kind === "secret-discovery") {
        entry = secretDiscoveryEntry(target, await extractSecretDiscoveryPage(page));
      } else if (target.kind === "quest-fallback") {
        entry = fallbackQuestEntry(target, await extractQuestFallbackPage(page));
      } else if (target.kind === "dungeon") {
        entry = dungeonEntry(target, await extractDungeonPage(page));
      } else if (target.kind === "raid") {
        entry = raidEntry(target, await extractRaidPage(page));
      } else if (target.kind === "corrupted-dungeons") {
        entry = corruptedDungeonsEntry(target, await extractCorruptedDungeonsPage(page));
      } else if (target.kind === "boss-altar") {
        entry = bossAltarEntry(target, await extractBossAltarPage(page));
      } else {
        throw new Error(`Unknown target kind: ${target.kind}`);
      }

      progress.entries[target.markerId] = entry;
      await persist(progress);
      await page.waitForTimeout(400);
    } catch (error) {
      progress.failed.push({
        markerId: target.markerId,
        title: target.title,
        kind: target.kind,
        url: target.url,
        error: String(error?.message || error),
      });
      await persist(progress);
    }
  }

  progress.status = "completed";
  progress.completedAt = new Date().toISOString();
  await persist(progress);
  await browser.close();

  console.log(JSON.stringify({
    totalTargets: targets.length,
    completed: Object.keys(progress.entries).length,
    failed: progress.failed.length,
    output: path.relative(ROOT, JS_OUTPUT_PATH).replace(/\\/g, "/"),
  }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
