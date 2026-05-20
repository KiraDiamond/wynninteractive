import { GENERATED_QUEST_MARKER_CONTENT } from "./generated-quest-marker-content.js?v=20260520a";
import { GENERATED_QUEST_VIDEO_LINKS } from "./generated-quest-video-links.js?v=20260518x";
import { GENERATED_FAST_TRAVEL_CONTENT } from "./generated-fast-travel-content.js?v=20260519b";
import { GENERATED_SEASKIPPER_CONTENT } from "./generated-seaskipper-content.js?v=20260519d";
import { GENERATED_PROFESSION_MARKER_CONTENT } from "./generated-profession-marker-content.js?v=20260518u";
import { GENERATED_SUPPLEMENTAL_MARKER_CONTENT } from "./generated-supplemental-marker-content.js?v=20260517ac";
import { GENERATED_CAVE_MARKER_CONTENT } from "./generated-cave-marker-content.js?v=20260520c";
import { GENERATED_MOB_CONTENT } from "./generated-mob-content.js?v=20260518i";

const BASE_MARKER_CONTENT = {
  ...GENERATED_QUEST_MARKER_CONTENT,
  ...GENERATED_FAST_TRAVEL_CONTENT,
  ...GENERATED_SEASKIPPER_CONTENT,
  ...GENERATED_PROFESSION_MARKER_CONTENT,
  ...GENERATED_SUPPLEMENTAL_MARKER_CONTENT,
  ...GENERATED_CAVE_MARKER_CONTENT,
  ...GENERATED_MOB_CONTENT,
};

