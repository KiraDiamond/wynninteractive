import { GENERATED_QUEST_MARKER_CONTENT } from "./generated-quest-marker-content.js?v=20260517ac";
import { GENERATED_PROFESSION_MARKER_CONTENT } from "./generated-profession-marker-content.js?v=20260518u";
import { GENERATED_SUPPLEMENTAL_MARKER_CONTENT } from "./generated-supplemental-marker-content.js?v=20260517ac";
import { GENERATED_MOB_CONTENT } from "./generated-mob-content.js?v=20260518i";

const BASE_MARKER_CONTENT = {
  ...GENERATED_QUEST_MARKER_CONTENT,
  ...GENERATED_PROFESSION_MARKER_CONTENT,
  ...GENERATED_SUPPLEMENTAL_MARKER_CONTENT,
  ...GENERATED_MOB_CONTENT,
};

const MANUAL_MARKER_OVERRIDES = {
  "atlas-raid-orphions-nexus-of-light--732--6412": {
    summary: "Level 79 raid. Requires Realm of Light V - The Realm of Light. Uses 1 Uth Rune.",
    explanation: "Entry\n• Minimum level: 79.\n• Required quest: Realm of Light V - The Realm of Light.\n• Rune: 1 Uth Rune.\n• Party size: 4 players.\n\nBosses\n• Orphion, the Light Beast\n• The Parasite",
    coverImage: "https://wynncraft.wiki.gg/images/thumb/OrphionsNexusofLightIcon.png/120px-OrphionsNexusofLightIcon.png",
    gallery: [
      "https://wynncraft.wiki.gg/images/thumb/CBRaidIcon.png/40px-CBRaidIcon.png",
      "https://wynncraft.wiki.gg/images/thumb/OrphionsNexusofLightIcon.png/120px-OrphionsNexusofLightIcon.png",
    ],
    sourceUrl: "https://wynncraft.fandom.com/wiki/Orphion%27s_Nexus_of_Light",
    tutorials: [],
  },
  "atlas-secret-discovery-ragni-s-secret-library--933--1610": {
    tutorials: ["https://www.youtube.com/shorts/pVfKL5gymT0"],
  },
  "atlas-secret-discovery-far-from-the-roots--500--1630": {
    tutorials: ["https://www.youtube.com/shorts/nLOzauew_OA"],
  },
  "atlas-secret-discovery-a-hero-s-origin--872--1978": {
    tutorials: ["https://www.youtube.com/shorts/umCtab3mPDY"],
  },
  "atlas-secret-discovery-watchmen--279--1583": {
    tutorials: ["https://www.youtube.com/shorts/Vx_8FFUS9OQ"],
  },
  "atlas-secret-discovery-boulder-breaker-310--1460": {
    tutorials: ["https://www.youtube.com/shorts/UbGERvMDXrA"],
  },
  "atlas-secret-discovery-historical-maltic--560--1858": {
    tutorials: ["https://www.youtube.com/shorts/pbV_7vX5XyY"],
  },
  "atlas-secret-discovery-ruins-of-detlas-435--1574": {
    tutorials: ["https://www.youtube.com/shorts/Yta8UaxnJWM"],
  },
  "atlas-secret-discovery-water-of-the-past--303--1887": {
    tutorials: ["https://www.youtube.com/shorts/1HIKAf6Y9iU"],
  },
  "atlas-secret-discovery-bak-al-s-destruction-1--123--1288": {
    tutorials: ["https://www.youtube.com/shorts/mFgVTkHB_4I"],
  },
  "atlas-secret-discovery-bak-al-s-destruction-2-120--1535": {
    tutorials: ["https://www.youtube.com/shorts/HWLyCTcCscc"],
  },
  "atlas-secret-discovery-bak-al-s-destruction-3--744--1960": {
    tutorials: ["https://www.youtube.com/shorts/_3G8o-Edh9U"],
  },
  "atlas-secret-discovery-timeless-ruin--509--1061": {
    tutorials: ["https://www.youtube.com/shorts/1uq6cO92jPY"],
  },
  "atlas-secret-discovery-beneath-the-roots-26--1312": {
    tutorials: ["https://www.youtube.com/shorts/CnTfldxmQ_w"],
  },
  "atlas-secret-discovery-somewhere-in-between--732--1270": {
    tutorials: ["https://www.youtube.com/shorts/lvaN9mjDN_4"],
  },
};

const ALL_MARKER_CONTENT_KEYS = new Set([
  ...Object.keys(BASE_MARKER_CONTENT),
  ...Object.keys(MANUAL_MARKER_OVERRIDES),
]);

export const MARKER_CONTENT = Object.fromEntries(
  [...ALL_MARKER_CONTENT_KEYS].map((key) => [
    key,
    {
      ...(BASE_MARKER_CONTENT[key] || {}),
      ...(MANUAL_MARKER_OVERRIDES[key] || {}),
    },
  ]),
);
