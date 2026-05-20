import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "data", "wiki-scrape", "caves", "cave-pages.json");
const OUTPUT_PATH = path.join(ROOT, "data", "generated-cave-marker-content.js");

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function dedupe(values) {
  return [...new Set((values || []).map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function compactSentence(value, maxLength = 260) {
  const text = normalizeWhitespace(value).replace(/\[\d+\]/g, "").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((part) => normalizeWhitespace(part)).filter(Boolean) || [text];
  let output = "";
  for (const sentence of sentences) {
    const next = output ? `${output} ${sentence}` : sentence;
    if (next.length > maxLength) {
      break;
    }
    output = next;
  }

  return output || `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function cleanBlock(value) {
  const text = normalizeWhitespace(value)
    .replace(/\[\d+\]/g, "")
    .replace(/\s+Wynncraft Map\b/gi, "")
    .trim();

  if (!text) {
    return "";
  }

  if (/^Image Name Level Health\b/i.test(text) || /^File:/i.test(text) || /^Dialogue:?$/i.test(text)) {
    return "";
  }

  return compactSentence(text, 320);
}

function rowAfter(rows, label) {
  const index = rows.findIndex((row) => normalizeWhitespace(row).toLowerCase() === label.toLowerCase());
  return index >= 0 ? normalizeWhitespace(rows[index + 1]) : "";
}

function rowWithPrefix(rows, prefix) {
  const value = rows.find((row) => normalizeWhitespace(row).startsWith(prefix));
  return value ? normalizeWhitespace(value.slice(prefix.length)) : "";
}

function splitRewards(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return [];
  }

  const parts = text
    .split(/(?=\+\s*[^+])|(?<=\))\s+(?=[A-Z0-9+])/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  return dedupe(parts.length ? parts : [text]);
}

function parseMobs(value) {
  return dedupe(
    [...String(value ?? "").matchAll(/([A-Z0-9][A-Za-z0-9'’.,\- ]+?\(Lv\.\s*\d+\))/g)].map((match) => match[1]),
  );
}

function parseChestTiers(value) {
  return dedupe(
    [...String(value ?? "").matchAll(/(\d+x Tier \d(?:\s*\[[^\]]+\])?)/g)].map((match) => match[1]),
  );
}

function chooseCoverImage(images) {
  return (
    images.find((url) =>
      url &&
      !/CBCaveIcon|NaturalIcon|PinpointConcept|\/100px-|LootChest|Map\.png/i.test(url),
    ) ||
    images.find((url) => url && !/CBCaveIcon|NaturalIcon|PinpointConcept/i.test(url)) ||
    images[0] ||
    ""
  );
}

function cleanGallery(images) {
  return dedupe(
    (images || []).filter(
      (url) => url && !/PinpointConcept|Map\.png/i.test(url),
    ),
  );
}

function cleanTutorials(videos) {
  return dedupe(videos).filter((url) => !/youtube\.com\/@WynncraftOfficial\/?$/i.test(url));
}

function collectRouteNotes(sections) {
  const notes = [];
  for (const section of sections || []) {
    const heading = normalizeWhitespace(section.heading);
    if (/^trivia$/i.test(heading)) {
      continue;
    }

    const cleaned = (section.blocks || []).map(cleanBlock).filter(Boolean);
    if (!cleaned.length) {
      continue;
    }

    if (heading && !/^sections?$|^interior$/i.test(heading)) {
      notes.push(`${heading}: ${cleaned[0]}`);
      continue;
    }

    notes.push(cleaned[0]);
  }

  return dedupe(notes).slice(0, 4);
}

function buildExplanation(page) {
  const rows = page.infoboxRows || [];
  const description = rowAfter(rows, "Description");
  const suggestedLevel = rowWithPrefix(rows, "Suggested Level ");
  const difficulty = rowWithPrefix(rows, "Difficulty ");
  const length = rowWithPrefix(rows, "Length ");
  const estimatedTime = rowWithPrefix(rows, "Estimated Time ");
  const caveType = rowWithPrefix(rows, "Type of Cave ");
  const chestItems = parseChestTiers(rowWithPrefix(rows, "Loot Chests "));
  const mobs = parseMobs(rowWithPrefix(rows, "Mobs "));
  const rewards = splitRewards(rowAfter(rows, "First-Time Clear Rewards"));
  const routeNotes = collectRouteNotes(page.sections || []);

  const sections = [];
  const stats = [];

  if (suggestedLevel) {
    stats.push(`Suggested level: ${suggestedLevel}`);
  }
  if (difficulty) {
    stats.push(`Difficulty: ${difficulty}`);
  }
  if (length) {
    stats.push(`Length: ${length}`);
  }
  if (estimatedTime) {
    stats.push(`Estimated time: ${estimatedTime}`);
  }
  if (caveType) {
    stats.push(`Type: ${caveType}`);
  }

  if (stats.length) {
    sections.push(["Overview", ...stats.map((item) => `• ${item}`)].join("\n"));
  }

  if (routeNotes.length) {
    sections.push(["Route", ...routeNotes.map((item) => `• ${item}`)].join("\n"));
  } else if (description) {
    sections.push(["Route", `• ${compactSentence(description, 260)}`].join("\n"));
  }

  if (chestItems.length) {
    sections.push(["Loot Chests", ...chestItems.map((item) => `• ${item}`)].join("\n"));
  }

  if (mobs.length) {
    sections.push(["Enemies", ...mobs.map((item) => `• ${item}`)].join("\n"));
  }

  if (rewards.length) {
    sections.push(["First-Time Clear Rewards", ...rewards.map((item) => `• ${item}`)].join("\n"));
  }

  return sections.join("\n\n");
}

async function main() {
  const rawPages = JSON.parse(await fs.readFile(INPUT_PATH, "utf8"));
  const content = Object.fromEntries(
    rawPages.map((page) => [
      page.markerId,
      {
        summary: normalizeWhitespace(page.summary),
        explanation: buildExplanation(page),
        coverImage: chooseCoverImage(page.images || []),
        gallery: cleanGallery(page.images || []),
        sourceUrl: page.url || "",
        tutorials: cleanTutorials(page.videos || []),
      },
    ]),
  );

  const file = [
    "// Generated by scripts/build-cave-marker-content.mjs",
    `// Source: ${path.relative(ROOT, INPUT_PATH).replace(/\\/g, "/")}`,
    "",
    `export const GENERATED_CAVE_MARKER_CONTENT = ${JSON.stringify(content, null, 2)};`,
    "",
  ].join("\n");

  await fs.writeFile(OUTPUT_PATH, file, "utf8");

  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/"),
    records: Object.keys(content).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
