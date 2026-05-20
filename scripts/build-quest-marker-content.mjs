import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "data", "wiki-scrape", "quest-guides", "quest-guides.json");
const OUTPUT_PATH = path.join(ROOT, "data", "generated-quest-marker-content.js");

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGuideLine(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanMapSuffix(value) {
  return normalizeGuideLine(value)
    .replace(/\s+Wynncraft Map\b/gi, "")
    .trim();
}

function isSpeakerLine(value) {
  const match = value.match(/^([A-Z?][A-Za-z0-9'"().? -]{0,60}):\s/);
  if (!match) {
    return false;
  }

  return !["Tip", "Location", "Coordinates", "Answer"].includes(match[1]);
}

function cleanGuideLine(line) {
  const value = normalizeGuideLine(line);
  if (!value) {
    return "";
  }

  if (/^Stage\s+\d+\b/i.test(value)) {
    return value;
  }

  if (/^Dialogue:?$/i.test(value) || /^Image Name\b/i.test(value) || /^File:/i.test(value)) {
    return "";
  }

  if (/^(Quest Info|Length|Difficulty|Province|Combat Level|Starter NPC|Reward)\b/i.test(value)) {
    return "";
  }

  if (/^The dialogue branches combine here\.?$/i.test(value)) {
    return "";
  }

  if (/^Location\b/i.test(value)) {
    const cleaned = cleanMapSuffix(value.replace(/^Location\s+/i, ""));
    return cleaned ? `Location: ${cleaned}` : "";
  }

  if (/^X\s*-?\d+\s*Y\s*-?\d+\s*Z\s*-?\d+/i.test(value)) {
    return `Coordinates: ${cleanMapSuffix(value)}`;
  }

  if (/^ExpandSpoiler!/i.test(value)) {
    return value
      .replace(/^ExpandSpoiler!\s*/i, "")
      .replace(/^The hidden text contains spoilers relating to [^.]+\.\s*/i, "")
      .trim();
  }

  if (
    /^(You hear\b|The camera will show\b|The crackling and huming gets louder\b|You can hear a soft humming\b|Previously\.\.\.|Upon approaching\b|After exiting the front gate\b|Majin heads up\b|Majin walks to\b|Sui leaves the room\b)/i.test(
      value
    )
  ) {
    return "";
  }

  if (isSpeakerLine(value)) {
    return "";
  }

  return cleanMapSuffix(value);
}

function compactSupportLine(value) {
  const cutPoints = [
    " Interacting with",
    " Talking to",
    " The following dialogue",
    " The dialogue",
    " Upon approaching",
    " Additionally,",
  ];

  for (const marker of cutPoints) {
    const index = value.indexOf(marker);
    if (index > 0) {
      return value.slice(0, index).trim();
    }
  }

  return value;
}

function isSupportStep(value) {
  return /^(Location:|Coordinates:|Tip:|The code\b|The answer\b|The entrance\b|The next wind chime\b|The Clothes Merchant is found at\b|The hotel entrance is found at\b|You will need\b|You can\b|Use\b|Get\b|Go\b|Enter\b|Follow\b|Climb\b|Continue\b|Fight\b|Head\b|Travel\b|Press\b|Collect\b|Grab\b|Jump\b|Return\b|Bring\b|Investigate\b|Open\b|To get\b|Right next to\b|Moving block puzzle:|The Second Puzzle:|Pink Wool can be purchased\b)/i.test(
    value
  );
}

function extractQuestSteps(value) {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const stages = [];
  let currentStage = null;

  for (const line of lines) {
    const cleaned = cleanGuideLine(line);
    if (!cleaned) {
      continue;
    }

    if (/^Stage\s+\d+\b/i.test(cleaned)) {
      if (currentStage?.items.length) {
        stages.push(currentStage);
      }
      currentStage = { title: cleaned, items: [] };
      continue;
    }

    if (!currentStage) {
      continue;
    }

    const primaryStep = /^»\s*/.test(cleaned);
    const item = compactSupportLine(cleaned.replace(/^»\s*/, "").trim());
    if (!item) {
      continue;
    }

    if (!primaryStep && !isSupportStep(item)) {
      continue;
    }

    if (currentStage.items[currentStage.items.length - 1] !== item) {
      currentStage.items.push(item);
    }
  }

  if (currentStage?.items.length) {
    stages.push(currentStage);
  }

  if (!stages.length) {
    return "";
  }

  return stages.map((stage) => [stage.title, ...stage.items.map((item) => `• ${item}`)].join("\n")).join("\n\n");
}

function dedupe(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function isExplicitlyOutdated(summary) {
  const text = normalizeWhitespace(summary);
  return /for the updated version/i.test(text) || /\bwas a .*quest.*(?:revamped|reworked|updated)/i.test(text);
}

function isBrokenGuide(summary) {
  return /^}\}$/.test(normalizeWhitespace(summary));
}

function normalizeTutorials(urls) {
  return dedupe(urls).filter((url) => !/youtube\.com\/@WynncraftOfficial\/?$/i.test(url));
}

function chooseCoverImage(images) {
  const nonIcon = images.find((url) => !/CBQuestIcon|QuestIcon/i.test(url));
  return nonIcon || images[0] || "";
}

async function main() {
  const questIds = new Set(
    WIKI_MAP_MARKERS.filter((marker) => marker.category === "quests").map((marker) => marker.id)
  );
  const rawGuides = JSON.parse(await fs.readFile(INPUT_PATH, "utf8"));

  const included = [];
  const excluded = [];

  for (const guide of rawGuides) {
    if (!questIds.has(guide.markerId)) {
      excluded.push({ markerId: guide.markerId, title: guide.title, reason: "not-current-map-quest" });
      continue;
    }

    if (isExplicitlyOutdated(guide.summary)) {
      excluded.push({ markerId: guide.markerId, title: guide.title, reason: "historical-wiki-page" });
      continue;
    }

    if (isBrokenGuide(guide.summary)) {
      excluded.push({ markerId: guide.markerId, title: guide.title, reason: "broken-summary" });
      continue;
    }

    const gallery = dedupe(guide.images || []);
    included.push([
      guide.markerId,
      {
        summary: "",
        explanation: extractQuestSteps(guide.solution),
        coverImage: chooseCoverImage(gallery),
        gallery,
        sourceUrl: guide.url || "",
        tutorials: normalizeTutorials(guide.videos || []),
      },
    ]);
  }

  const content = Object.fromEntries(included);
  const file = [
    "// Generated by scripts/build-quest-marker-content.mjs",
    `// Source: ${path.relative(ROOT, INPUT_PATH).replace(/\\/g, "/")}`,
    "",
    `export const GENERATED_QUEST_MARKER_CONTENT = ${JSON.stringify(content, null, 2)};`,
    "",
  ].join("\n");

  await fs.writeFile(OUTPUT_PATH, file, "utf8");

  console.log(
    JSON.stringify(
      {
        output: path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/"),
        included: included.length,
        excluded: excluded.length,
        excludedSample: excluded.slice(0, 20),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
