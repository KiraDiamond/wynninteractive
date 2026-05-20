import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_MARKERS = path.join(ROOT, "data", "generated-fast-travel-markers.js");
const OUTPUT_CONTENT = path.join(ROOT, "data", "generated-fast-travel-content.js");
const OUTPUT_SUMMARY = path.join(ROOT, "data", "wiki-scrape", "fast-travel", "summary.md");
const SOURCE_URL = "https://wynncraft.wiki.gg/wiki/Fast_Travel";
const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const DEFAULT_BOUNDS = {
  minX: -2540,
  maxX: 2046,
  minZ: -6645,
  maxZ: 16650,
};

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveChromePath() {
  for (const candidate of CHROME_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Could not find a local Chrome or Edge executable for fast travel scraping.");
}

function inferArea({ x, z }) {
  if (x >= 12000 && z <= -3000) {
    return "outer_void";
  }
  if (x >= DEFAULT_BOUNDS.minX && x <= DEFAULT_BOUNDS.maxX && z >= DEFAULT_BOUNDS.minZ && z <= DEFAULT_BOUNDS.maxZ) {
    return "wynn";
  }
  return null;
}

function inferRegion(area, sectionTitle) {
  if (area === "outer_void") {
    return "Outer Void";
  }
  return sectionTitle;
}

function buildMarkerId(sectionTitle, entry) {
  return `fast-travel-${slugify(sectionTitle)}-${slugify(entry.name)}-${entry.x}-${entry.z}`;
}

function sectionExplanation(sectionTitle, summary, entry, connectedStops) {
  const lines = [`Route`, `• Network: ${sectionTitle}.`, `• Stop: ${entry.name}.`];

  if (connectedStops.length) {
    lines.push(`• Connected stops: ${connectedStops.join(", ")}.`);
  }

  if (summary) {
    lines.push("", `Notes`, `• ${summary}`);
  }

  return lines.join("\n");
}

async function scrapeFastTravelSections() {
  const executablePath = await resolveChromePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(1800 + attempt * 500);

        return await page.evaluate(() => {
          const root = document.querySelector(".mw-parser-output");
          if (!root) {
            throw new Error("Fast Travel page body did not render.");
          }

          const sections = [];
          const sectionHeads = [...root.querySelectorAll(":scope > h2")];

          for (const head of sectionHeads) {
            const title = head.textContent.replace("[edit]", "").trim();
            if (["Contents", "Gallery", "Trivia"].includes(title)) {
              continue;
            }

            const section = {
              title,
              summary: "",
              entries: [],
            };
            const seen = new Set();

            let node = head.nextElementSibling;
            while (node && node.tagName !== "H2") {
              const text = (node.innerText || "").replace(/\s+/g, " ").trim();
              if (!section.summary && node.tagName === "P" && text) {
                section.summary = text;
              }

              if (text) {
                const locationMatch = text.match(/Location\s+(.+?)\s+(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/i);
                if (locationMatch) {
                  const entry = {
                    name: locationMatch[1].trim(),
                    x: Number(locationMatch[2]),
                    y: Number(locationMatch[3]),
                    z: Number(locationMatch[4]),
                  };
                  const key = `${entry.name}|${entry.x}|${entry.y}|${entry.z}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    section.entries.push(entry);
                  }
                }
              }

              node = node.nextElementSibling;
            }

            sections.push(section);
          }

          return sections;
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Fast Travel page scrape failed.");
  } finally {
    await browser.close();
  }
}

async function main() {
  const sections = await scrapeFastTravelSections();
  const markers = [];
  const content = {};
  const skipped = [];

  for (const section of sections) {
    for (const entry of section.entries) {
      const area = inferArea(entry);
      if (!area) {
        skipped.push({
          section: section.title,
          name: entry.name,
          x: entry.x,
          y: entry.y,
          z: entry.z,
          reason: "unsupported-area",
        });
        continue;
      }

      const id = buildMarkerId(section.title, entry);
      const connectedStops = section.entries
        .filter((item) => item.name !== entry.name || item.x !== entry.x || item.z !== entry.z)
        .map((item) => item.name);
      const description = normalizeWhitespace(`${section.title}. ${section.summary || ""}`.replace(/\s+/g, " "));

      markers.push({
        id,
        title: entry.name,
        category: "fast_travel",
        region: inferRegion(area, section.title),
        description,
        tags: [
          "fast-travel",
          slugify(section.title),
          area === "outer_void" ? "outer-void" : "wynn",
          "wiki-fast-travel",
        ],
        area,
        position: {
          world: {
            x: entry.x,
            z: entry.z,
          },
        },
      });

      content[id] = {
        summary: section.summary || `${entry.name} is part of ${section.title}.`,
        explanation: sectionExplanation(section.title, section.summary, entry, connectedStops),
        coverImage: "",
        gallery: [],
        sourceUrl: SOURCE_URL,
        tutorials: [],
      };
    }
  }

  markers.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));

  await fs.mkdir(path.dirname(OUTPUT_SUMMARY), { recursive: true });
  await fs.writeFile(
    OUTPUT_MARKERS,
    `export const GENERATED_FAST_TRAVEL_MARKERS = ${JSON.stringify(markers, null, 2)};\n`
  );
  await fs.writeFile(
    OUTPUT_CONTENT,
    `export const GENERATED_FAST_TRAVEL_CONTENT = ${JSON.stringify(content, null, 2)};\n`
  );

  const lines = [
    "# Fast Travel Summary",
    "",
    `Source: ${SOURCE_URL}`,
    "",
    `Sections scanned: ${sections.length}`,
    `Markers generated: ${markers.length}`,
    `Skipped unsupported coordinates: ${skipped.length}`,
    "",
  ];

  if (skipped.length) {
    lines.push("## Skipped");
    lines.push("");
    for (const item of skipped) {
      lines.push(`- ${item.section}: ${item.name} (${item.x}, ${item.y}, ${item.z})`);
    }
    lines.push("");
  }

  await fs.writeFile(OUTPUT_SUMMARY, `${lines.join("\n")}\n`);
}

await main();
