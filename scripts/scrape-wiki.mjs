import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = "https://wynncraft.wiki.gg/wiki";
const OUTPUT_DIR = "E:/projects/github/wynninteractive/data/wiki-scrape";
const CATEGORY_OUTPUT_DIR = path.join(OUTPUT_DIR, "categories");
const MASTER_PATH = path.join(OUTPUT_DIR, "master.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "summary.md");
const META_PATH = path.join(OUTPUT_DIR, "crawl-meta.json");
const PROGRESS_PATH = path.join(OUTPUT_DIR, "progress.json");
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const REQUEST_DELAY_MS = 900;

const seedPages = [
  { slug: "Quests", seedCategory: "quest", mode: "quests", required: true },
  { slug: "Caves", seedCategory: "cave", mode: "table", required: true },
  { slug: "Dungeons", seedCategory: "dungeon", mode: "table", required: true },
  { slug: "Raids", seedCategory: "raid", mode: "table", required: true },
  { slug: "Boss_Altar", seedCategory: "boss-altar", mode: "table", required: true },
  { slug: "World_Events", seedCategory: "world-event", mode: "table", required: true },
  { slug: "Secret_Discoveries", seedCategory: "secret-discovery", mode: "discoveries", required: true },
  { slug: "World_Discoveries", seedCategory: "world-discovery", mode: "discoveries", required: false },
  { slug: "Territorial_Discoveries", seedCategory: "territorial-discovery", mode: "discoveries", required: false },
  { slug: "Lootrunning", seedCategory: "lootrun-camp", mode: "lootrunning", required: false },
  { slug: "Category:Cities", seedCategory: "city", mode: "category", required: false },
  { slug: "Category:Locations", seedCategory: "location", mode: "category", required: false },
  { slug: "Category:Regions", seedCategory: "region", mode: "category", required: false },
  { slug: "Cities", seedCategory: "city", mode: "generic", required: false },
  { slug: "Locations", seedCategory: "location", mode: "generic", required: false },
  { slug: "Regions", seedCategory: "region", mode: "generic", required: false }
];

const stopHeadingNames = new Set([
  "gallery",
  "trivia",
  "history",
  "references",
  "see also",
  "external links",
  "navigation",
  "removed quests",
  "notes"
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value) {
  return (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return (value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n");
}

function slugToUrl(slug) {
  return `${BASE_URL}/${slug}`;
}

function normalizeWikiUrl(value) {
  try {
    const url = new URL(value, `${BASE_URL}/`);
    url.hash = "";
    if (url.pathname === "/") {
      return "https://wynncraft.wiki.gg/";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function shouldIgnoreWikiUrl(url) {
  if (!url.startsWith("https://wynncraft.wiki.gg/wiki/")) {
    return true;
  }
  const tail = url.replace("https://wynncraft.wiki.gg/wiki/", "");
  if (!tail || tail.includes("?") || tail.startsWith("Special:")) {
    return true;
  }
  const blockedPrefixes = ["File:", "Template:", "User:", "Talk:", "Forum:", "Help:", "Category:"];
  return blockedPrefixes.some((prefix) => tail.startsWith(prefix));
}

function dedupeStrings(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function splitListValue(value) {
  return dedupeStrings(
    cleanMultiline(value)
      .replace(/\s*[|/]\s*/g, "\n")
      .replace(/\s*•\s*/g, "\n")
      .split(/\n|,\s+(?=[A-Z0-9])/)
  );
}

function parseCoordinateText(raw) {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) {
    return { x: null, y: null, z: null };
  }
  const labeled =
    /x\s*[:=]\s*(-?\d+).{0,20}?y\s*[:=]\s*(-?\d+).{0,20}?z\s*[:=]\s*(-?\d+)/i.exec(normalized) ||
    /x\s*[:=]\s*(-?\d+).{0,20}?z\s*[:=]\s*(-?\d+)/i.exec(normalized);
  if (labeled) {
    if (labeled.length === 4) {
      return { x: Number(labeled[1]), y: Number(labeled[2]), z: Number(labeled[3]) };
    }
    return { x: Number(labeled[1]), y: null, z: Number(labeled[2]) };
  }
  const triples = normalized.match(/-?\d+/g)?.map(Number) || [];
  if (triples.length >= 3) {
    return { x: triples[0], y: triples[1], z: triples[2] };
  }
  if (triples.length === 2) {
    return { x: triples[0], y: null, z: triples[1] };
  }
  return { x: null, y: null, z: null };
}

function buildId(record) {
  const url = new URL(record.url);
  const slug = url.pathname.replace(/^\/wiki\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.toLowerCase();
}

function normalizeCategory(seedCategory, sourceSection, pageData) {
  const title = `${pageData.title} ${pageData.summary} ${pageData.description}`.toLowerCase();
  const section = (sourceSection || "").toLowerCase();
  const categories = pageData.pageCategories.join(" ").toLowerCase();
  if (seedCategory === "quest") {
    if (section.includes("mini-quest") || section.includes("slaying post") || section.includes("gathering post")) {
      return "mini-quest";
    }
    return "quest";
  }
  if (seedCategory === "lootrun-camp") {
    if (title.includes("camp")) {
      return "lootrun-camp";
    }
    return "location";
  }
  if (seedCategory === "location" || seedCategory === "city" || seedCategory === "region") {
    if (title.includes("city") || categories.includes("cities")) {
      return "city";
    }
    if (title.includes("region") || categories.includes("regions")) {
      return "region";
    }
    return "location";
  }
  return seedCategory;
}

function collectRequirements(pageData) {
  const values = [];
  for (const row of pageData.infoboxRows) {
    const label = row.label.toLowerCase();
    if (
      label.includes("requirement") ||
      label.includes("combat level") ||
      label === "level" ||
      label.includes("recommended level")
    ) {
      values.push(...splitListValue(row.value));
    }
  }
  for (const section of pageData.sections) {
    if (section.heading.toLowerCase().includes("requirement")) {
      values.push(...splitListValue(section.text));
    }
  }
  return dedupeStrings(values);
}

function collectField(pageData, labelMatchers, sectionMatchers = []) {
  const values = [];
  for (const row of pageData.infoboxRows) {
    const label = row.label.toLowerCase();
    if (labelMatchers.some((matcher) => label.includes(matcher))) {
      values.push(...splitListValue(row.value));
    }
  }
  for (const section of pageData.sections) {
    const heading = section.heading.toLowerCase();
    if (sectionMatchers.some((matcher) => heading.includes(matcher))) {
      values.push(...splitListValue(section.text));
    }
  }
  return dedupeStrings(values);
}

function buildNotes(seed, pageData, category) {
  const notes = [];
  if (pageData.cleanupFlag) {
    notes.push("Wiki page is marked for cleanup.");
  }
  if (pageData.uncertain) {
    notes.push("Page classification is uncertain; source URL preserved.");
  }
  if (seed.mode === "generic" || seed.mode === "category") {
    notes.push(`Discovered from ${seed.slug}.`);
  }
  if (category === "location" && seed.seedCategory === "lootrun-camp") {
    notes.push("Lootrunning source page linked to a non-camp location page.");
  }
  return notes.join(" ");
}

function isLikelyBadRecord(record) {
  return (
    !record.summary ||
    !record.description ||
    (!record.coordinates_raw && ["cave", "dungeon", "raid", "boss-altar", "lootrun-camp", "location", "city"].includes(record.category)) ||
    record.notes.toLowerCase().includes("uncertain")
  );
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeText(filePath, value) {
  await fs.writeFile(filePath, value, "utf8");
}

function buildDedupedRecords(records) {
  return [...new Map(records.map((record) => [record.url, record])).values()].sort((a, b) =>
    a.category === b.category ? a.title.localeCompare(b.title) : a.category.localeCompare(b.category)
  );
}

function buildByCategory(records) {
  return records.reduce((map, record) => {
    if (!map.has(record.category)) {
      map.set(record.category, []);
    }
    map.get(record.category).push(record);
    return map;
  }, new Map());
}

function buildSummaryLines({ crawlMeta, deduped, byCategory, failures, badRecords }) {
  const withCoordinates = deduped.filter((record) => record.coordinates_raw);
  const withoutCoordinates = deduped.filter((record) => !record.coordinates_raw);
  return [
    "# Wynn Wiki Scrape Summary",
    "",
    `- Run date: ${crawlMeta.startedAt}`,
    `- Status: ${crawlMeta.status}`,
    `- Total pages scraped: ${deduped.length}`,
    `- Categories found: ${[...byCategory.keys()].join(", ") || "None"}`,
    `- Records with coordinates: ${withCoordinates.length}`,
    `- Records missing coordinates: ${withoutCoordinates.length}`,
    `- Likely bad or partial records: ${badRecords.length}`,
    "",
    "## Seed Coverage",
    "",
    ...crawlMeta.seedsUsed.map((seed) => `- ${seed.slug}: ${seed.links} discovered links`),
    "",
    "## Likely Bad / Partial Records",
    "",
    ...(badRecords.length
      ? badRecords.slice(0, 100).map((record) => `- ${record.title} (${record.category}) - ${record.url}`)
      : ["- None"]),
    "",
    "## Crawl Failures",
    "",
    ...(failures.length
      ? failures.slice(0, 100).map((failure) => `- ${failure.url} - ${failure.reason}`)
      : ["- None"])
  ];
}

async function persistSnapshot({ crawlMeta, records, failures }) {
  const deduped = buildDedupedRecords(records);
  const byCategory = buildByCategory(deduped);
  const badRecords = deduped.filter(isLikelyBadRecord);
  const withCoordinates = deduped.filter((record) => record.coordinates_raw);
  const withoutCoordinates = deduped.filter((record) => !record.coordinates_raw);

  for (const [category, items] of byCategory) {
    await writeJson(path.join(CATEGORY_OUTPUT_DIR, `${category}.json`), items);
  }

  const progress = {
    ...crawlMeta,
    lastUpdatedAt: new Date().toISOString(),
    totalRecords: deduped.length,
    categories: [...byCategory.keys()],
    withCoordinates: withCoordinates.length,
    withoutCoordinates: withoutCoordinates.length,
    failuresCount: failures.length,
    likelyBadRecordsCount: badRecords.length
  };

  await writeJson(MASTER_PATH, deduped);
  await writeJson(META_PATH, {
    ...progress,
    failures,
    badRecords: badRecords.map((record) => ({
      title: record.title,
      url: record.url,
      category: record.category,
      notes: record.notes
    }))
  });
  await writeJson(PROGRESS_PATH, progress);
  await writeText(SUMMARY_PATH, buildSummaryLines({ crawlMeta: progress, deduped, byCategory, failures, badRecords }).join("\n") + "\n");
}

async function collectSeedLinks(page, seed) {
  const sourceUrl = slugToUrl(seed.slug);
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.locator("body").first().waitFor({ state: "attached", timeout: 30000 });
  const data = await page.evaluate(
    ({ sourceUrl, mode, seedCategory }) => {
      const normalize = (value) => (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const absolute = (value) => new URL(value, sourceUrl).toString().split("#")[0];
      const headingText = (element) => normalize(element?.textContent || "");
      const seen = new Map();
      const currentTitle = normalize(document.querySelector("#firstHeading")?.textContent || document.title);
      const main = document.querySelector(".mw-parser-output");
      const categoryRoot = document.querySelector(".mw-category");
      const pageRoot = main || categoryRoot || document.body;
      const validAnchor = (anchor) => {
        const href = anchor.getAttribute("href") || "";
        if (!href.startsWith("/wiki/")) return false;
        if (href.includes("?") || href.includes("#")) return false;
        if (anchor.classList.contains("new")) return false;
        const decoded = decodeURIComponent(href.replace("/wiki/", ""));
        const blockedPrefixes = ["File:", "Template:", "User:", "Talk:", "Forum:", "Help:", "Category:", "Special:"];
        return !blockedPrefixes.some((prefix) => decoded.startsWith(prefix));
      };
      const capture = (anchor, section = "") => {
        if (!validAnchor(anchor)) return;
        const url = absolute(anchor.getAttribute("href"));
        const text = normalize(anchor.textContent || "");
        if (!text || text.length < 2) return;
        if (!seen.has(url)) {
          seen.set(url, {
            url,
            text,
            sourceSection: normalize(section),
            discoveredFrom: currentTitle,
            seedCategory
          });
        }
      };
      const captureRowLinks = () => {
        for (const row of pageRoot.querySelectorAll("table.wikitable tr")) {
          const section = headingText(row.closest("table")?.previousElementSibling);
          const anchors = [...row.querySelectorAll("a")];
          for (const anchor of anchors) {
            capture(anchor, section);
          }
        }
      };
      if (mode === "category") {
        for (const anchor of pageRoot.querySelectorAll(".mw-category a")) {
          capture(anchor, "Category");
        }
      } else if (mode === "quests") {
        captureRowLinks();
        for (const listItem of pageRoot.querySelectorAll("li")) {
          const section = headingText(listItem.closest("ul, ol")?.previousElementSibling);
          for (const anchor of listItem.querySelectorAll("a")) {
            capture(anchor, section);
          }
        }
      } else if (mode === "discoveries") {
        captureRowLinks();
        for (const listItem of pageRoot.querySelectorAll("li")) {
          const section = headingText(listItem.closest("ul, ol")?.previousElementSibling);
          for (const anchor of listItem.querySelectorAll("a")) {
            capture(anchor, section);
          }
        }
      } else if (mode === "lootrunning") {
        for (const sectionRoot of pageRoot.querySelectorAll("table.wikitable, ul, ol, dl")) {
          const section = headingText(sectionRoot.previousElementSibling);
          for (const anchor of sectionRoot.querySelectorAll("a")) {
            const text = normalize(anchor.textContent || "");
            if (text.toLowerCase().includes("camp") || section.toLowerCase().includes("camp")) {
              capture(anchor, section || "Camp");
            }
          }
        }
      } else {
        captureRowLinks();
        for (const listItem of pageRoot.querySelectorAll("li")) {
          const section = headingText(listItem.closest("ul, ol")?.previousElementSibling);
          for (const anchor of listItem.querySelectorAll("a")) {
            capture(anchor, section);
          }
        }
      }
      const links = [...seen.values()].filter((entry) => entry.url !== sourceUrl);
      return {
        title: currentTitle,
        pageUrl: location.href,
        links
      };
    },
    { sourceUrl, mode: seed.mode, seedCategory: seed.seedCategory }
  );
  await delay(REQUEST_DELAY_MS);
  return data;
}

async function collectPageData(page, targetUrl) {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.locator("body").first().waitFor({ state: "attached", timeout: 30000 });
  const pageData = await page.evaluate(({ stopHeadingNames }) => {
    const normalize = (value) => (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const absolute = (value) => new URL(value, location.href).toString().split("#")[0];
    const main = document.querySelector(".mw-parser-output");
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || location.href;
    const pageCategories = [...document.querySelectorAll("#catlinks a")]
      .map((anchor) => normalize(anchor.textContent))
      .filter((value) => value && value !== "Categories");
    const cleanupFlag = !!document.querySelector('.ambox, .mbox, [class*="cleanup"]');
    const infoboxRows = [];
    for (const row of document.querySelectorAll("table.infobox tr, aside.portable-infobox .pi-item")) {
      const label = normalize(
        row.querySelector("th, .pi-data-label, .pi-item-label, .pi-header")?.textContent || row.querySelector("b")?.textContent || ""
      );
      const value = normalize(
        row.querySelector("td, .pi-data-value, .pi-item-value")?.textContent || row.textContent || ""
      );
      if (label && value && label !== value) {
        infoboxRows.push({ label, value });
      }
    }
    const content = main ? main.cloneNode(true) : document.body.cloneNode(true);
    for (const selector of [
      ".mw-editsection",
      ".toc",
      ".navbox",
      ".navigation-not-searchable",
      ".gallery",
      ".thumb .magnify",
      ".reference",
      ".reflist",
      ".mw-collapsible",
      ".hatnote",
      ".ambox",
      ".mbox",
      "style",
      "script",
      "noscript",
      "table.infobox",
      "aside.portable-infobox"
    ]) {
      for (const node of content.querySelectorAll(selector)) {
        node.remove();
      }
    }
    const blocks = [];
    const sections = [];
    let stop = false;
    let currentHeading = "";
    for (const child of [...content.children]) {
      const tag = child.tagName.toLowerCase();
      const text = normalize(child.textContent || "");
      if (!text) continue;
      if (/^h[2-4]$/.test(tag)) {
        currentHeading = text;
        if (stopHeadingNames.has(text.toLowerCase())) {
          stop = true;
        }
        continue;
      }
      if (stop) continue;
      if (["p", "ul", "ol", "dl"].includes(tag)) {
        blocks.push(text);
        if (currentHeading) {
          sections.push({ heading: currentHeading, text });
        }
      }
    }
    const summary = blocks.find((block) => block.length > 30) || blocks[0] || "";
    const description = blocks.slice(0, 8).join("\n\n");
    const images = [...document.querySelectorAll(".mw-parser-output img, table.infobox img, aside.portable-infobox img")]
      .map((img) => img.getAttribute("src"))
      .filter(Boolean)
      .map((src) => absolute(src));
    const videos = [
      ...document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="twitch"], a[href*="youtube"], a[href*="youtu.be"], a[href*="twitch"], a[href*="vimeo"]')
    ]
      .map((node) => node.getAttribute("src") || node.getAttribute("href"))
      .filter(Boolean)
      .map((value) => absolute(value));
    const rawText = normalize(main?.textContent || document.body.textContent || "");
    return {
      title: normalize(document.querySelector("#firstHeading")?.textContent || document.title),
      canonical: absolute(canonical),
      summary,
      description,
      infoboxRows,
      sections,
      pageCategories,
      cleanupFlag,
      images,
      videos,
      rawText
    };
  }, { stopHeadingNames: [...stopHeadingNames] });
  await delay(REQUEST_DELAY_MS);
  return pageData;
}

function createRecord(seed, candidate, pageData) {
  const category = normalizeCategory(seed.seedCategory, candidate.sourceSection, pageData);
  const coordinateSource =
    pageData.infoboxRows.find((row) => row.label.toLowerCase().includes("coordinate"))?.value ||
    pageData.infoboxRows.find((row) => row.label.toLowerCase().includes("location"))?.value ||
    pageData.sections.find((section) => /coordinate|location/i.test(section.heading))?.text ||
    (/-?\d+/.test(pageData.rawText) ? pageData.rawText.match(/(?:coordinates?|location)[^.\n]{0,80}/i)?.[0] : "") ||
    "";
  const region =
    pageData.infoboxRows.find((row) => ["region", "province", "area", "location"].includes(row.label.toLowerCase()))?.value || "";
  const record = {
    id: "",
    title: pageData.title,
    url: normalizeWikiUrl(pageData.canonical),
    category,
    region: normalizeWhitespace(region),
    summary: normalizeWhitespace(pageData.summary),
    description: cleanMultiline(pageData.description),
    coordinates_raw: normalizeWhitespace(coordinateSource),
    coordinates: parseCoordinateText(coordinateSource),
    requirements: collectRequirements(pageData),
    enemies: collectField(pageData, ["enemy", "mob"], ["enemy", "mob"]),
    bosses: collectField(pageData, ["boss"], ["boss"]),
    drops: collectField(pageData, ["drop", "loot"], ["drop", "loot"]),
    rewards: collectField(pageData, ["reward"], ["reward"]),
    images: dedupeStrings(pageData.images),
    videos: dedupeStrings(pageData.videos),
    tags: dedupeStrings([
      seed.seedCategory,
      candidate.sourceSection,
      ...pageData.pageCategories.filter((value) =>
        /(quest|discovery|city|region|location|dungeon|raid|altar|cave|lootrun|event)/i.test(value)
      )
    ]),
    notes: buildNotes(seed, pageData, category)
  };
  record.id = buildId(record);
  if (!record.coordinates_raw) {
    record.coordinates = { x: null, y: null, z: null };
  }
  return record;
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await ensureDir(CATEGORY_OUTPUT_DIR);

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 }
  });
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font"].includes(type)) {
      route.abort().catch(() => {});
      return;
    }
    route.continue().catch(() => {});
  });
  const page = await context.newPage();

  const crawlMeta = {
    startedAt: new Date().toISOString(),
    status: "running",
    currentPhase: "boot",
    currentSeed: "",
    currentUrl: "",
    seedsAttempted: [],
    seedsUsed: [],
    missingSeeds: [],
    discoveredLinks: 0,
    detailPagesAttempted: 0,
    detailPagesSucceeded: 0
  };

  const candidatesByUrl = new Map();
  for (const seed of seedPages) {
    crawlMeta.currentPhase = "seed-discovery";
    crawlMeta.currentSeed = seed.slug;
    crawlMeta.currentUrl = slugToUrl(seed.slug);
    crawlMeta.seedsAttempted.push(seed.slug);
    try {
      const result = await collectSeedLinks(page, seed);
      if (!result.links.length && seed.required) {
        crawlMeta.missingSeeds.push({ slug: seed.slug, reason: "No links extracted." });
        continue;
      }
      crawlMeta.seedsUsed.push({ slug: seed.slug, title: result.title, pageUrl: result.pageUrl, links: result.links.length });
      console.log(`[seed] ${seed.slug}: ${result.links.length} links`);
      for (const link of result.links) {
        const normalizedUrl = normalizeWikiUrl(link.url);
        if (shouldIgnoreWikiUrl(normalizedUrl)) {
          continue;
        }
        if (!candidatesByUrl.has(normalizedUrl)) {
          candidatesByUrl.set(normalizedUrl, { ...link, url: normalizedUrl, sourceSeed: seed });
        } else {
          const existing = candidatesByUrl.get(normalizedUrl);
          if (!existing.sourceSection && link.sourceSection) {
            existing.sourceSection = link.sourceSection;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (seed.required) {
        crawlMeta.missingSeeds.push({ slug: seed.slug, reason: message });
      }
      console.log(`[seed-fail] ${seed.slug}: ${message}`);
    }
    crawlMeta.discoveredLinks = candidatesByUrl.size;
    await persistSnapshot({ crawlMeta, records: [], failures: [] });
  }

  crawlMeta.discoveredLinks = candidatesByUrl.size;

  const records = [];
  const failures = [];
  for (const candidate of candidatesByUrl.values()) {
    crawlMeta.currentPhase = "detail-pages";
    crawlMeta.currentSeed = candidate.sourceSeed.slug;
    crawlMeta.currentUrl = candidate.url;
    crawlMeta.detailPagesAttempted += 1;
    try {
      const pageData = await collectPageData(page, candidate.url);
      const record = createRecord(candidate.sourceSeed, candidate, pageData);
      if (record.title && record.url) {
        records.push(record);
        crawlMeta.detailPagesSucceeded += 1;
        console.log(
          `[page] ${crawlMeta.detailPagesSucceeded}/${crawlMeta.detailPagesAttempted} ${record.category} ${record.title}`
        );
      }
    } catch (error) {
      failures.push({
        url: candidate.url,
        reason: error instanceof Error ? error.message : String(error),
        sourceSeed: candidate.sourceSeed.slug
      });
      console.log(`[page-fail] ${candidate.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await persistSnapshot({ crawlMeta, records, failures });
  }

  await browser.close();
  crawlMeta.status = "completed";
  crawlMeta.currentPhase = "finished";
  crawlMeta.currentSeed = "";
  crawlMeta.currentUrl = "";
  crawlMeta.completedAt = new Date().toISOString();
  await persistSnapshot({ crawlMeta, records, failures });

  const deduped = buildDedupedRecords(records);
  const byCategory = buildByCategory(deduped);
  const withCoordinates = deduped.filter((record) => record.coordinates_raw);
  const withoutCoordinates = deduped.filter((record) => !record.coordinates_raw);
  const badRecords = deduped.filter(isLikelyBadRecord);

  const result = {
    outputDir: OUTPUT_DIR,
    totalPagesScraped: deduped.length,
    categoriesFound: [...byCategory.keys()],
    withCoordinates: withCoordinates.length,
    withoutCoordinates: withoutCoordinates.length,
    likelyBadRecords: badRecords.length,
    failures: failures.length
  };

  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