const MANUAL_MARKER_OVERRIDES = {
  "atlas-quests-the-qira-hive-372--5501": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Qira phase guide", url: "https://forums.wynncraft.com/threads/an-in-depth-guide-to-fighting-qira.291617/" },
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-thunder": {
    summary: "First elemental wing. Clear the Thunder floors, bank five catalysts per floor, and finish on Psychomancer for Thunder Catalyst X.",
    explanation: "Route\n• Enter the Thunder Division from Yansur's hall and push floor by floor instead of trying to brute-force the whole quest in one session.\n• Each normal floor wants five catalyst drops turned in to the collector before the next floor unlocks.\n• Thunder enemies lean into burst damage, teleports, pulls, and mind-game pressure, so keep moving and save escape skills for bad overlaps.\n\nBoss\n• Psychomancer — Lv. 95, 530,000 HP, burst-ranged.\n• Core mechanics: heavy teleport, heavy vanish, explode, clone pressure, trap pressure, and force strike.\n• Reward drop: Thunder Catalyst X.\n\nDivision Targets\n• Elecculent through Incarnate supply Thunder Catalysts I-IX.\n• Huwa Kam Bali has a short two-step handoff into a self-destructing second phase before the wing settles back into regular catalyst progression.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-air": {
    summary: "Second elemental wing. Finish the Air floors, cash the catalysts, and end the route on Spirit of Gale.",
    explanation: "Route\n• The Air Division keeps pressure high with knockback, mobility checks, and long ranged lanes.\n• Work each floor for the needed catalyst set before moving on instead of burning resources trying to skip the attrition.\n• Ram Zephyria splits into a follow-up phase, so do not stand still after the first takedown animation.\n\nBoss\n• Spirit of Gale — Lv. 101, 720,000 HP, ranged.\n• Core mechanics: teleport chains, heavy charge, arrow storm, heavy push, heavy pull, aerial bombardment, and sonic boom.\n• Reward drop: Air Catalyst X.\n\nDivision Targets\n• Mist Starling through Stormy Knight supply Air Catalysts I-IX.\n• The wing is built around repositioning, so keep clean sightlines and reset before the boss room if your movement cooldowns are down.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-earth": {
    summary: "Third elemental wing. The Earth path is slower, heavier, and full of chained phase mobs before Genemorph.",
    explanation: "Route\n• The Earth Division trades speed for impact: more tanky enemies, more punishing contact damage, and several chained forms.\n• Deposit five catalysts per normal floor as usual, then slow down for the boss floor rather than greed extra hits.\n• Several enemies fake the kill moment with follow-up spawns, so watch the arena after each finish.\n\nBoss Phases\n• Genemorph Phase 1 — Lv. 98, 15,000 HP. Charge, self-destruct, and meteor pressure.\n• Genemorph Phase 2 — Lv. 98, 15,000 HP. Repeats the same aggressive pattern and drops the Genococoon handoff.\n• Genococoon — Invulnerable cocoon phase. It self-destructs and loops the fight back into the Genemorph chain if you lose control.\n\nDivision Targets\n• Ambertoise through Golemlus supply Earth Catalysts I-IX.\n• Genesis-Revorse is another major spike in the wing with collapse-style arena pressure before the true boss handoff.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-water": {
    summary: "Fourth elemental wing. The Water route is built around control effects, teleports, and a hard judge fight at the end.",
    explanation: "Route\n• Expect more slows, pulls, and ranged punish in the Water Division than raw melee pressure.\n• Keep the floor loop disciplined: gather the five catalyst drops, bank them, then reset your position before the next room.\n• Water mobs punish panic movement, so preserve movement tools for when you need to break a teleport or pull sequence.\n\nBoss\n• Oceanic Judge — Lv. 113, 350,000 HP, ranged.\n• Core mechanics: wave, teleport, push, typhoon, counterspell retaliation, and Ocean's Fury.\n• Reward drop: Water Catalyst X.\n\nDivision Targets\n• Abyss Navigator through Hailstone Lamia supply Water Catalysts I-IX.\n• This is usually where underprepared builds start leaking pots fast, so enter the judge room with clean inventory and cooldowns ready.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-fire": {
    summary: "Fifth elemental wing. Fire leans into direct damage and ends with a two-phase Solar Vanguard fight.",
    explanation: "Route\n• The Fire Division is the most straightforward wing mechanically, but it spikes damage harder than the earlier branches.\n• Keep the catalyst loop clean and do not overcommit when charge or flamethrower chains start stacking.\n• Most of the wing is about surviving burst while keeping enough room to dodge meteor or pull follow-ups.\n\nBoss Phases\n• Solar Vanguard Phase 1 — Lv. 120, 300,000 HP. Flamethrower, pull, explosion, charge, searing ground, and magma pillar pressure.\n• Solar Vanguard Phase 2 — Lv. 120, 300,000 HP. Keeps the charge-heavy pattern, adds meteor emphasis, and awards Fire Catalyst X at the end.\n\nDivision Targets\n• Flame Dancer through Magmorous supply Fire Catalysts I-IX.\n• If you enter the boss room low on healing, back out and recover first because the second phase starts before the fight really slows down.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
  "qira-hive-qira": {
    summary: "Master Division boss room. Once every voucher is cleared, this is the three-phase Qira fight that ends the hive.",
    explanation: "Entry\n• Finish Thunder, Air, Earth, Water, and Fire first, then return to Yansur and push into the Master Division.\n• Enter with healing ready and movement off cooldown because Qira starts real pressure immediately and never really gives the room back.\n\nBoss Phases\n• Phase 1 — 375,000 HP, ranged. Explosion, spiderweb, push, flamethrower, pull, teleport, wave, heal, drone summon, and eldritch force strike.\n• Phase 2 — 375,000 HP, melee. Explosion, teleport, spiderweb, charge, multihit, vanish, eldritch force strike, and bombardment.\n• Phase 3 — 500,000 HP, ranged. Teleport, spiderweb, meteor, wave, explosion, charge, pull, drone summon, bombardment, and eldritch storm.\n\nForum Pattern Notes\n• Phase 1 rotates between explosion or wave strings, web traps, teleport loops, and one heal-based ultimate sequence.\n• Phase 2 shifts into charge chains, explosion bursts, vanish pressure, and a long ultimate that ends on a web trap.\n• Phase 3 adds meteor-heavy rotations plus three different ultimates built around teleports, charges, and repeated webs.\n\nReward\n• Master Voucher ends the quest and unlocks the final hand-in back with Yansur.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Qira_Hive_(Quest)",
    links: [
      { label: "Qira phase guide", url: "https://forums.wynncraft.com/threads/an-in-depth-guide-to-fighting-qira.291617/" },
      { label: "Hive mob list", url: "https://wynncraft.fandom.com/wiki/Lists_of_mobs/The_Qira_Hive" },
    ],
  },
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
  "atlas-quests-acquiring-credentials--256--4983": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Acquiring_Credentials",
  },
  "atlas-quests-aldorei-s-secret-part-i--462--4460": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Aldorei's_Secret_Part_I",
  },
  "atlas-quests-an-iron-heart-part-i--1613--4964": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/An_Iron_Heart_Part_I",
  },
  "atlas-quests-an-iron-heart-part-ii--1745--5479": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/An_Iron_Heart_Part_II",
  },
  "atlas-quests-from-the-mountains--1366--4543": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/From_the_Mountains",
  },
  "atlas-quests-lazarus-pit--1025--5302": {
    summary: "Level 69 quest in Gelibord. Defend the town, investigate the Lazarus Pit legend, solve the crypt graves, then cut the pit off from the river.",
    explanation: "Stage 1\n• Speak to Burtur in Gelibord at [-1025, 47, -5302].\n• Survive the undead attack and help defend the town for 30 seconds.\n\nStage 2\n• Talk to Burtur again and walk to the pyre near [-998, 47, -5273].\n• After the funeral dialogue, head north to Gelibord's graveyard to investigate the Lazarus Pit rumor.\n\nStage 3\n• Find the Order's mage in the graveyard at [-999, 49, -5340].\n• Use the Rusty Shovel on graves until the final dig spawns the mage and drops the talisman.\n\nStage 4\n• Go to the Order chapel at [-1125, 45, -5489].\n• Read the crypt riddle, then grab the bucket in the nearby shack at [-1099, 42, -5456] and collect Lazarus Water outside.\n\nStage 5\n• Revive the four graves and finish each task:\n• Blue flag: revive Lord Plaatic and kill 10 Ghastly Ghouls.\n• Red flag: revive Sir Pigglesworth and recover the Wedding Band from the hole at [-1068, 40, -5494] near the Lich's Tower.\n• Green flag: revive Uggword and defeat him.\n• Yellow flag: revive Poclo, visit the house at [-1105, 42, -5381], check on Mrs. Fluffles in the basement, then report back.\n\nStage 6\n• Open the crypt door, read the inner chamber book, and head to the debris at [-957, 47, -5438].\n• Blast the blockage with a spell, jump into the pit, and clear the three mob waves inside.\n\nStage 7\n• Find a way to block the water pillar in the Lazarus Pit.\n• Return to Burtur in Gelibord once the pit is sealed off from the river.",
    coverImage: "https://wynncraft.wiki.gg/images/thumb/Burtur.png/200px-Burtur.png?3b7f93",
    gallery: [
      "https://wynncraft.wiki.gg/images/thumb/Burtur.png/200px-Burtur.png?3b7f93",
      "https://wynncraft.wiki.gg/images/thumb/LordPlaatictheKind.png/250px-LordPlaatictheKind.png?db31b5",
      "https://wynncraft.wiki.gg/images/thumb/SirPigglesworththeThirty-Fifth.png/250px-SirPigglesworththeThirty-Fifth.png?479608",
    ],
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Lazarus_Pit_(Quest)",
  },
  "atlas-quests-out-of-my-mind--860--961": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Out_of_my_Mind",
  },
  "atlas-quests-reclaiming-the-house--1499--5349": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Reclaiming_the_House",
  },
  "atlas-quests-stable-story-561--1598": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Stable_Story",
  },
  "atlas-quests-star-thief--2018--4822": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Star_Thief",
  },
  "atlas-quests-the-ultimate-weapon--947--4593": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/The_Ultimate_Weapon",
  },
  "atlas-quests-underice-157--812": {
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Underice",
  },
  "atlas-quests-true-colours--1372--563": {
    tutorials: ["https://youtu.be/JyIDve2iKng?si=urOI4IJDqUfcCNki"],
  },
  "atlas-world_discovery-light-s-secret--1050--4295": {
    summary: "Hidden light gateway beneath the Light Forest. This discovery marks the concealed entrance used to reach the Realm of Light from Gavel.",
    explanation: "Access\n• Found beneath the colossal tree in the Light Forest.\n• This is the hidden light portal route tied into the later Realm of Light quest chain.\n\nUse\n• The portal serves as the physical entrance into the Realm of Light.\n• If you are tracing the route manually, treat this as the handoff point between the forest approach and the realm itself.",
    sourceUrl: "https://wynncraft.fandom.com/wiki/Light_Portal",
  },
  "atlas-world_discovery-tol-altar-529--457": {
    summary: "Olmic Tol Altar. This altar upgrades lower-tier runes into Tol runes once you reach the Olmic Cathedral route.",
    explanation: "Access\n• Located in the Olmic Cathedral route near Lutho.\n• This altar is the stricter Tol conversion point and is typically tied to the later Olmic progression path.\n\nUse\n• Bring spare Az, Nii, or Uth runes and convert them upward into Tol runes here.\n• This is the more valuable Tol stop if you are already routing Olmic content and want to consolidate rune upgrades in one run.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Tol_Altar",
  },
  "atlas-world_discovery-tol-altar-1431--4634": {
    summary: "Sky Islands Tol Altar. This is the second Tol conversion point for turning lower-tier runes into Tol runes during Sky routes.",
    explanation: "Access\n• Located in the Sky Islands route.\n• This altar is the easier Tol stop to fold into sky travel if you are not already heading toward Olmic Cathedral.\n\nUse\n• Convert spare Az, Nii, or Uth runes into Tol runes here.\n• Use this one when your route is already in the sky chain and you do not want to detour back through the ocean-side altar.",
    sourceUrl: "https://wynncraft.wiki.gg/wiki/Tol_Altar",
  },
  "atlas-world_discovery-uth-shrine--1911--3235": {
    summary: "Corkus-side Uth Shrine. Offer a Golden Avia Feather here to summon the Uth Guardians and earn Uth runes.",
    explanation: "Access\n• This shrine sits on the Corkus-side route.\n• To activate it, bring a Golden Avia Feather and use it at the shrine.\n\nUse\n• The shrine summons the Uth Guardians encounter.\n• Clearing the guardian set rewards Uth runes, which makes this one of the direct rune-upgrade stops worth routing once you have spare feathers.",
    sourceUrl: "https://wynncraft.fandom.com/wiki/Uth_Shrine",
    links: [
      { label: "Uth guardian notes", url: "https://forums.wynncraft.com/threads/uth-runes-uth-guardians-because-i-got-bored.243575/" },
    ],
  },
  "atlas-world_discovery-uth-shrine--215--4460": {
    summary: "Ocean-side Uth Shrine. Offer a Golden Avia Feather here to trigger the Uth Guardians and cash out for Uth runes.",
    explanation: "Access\n• This shrine sits on the ocean-side route near Aldorei-facing travel.\n• Bring a Golden Avia Feather to start the guardian encounter.\n\nUse\n• Activating the shrine summons the Uth Guardians fight.\n• This is the better Uth stop when your route is already running the ocean and forest side instead of Corkus.",
    sourceUrl: "https://wynncraft.fandom.com/wiki/Uth_Shrine",
    links: [
      { label: "Uth guardian notes", url: "https://forums.wynncraft.com/threads/uth-runes-uth-guardians-because-i-got-bored.243575/" },
    ],
  },
};

const ALL_MARKER_CONTENT_KEYS = new Set([
  ...Object.keys(BASE_MARKER_CONTENT),
  ...Object.keys(GENERATED_QUEST_VIDEO_LINKS),
  ...Object.keys(MANUAL_MARKER_OVERRIDES),
]);

export const MARKER_CONTENT = Object.fromEntries(
  [...ALL_MARKER_CONTENT_KEYS].map((key) => [
    key,
    {
      ...(BASE_MARKER_CONTENT[key] || {}),
      ...(GENERATED_QUEST_VIDEO_LINKS[key] || {}),
      ...(MANUAL_MARKER_OVERRIDES[key] || {}),
    },
  ]),
);
