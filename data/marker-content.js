import { GENERATED_QUEST_MARKER_CONTENT } from "./generated-quest-marker-content.js?v=20260517ac";
import { GENERATED_PROFESSION_MARKER_CONTENT } from "./generated-profession-marker-content.js?v=20260518u";
import { GENERATED_SUPPLEMENTAL_MARKER_CONTENT } from "./generated-supplemental-marker-content.js?v=20260517ac";
import { GENERATED_MOB_CONTENT } from "./generated-mob-content.js?v=20260518i";

const MANUAL_MARKER_CONTENT = {
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
};

export const MARKER_CONTENT = {
  ...GENERATED_QUEST_MARKER_CONTENT,
  ...GENERATED_PROFESSION_MARKER_CONTENT,
  ...GENERATED_SUPPLEMENTAL_MARKER_CONTENT,
  ...GENERATED_MOB_CONTENT,
  ...MANUAL_MARKER_CONTENT,
};
