import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GUIDE_PATH = "E:/downloads/Zy's updated profession guide.txt";
const GUIDE_URL = "https://docs.google.com/document/d/1Wv5I296Cd5j7yWT2vgGFp1AFM_1R2Xw-M73TIoR56-M/edit?tab=t.0";
const MARKERS_OUTPUT = path.join(ROOT, "data", "generated-profession-markers.js");
const CONTENT_OUTPUT = path.join(ROOT, "data", "generated-profession-marker-content.js");

const SECTION_CONFIG = {
  Fishing: {
    category: "profession_fishing",
    label: "Fishing",
    dims: 2,
    iconTag: "fish",
  },
  Farming: {
    category: "profession_farming",
    label: "Farming",
    dims: 3,
    iconTag: "crop",
  },
  Mining: {
    category: "profession_mining",
    label: "Mining",
    dims: 3,
    iconTag: "pickaxe",
  },
  Woodcutting: {
    category: "profession_woodcutting",
    label: "Woodcutting",
    dims: 3,
    iconTag: "axe",
  },
};

const SECTION_NAMES = Object.keys(SECTION_CONFIG);
const IGNORE_LINE =
  /^(Mob Legend|None -|Very Low -|Low -|Medium -|High -|Very High -|Material|Obtaining\/Nodes|Suggested Tool|Level|_+|\*Woodcutting)/i;
