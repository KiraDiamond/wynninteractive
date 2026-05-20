import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IMPORTED_MARKERS } from "../data/imported-markers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_MARKERS = path.join(ROOT, "data", "generated-seaskipper-markers.js");
const OUTPUT_CONTENT = path.join(ROOT, "data", "generated-seaskipper-content.js");
const OUTPUT_SUMMARY = path.join(ROOT, "data", "wiki-scrape", "seaskipper", "summary.md");
const SOURCE_URL = "https://wynncraft.wiki.gg/wiki/Seaskipper_Captain";
const COVER_IMAGE = "https://wynncraft.wiki.gg/images/thumb/SeaskipperCaptain.png/250px-SeaskipperCaptain.png?cb27ed";

const STOPS = [
  { sourceId: "import-272-seaskipper-fast-travel", title: "Nemract", region: "Wynn" },
  { sourceId: "import-273-seaskipper-fast-travel", title: "Selchar", region: "Ocean" },
  { sourceId: "import-274-seaskipper-fast-travel", title: "Llevigar", region: "Gavel West" },
  { sourceId: "import-275-seaskipper-fast-travel", title: "Nesaak Forest", region: "Wynn" },
  { sourceId: "import-276-seaskipper-fast-travel", title: "Fruma Gate", region: "Sky" },
  { title: "Jofash Docks", region: "Sky", x: 1388, z: -4108, manual: true },
  { sourceId: "import-306-seaskipper-fast-travel", title: "Half Moon Island", region: "Ocean" },
  { sourceId: "import-307-seaskipper-fast-travel", title: "Galleon's Graveyard", region: "Ocean" },
  { sourceId: "import-308-seaskipper-fast-travel", title: "Pirate Cove", region: "Ocean" },
  { sourceId: "import-309-seaskipper-fast-travel", title: "Dead Island", region: "Ocean" },
  { sourceId: "import-310-seaskipper-fast-travel", title: "Volcanic Isles", region: "Corkus" },
  { sourceId: "import-311-seaskipper-fast-travel", title: "Bear Zoo", region: "Ocean" },
  { sourceId: "import-312-seaskipper-fast-travel", title: "Durum Isles", region: "Ocean" },
  { sourceId: "import-313-seaskipper-fast-travel", title: "Rooster Island", region: "Ocean" },
  { sourceId: "import-314-seaskipper-fast-travel", title: "Nodguj Nation", region: "Ocean" },
  { sourceId: "import-315-seaskipper-fast-travel", title: "Zhight Island", region: "Ocean" },
  { sourceId: "import-316-seaskipper-fast-travel", title: "Skiens Island", region: "Ocean" },
  { sourceId: "import-317-seaskipper-fast-travel", title: "Mage Island", region: "Ocean" },
  { sourceId: "import-318-seaskipper-fast-travel", title: "Maro Peaks", region: "Ocean" },
  { sourceId: "import-319-seaskipper-fast-travel", title: "Corkus Docks", region: "Corkus" },
];

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stopSummary(title) {
  return `Ride the V.S.S. Seaskipper from ${title}. The captain links the major ocean stops, tells travel stories, and can occasionally hand out small rewards.`;
}

function stopExplanation(title, connectedStops) {
  return [
    "Route",
    "• Network: V.S.S. Seaskipper.",
    `• Stop: ${title}.`,
    "• The captain here can sail between the main island and port route network once you can access the service.",
    "",
    "Notes",
    "• Source page notes that Seaskipper Captain is involved with Misadventure on the Sea.",
    "• While traveling, he can tell destination stories, lore bits, jokes, or hand out occasional item rewards.",
    connectedStops.length ? `• Other mapped Seaskipper stops: ${connectedStops.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const importedById = new Map(IMPORTED_MARKERS.map((marker) => [marker.id, marker]));
  const markers = [];
  const content = {};
  const missing = [];

  for (const stop of STOPS) {
    const source = stop.manual ? { position: { world: { x: stop.x, z: stop.z } } } : importedById.get(stop.sourceId);
    if (!source?.position?.world) {
      missing.push(stop.sourceId);
      continue;
    }

    const id = `seaskipper-${slugify(stop.title)}-${source.position.world.x}-${source.position.world.z}`;
    const connectedStops = STOPS.filter((entry) => entry.title !== stop.title)
      .map((entry) => entry.title)
      .sort((left, right) => left.localeCompare(right));

    markers.push({
      id,
      title: stop.title,
      category: "seaskipper",
      region: stop.region,
      description: "Seaskipper Captain dock.",
      tags: ["seaskipper", "travel", "ocean-route", slugify(stop.title)],
      position: {
        world: {
          x: source.position.world.x,
          z: source.position.world.z,
        },
      },
    });

    content[id] = {
      summary: stopSummary(stop.title),
      explanation: stopExplanation(stop.title, connectedStops),
      coverImage: COVER_IMAGE,
      gallery: [],
      sourceUrl: SOURCE_URL,
      tutorials: [],
      links: [],
    };
  }

  markers.sort((left, right) => left.title.localeCompare(right.title));

  await fs.mkdir(path.dirname(OUTPUT_SUMMARY), { recursive: true });
  await fs.writeFile(
    OUTPUT_MARKERS,
    `export const GENERATED_SEASKIPPER_MARKERS = ${JSON.stringify(markers, null, 2)};\n`
  );
  await fs.writeFile(
    OUTPUT_CONTENT,
    `export const GENERATED_SEASKIPPER_CONTENT = ${JSON.stringify(content, null, 2)};\n`
  );

  const summary = [
    "# Seaskipper Summary",
    "",
    `Source: ${SOURCE_URL}`,
    "",
    `Markers generated: ${markers.length}`,
    `Imported Seaskipper points used: ${STOPS.filter((stop) => !stop.manual).length - missing.length}`,
    `Manual wiki stop points used: ${STOPS.filter((stop) => stop.manual).length}`,
    "",
    "These markers use the imported live Seaskipper travel icon coordinates and the Seaskipper Captain wiki page for route context.",
    "",
  ];

  if (missing.length) {
    summary.push("## Missing Source Points", "", ...missing.map((entry) => `- ${entry}`), "");
  }

  await fs.writeFile(OUTPUT_SUMMARY, `${summary.join("\n")}\n`);
}

await main();