const TOOL_LINE = /^T\d+\s+/;
const LEVEL_RANGE_LINE = /^\d+\-\d+$/;
const SUPPLEMENTAL_SPOTS = [
  {
    section: "Mining",
    material: "Cinnabar",
    title: "Cinnabar - Terr spot",
    region: "Terr spot",
    description:
      "I use this mining spot for Cinnabar. Route note: Terr spot. Nodes: [13■]. Tick rate: 4 tick. Coordinates: -1665, 38, -450.",
    summary: "I use this mining spot for Cinnabar.",
    explanation: [
      "My Notes",
      "• I farm Cinnabar here.",
      "• I usually get [13■] nodes here.",
      "• Tick rate: 4 tick.",
      "• Coordinates: -1665, 38, -450.",
      "• Route note: Terr spot.",
    ].join("\n"),
    iconTag: "pickaxe",
    coord: { x: -1665, y: 38, z: -450 },
    sourceUrl: "",
  },
  {
    section: "Woodcutting",
    material: "Mistwood",
    title: "Mistwood - low mob count area",
    region: "Terr low mob count area",
    description:
      "I use this woodcutting spot for Mistwood. Route note: Terr low mob count area. Mob pressure: Relatively low. Coordinates: -1140, 59, -840.",
    summary: "I use this woodcutting spot for Mistwood.",
    explanation: [
      "My Notes",
      "• I farm Mistwood here.",
      "• Mob pressure: Relatively low.",
      "• Coordinates: -1140, 59, -840.",
      "• Route note: Terr low mob count area.",
    ].join("\n"),
    iconTag: "axe",
    coord: { x: -1140, y: 59, z: -840 },
    sourceUrl: "",
  },
  {
    section: "Fishing",
    material: "Sturgeon",
    title: "Sturgeon - zero mob lake",
    region: "Zero mob lake",
    description: "I use this fishing spot for Sturgeon. Nodes: [8■]. Mob pressure: None. Coordinates: -2215, 5, -1005.",
    summary: "I use this fishing spot for Sturgeon.",
    explanation: [
      "My Notes",
      "• I farm Sturgeon here.",
      "• I usually get [8■] nodes here.",
      "• Mob pressure: None.",
      "• Coordinates: -2215, 5, -1005.",
      "• Route note: zero mob lake.",
    ].join("\n"),
    iconTag: "fish",
    coord: { x: -2215, y: 5, z: -1005 },
    sourceUrl: "",
  },
  {
    section: "Mining",
    material: "Cinnabar",
    title: "Cinnabar - zero mob cluster",
    region: "Zero mob cluster",
    description: "I use this mining spot for Cinnabar. Nodes: [13■]. Mob pressure: None. Coordinates: -2198, 38, -543.",
    summary: "I use this mining spot for Cinnabar.",
    explanation: [
      "My Notes",
      "• I farm Cinnabar here.",
      "• I usually get [13■] nodes here.",
      "• Mob pressure: None.",
      "• Coordinates: -2198, 38, -543.",
      "• Route note: zero mob cluster.",
    ].join("\n"),
    iconTag: "pickaxe",
    coord: { x: -2198, y: 38, z: -543 },
    sourceUrl: "",
  },
  {
    section: "Farming",
    material: "Heather",
    title: "Heather - level 115 field",
    region: "Level 115 field",
    description: "I use this farming spot for Heather. Level bracket: 115. Nodes: [8■]. Coordinates: -1230, -1450.",
    summary: "I use this farming spot for Heather.",
    explanation: [
      "My Notes",
      "• I farm Heather here.",
      "• Level bracket: 115.",
      "• I usually get [8■] nodes here.",
      "• Coordinates: -1230, -1450.",
      "• Route note: level 115 Heather field.",
    ].join("\n"),
    iconTag: "crop",
    coord: { x: -1230, z: -1450 },
    sourceUrl: "",
  },
];

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNotes(value) {
  return normalizeWhitespace(value)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/’/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isMaterialLine(line) {
  return (
    /^[A-Za-z][A-Za-z'’ -]+$/.test(line) &&
    !IGNORE_LINE.test(line) &&
    !TOOL_LINE.test(line) &&
    !LEVEL_RANGE_LINE.test(line) &&
    !SECTION_NAMES.includes(line)
  );
}

function sectionSlice(lines, sectionName) {
  const start = lines.findIndex((line) => line.trim() === sectionName);
  if (start < 0) {
    throw new Error(`Could not find section "${sectionName}" in ${GUIDE_PATH}`);
  }
  const nextStarts = SECTION_NAMES.map((name) =>
    lines.findIndex((line, idx) => idx > start && line.trim() === name)
  ).filter((index) => index > start);
  const end = nextStarts.length ? Math.min(...nextStarts) : lines.length;
  return lines.slice(start, end).map((line) => line.trim());
}

function mergeSpotLines(rawLines) {
  const merged = [];
  for (const line of rawLines) {
    if (!line) {
      continue;
    }
    if (/^\[Mobs:/i.test(line) && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
      continue;
    }
    if (line.includes("■")) {
      merged.push(line);
    }
  }
  return merged;
}

function parseSection(lines, sectionName) {
  const slice = sectionSlice(lines, sectionName);
  const materials = [];

  for (let i = 0; i < slice.length; i += 1) {
    const line = slice[i];
    if (!isMaterialLine(line)) {
      continue;
    }

    const material = line;
    const rawSpots = [];
    const tools = [];
    let levelRange = "";
    i += 1;

    while (i < slice.length && !TOOL_LINE.test(slice[i]) && !isMaterialLine(slice[i])) {
      const value = slice[i];
      if (value.includes("■") || /^\[Mobs:/i.test(value)) {
        rawSpots.push(value);
      }
      i += 1;
    }

    while (i < slice.length && TOOL_LINE.test(slice[i])) {
      tools.push(slice[i]);
      i += 1;
    }

    while (i < slice.length && !LEVEL_RANGE_LINE.test(slice[i]) && !isMaterialLine(slice[i])) {
      i += 1;
    }

    if (LEVEL_RANGE_LINE.test(slice[i])) {
      levelRange = slice[i];
    } else {
      i -= 1;
    }

    materials.push({
      material,
      spots: mergeSpotLines(rawSpots),
      tools,
      levelRange,
    });
  }

  return materials;
}

function extractCoordinates(line, dims) {
  const regex = dims === 2 ? /(-?\d{1,4})\s+(-?\d{1,4})/g : /(-?\d{1,4})\s+(-?\d{1,3})\s+(-?\d{1,4})/g;

  return [...line.matchAll(regex)].map((match) =>
    dims === 2
      ? { x: Number(match[1]), z: Number(match[2]) }
      : { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }
  );
}

function extractNodeCount(line) {
  return normalizeWhitespace(line.match(/\[[^\]]*■[^\]]*\]/)?.[0] || "");
}

function extractMobLevel(line) {
  return normalizeWhitespace(line.match(/\[Mobs:\s*([^\]]+)\]/i)?.[1] || "");
}

function cleanSpotNote(line, dims) {
  let text = normalizeWhitespace(line)
    .replace(/\[[^\]]*■[^\]]*\]/g, " ")
    .replace(/\[Mobs:\s*[^\]]+\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const regex = dims === 2 ? /-?\d{1,4}\s+-?\d{1,4}/g : /-?\d{1,4}\s+-?\d{1,3}\s+-?\d{1,4}/g;

  text = text.replace(regex, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/^\s*(?:and|,)\s*/i, "");
  return text;
}

function spotLabelFromNote(note, dims) {
  let label = cleanSpotNote(note, dims)
    .replace(/^\s*(?:is|are)\s+/i, "")
    .replace(/^\s*(?:an?|the)\s+/i, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (label.includes(",")) {
    const parts = label
      .split(",")
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    const preferred = [...parts]
      .reverse()
      .find((part) =>
        /\b(north|south|east|west|near|inside|outside|adjacent|around|behind|above|below|off|in|of)\b/i.test(part)
      );
    label = preferred || parts[0] || label;
  }

  label = label
    .replace(/^\b(?:located|found)\b\s+/i, "")
    .replace(/^\b(?:in|at|near|inside|outside|north of|south of|east of|west of)\b\s+/i, "")
    .replace(/^\b(?:and|or)\b\s+/i, "")
    .replace(/^\d+\s+locations?\s+in\s+/i, "")
    .replace(/^\b(?:multiple|huge|small|large|general)\b\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return label;
}

function titleFromNote(material, note, dims, spotIndex, spotCount) {
  let label = spotLabelFromNote(note, dims);

  if (!label) {
    return spotCount > 1 ? `${material} Spot ${spotIndex + 1}` : `${material} Spot`;
  }

  const shortened = label.length > 52 ? `${label.slice(0, 51).trimEnd()}…` : label;
  return `${material} - ${shortened}`;
}

function buildDescription(section, material, levelRange, tools, nodeCount, mobLevel, note) {
  const routeNote = cleanSpotNote(note, SECTION_CONFIG[section].dims);
  const parts = [
    `I use this ${SECTION_CONFIG[section].label.toLowerCase()} spot for ${material}${levelRange ? ` around levels ${levelRange}` : ""}.`,
    routeNote ? `Route note: ${routeNote}.` : "",
    nodeCount ? `Nodes: ${nodeCount}.` : "",
    mobLevel ? `Mob pressure: ${mobLevel}.` : "",
    tools.length ? `Tools: ${tools.join(", ")}.` : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function buildExplanation(section, material, levelRange, tools, nodeCount, mobLevel, note, coord) {
  const coordText = coord.y === undefined ? `${coord.x}, ${coord.z}` : `${coord.x}, ${coord.y}, ${coord.z}`;

  return [
    "My Notes",
    `• I farm ${material} here.`,
    levelRange ? `• I use it for levels ${levelRange}.` : "",
    tools.length ? `• I bring ${tools.join(", ")}.` : "",
    nodeCount ? `• I usually get ${nodeCount} nodes here.` : "",
    mobLevel ? `• Mob pressure: ${mobLevel}.` : "",
    `• Coordinates: ${coordText}.`,
    cleanSpotNote(note, SECTION_CONFIG[section].dims)
      ? `• Route note: ${cleanSpotNote(note, SECTION_CONFIG[section].dims)}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRegion(section, note) {
  return spotLabelFromNote(note, SECTION_CONFIG[section].dims) || SECTION_CONFIG[section].label;
}

function markerId(section, material, coord, index) {
  const suffix = coord.y === undefined ? `${coord.x}-${coord.z}` : `${coord.x}-${coord.z}`;
  return `profession-${slugify(section)}-${slugify(material)}-${index}-${slugify(suffix)}`;
}

function buildOutputs(lines) {
  const markers = [];
  const content = {};

  for (const sectionName of SECTION_NAMES) {
    const config = SECTION_CONFIG[sectionName];
    const materials = parseSection(lines, sectionName);
    for (const materialEntry of materials) {
      for (const spotLine of materialEntry.spots) {
        const coords = extractCoordinates(spotLine, config.dims);
        if (!coords.length) {
          continue;
        }

        const nodeCount = extractNodeCount(spotLine);
        const mobLevel = extractMobLevel(spotLine);

        coords.forEach((coord, index) => {
          const id = markerId(sectionName, materialEntry.material, coord, index);
          const title = titleFromNote(materialEntry.material, spotLine, config.dims, index, coords.length);
          const description = buildDescription(
            sectionName,
            materialEntry.material,
            materialEntry.levelRange,
            materialEntry.tools,
            nodeCount,
            mobLevel,
            spotLine
          );

          markers.push({
            id,
            title,
            category: config.category,
            region: buildRegion(sectionName, spotLine),
            description,
            tags: ["profession", slugify(sectionName), slugify(materialEntry.material), config.iconTag],
            position: {
              world: coord.y === undefined ? { x: coord.x, z: coord.z } : { x: coord.x, z: coord.z },
            },
          });

          content[id] = {
            summary: `I use this ${config.label.toLowerCase()} spot for ${materialEntry.material}${materialEntry.levelRange ? ` around levels ${materialEntry.levelRange}` : ""}.`,
            explanation: buildExplanation(
              sectionName,
              materialEntry.material,
              materialEntry.levelRange,
              materialEntry.tools,
              nodeCount,
              mobLevel,
              spotLine,
              coord
            ),
            coverImage: "",
            gallery: [],
            sourceUrl: GUIDE_URL,
            tutorials: [],
          };
        });
      }
    }
  }

  for (const [index, spot] of SUPPLEMENTAL_SPOTS.entries()) {
    const config = SECTION_CONFIG[spot.section];
    const id = `profession-${slugify(spot.section)}-${slugify(spot.material)}-manual-${index}-${slugify(`${spot.coord.x}-${spot.coord.z}`)}`;
    markers.push({
      id,
      title: spot.title,
      category: config.category,
      region: spot.region,
      description: spot.description,
      tags: ["profession", slugify(spot.section), slugify(spot.material), spot.iconTag],
      position: {
        world: { x: spot.coord.x, z: spot.coord.z },
      },
    });

    content[id] = {
      summary: spot.summary,
      explanation: spot.explanation,
      coverImage: "",
      gallery: [],
      sourceUrl: spot.sourceUrl,
      tutorials: [],
    };
  }

  markers.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return { markers, content };
}

async function writeModule(filePath, exportName, value, sourceLine) {
  const file = [sourceLine, "", `export const ${exportName} = ${JSON.stringify(value, null, 2)};`, ""].join("\n");
  await fs.writeFile(filePath, file, "utf8");
}

async function main() {
  const text = await fs.readFile(GUIDE_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const { markers, content } = buildOutputs(lines);

  await writeModule(
    MARKERS_OUTPUT,
    "GENERATED_PROFESSION_MARKERS",
    markers,
    `// Generated by scripts/build-profession-spots.mjs from ${GUIDE_PATH.replace(/\\/g, "/")}`
  );
  await writeModule(
    CONTENT_OUTPUT,
    "GENERATED_PROFESSION_MARKER_CONTENT",
    content,
    `// Generated by scripts/build-profession-spots.mjs from ${GUIDE_URL}`
  );

  console.log(
    JSON.stringify(
      {
        markers: markers.length,
        categories: [...new Set(markers.map((marker) => marker.category))],
        markerOutput: path.relative(ROOT, MARKERS_OUTPUT).replace(/\\/g, "/"),
        contentOutput: path.relative(ROOT, CONTENT_OUTPUT).replace(/\\/g, "/"),
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
