function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function centroid(points) {
  const total = points.reduce((acc, point) => {
    acc.x += point.x;
    acc.z += point.z;
    return acc;
  }, { x: 0, z: 0 });

  return {
    x: Math.round(total.x / points.length),
    z: Math.round(total.z / points.length),
  };
}

function coordinateText(points) {
  if (points.length === 1) {
    const point = points[0];
    return `${point.x}, ${point.z}`;
  }
  return points.map((point) => `${point.x}, ${point.z}`).join(" | ");
}

function buildDescription(event) {
  const parts = [
    `Suggested level ${event.level}.`,
    event.requiredQuest && event.requiredQuest !== "-" ? `Requires ${event.requiredQuest}.` : null,
    `${event.length} event, ${event.difficulty.toLowerCase()} difficulty, ${event.waves} waves.`,
    event.boss ? `Boss: ${event.boss}.` : null,
    event.rewards ? `Rewards: ${event.rewards}.` : null,
    `Anchor coordinates: ${coordinateText(event.points)}.`,
  ];

  return parts.filter(Boolean).join(" ");
}

function worldEvent(title, level, requiredQuest, points, region, length, difficulty, waves, boss, rewards) {
  return {
    id: `world-event-${slugify(title)}`,
    title,
    category: "world_events",
    region,
    description: buildDescription({ title, level, requiredQuest, points, length, difficulty, waves, boss, rewards }),
    tags: ["world-event", slugify(region)],
    position: { world: centroid(points) },
    details: {
      level,
      requiredQuest: requiredQuest && requiredQuest !== "-" ? requiredQuest : null,
      coordinates: points,
      length,
      difficulty,
      waves,
      boss,
      rewards,
    },
  };
}

export const WORLD_EVENT_MARKERS = [
  worldEvent("Defender of the Plains", 3, null, [{ x: -441, z: -1896 }], "Maltic Plains", "Short (3m)", "Medium", 4, "Defender of the Plains", "+300 XP, Various Items"),
  worldEvent("Approaching Raid", 5, null, [{ x: -655, z: -1670 }], "Emerald Trail", "Medium (3m)", "Easy", 3, "Zombie Brute", "+400 XP, Various Items"),
  worldEvent("Skittering Spiders", 6, null, [{ x: -188, z: -1708 }], "Nivla Woods", "Short (2m)", "Easy", 2, "Broodmother", "+100 XP, Exclusive Item, Various Items"),
  worldEvent("Overtaken Farm", 8, null, [{ x: -770, z: -1795 }], "Maltic Plains", "Short (3m)", "Medium", 4, "Terrifycrow", "+450 XP, Various Items"),
  worldEvent("Arachnid Ambush", 8, null, [{ x: -364, z: -1668 }, { x: -305, z: -1518 }], "Nivla Woods", "Medium (4m)", "Medium", 5, "Broodmother", "+450 XP, Silken Slippers, Various Items"),
  worldEvent("Encroaching Blaze", 10, null, [{ x: -392, z: -1500 }], "Nivla Woods", "Long (4m)", "Medium", 4, "Infernal Adjutant", "+600 XP, Cauterizer, Fire Brand, Various Items"),
  worldEvent("Dark Deacons", 15, null, [{ x: -530, z: -1450 }], "Time Valley", "Short (5m)", "Hard", 4, "3 Cursed Cultists", "+1,000 XP, Diaconate, Cultist Ashes, Various Items"),
  worldEvent("Encroaching Destruction", 15, null, [{ x: 216, z: -1494 }, { x: 283, z: -1424 }, { x: 375, z: -1460 }], "Detlas Suburbs", "Long (4m)", "Medium", 4, "Infernal Lieutenant", "+1,000 XP, Various Items"),
  worldEvent("Corrupted Spring", 15, null, [{ x: 418, z: -1310 }], "Corrupted Plains", "Medium (5m)", "Hard", 4, "Lava Lilac", "+1,000 XP, Scoria Pollen, Various Items"),
  worldEvent("Necromantic Site", 18, null, [{ x: 105, z: -1727 }], "Detlas Suburbs", "Medium (4m)", "Medium", 8, "Drifting Reaper", "+1,300 XP, Various Items"),
  worldEvent("Risen Return", 20, null, [{ x: 52, z: -2065 }], "Nemract Swamp", "Long (4m)", "Medium", 4, "Sayleros' Brother's Return", "+1,600 XP, Angel Wing Shroud, Various Items"),
  worldEvent("Encroaching Misery", 20, null, [{ x: 210, z: -1875 }, { x: 130, z: -1892 }], "Ancient Nemract", "Long (3m)", "Medium", 4, "Infernal Captain", "+1,000 XP, Various Items"),
  worldEvent("Tainted Shoreline", 24, null, [{ x: 603, z: -2282 }], "Pirate Bay", "Medium (5m)", "Easy", 6, "3 Wavecaller Zombies", "+3,000 XP, The Swordfish, Various Items"),
  worldEvent("Aeon Origin", 25, null, [{ x: -430, z: -1076 }, { x: -500, z: -1100 }, { x: -416, z: -1181 }], "Time Valley", "Long (4m)", "Hard", 6, "Fetid Ancient and Foregone Ancient", "+600 XP, Nostalgia, Uncanny Mirage, Various Items"),
  worldEvent("Bowels of the Roots", 30, null, [{ x: 214, z: -1284 }], "Roots of Corruption", "Medium (3m)", "Hard", 5, "3 Infernal Glares", "+4,500 XP, Various Items"),
  worldEvent("Encroaching Reanimation", 30, null, [{ x: 975, z: -2240 }], "Almuj Desert", "Medium (3m)", "Medium", 5, "Infernal Major", "+4,500 XP, Various Items"),
  worldEvent("Improper Burial Rites", 35, null, [{ x: 1111, z: -1854 }], "Almuj Desert", "Short (4m)", "Easy", 5, "Accursed Mummy", "+7,000 XP, Desert Wretch, Desert Sepulcher, Various Items"),
  worldEvent("Blood-Encrusted Mastaba", 36, null, [{ x: 1144, z: -2094 }], "Almuj Desert", "Medium (4m)", "Medium", 8, "2 Blood-Encrusted Mummies", "+7,300 XP, Desert Winds, Phlebotomy, Various Items"),
  worldEvent("Encroaching Conflagration", 40, null, [{ x: 1223, z: -1474 }], "Rymek Mesa", "Short (3m)", "Hard", 3, "Infernal Colonel", "+11,000 XP, Various Items"),
  worldEvent("Failed Hunt", 40, "Canyon Condor", [{ x: 1025, z: -1535 }], "Rymek Mesa", "Short (3m)", "Easy", 3, "Enraged Cockatrice", "+11,000 XP, Flaming Wing, Desert Stalker, Funambulist, Stolen Egg, Various Items"),
  worldEvent("Canine Ambush", 42, null, [{ x: 193, z: -875 }, { x: 0, z: -924 }, { x: 35, z: -730 }], "Nesaak Tundra", "Medium (5m)", "Medium", 5, "2 Polar Fangs", "+15,000 XP, Lurking Peril, The Scavenged, Various Items"),
  worldEvent("Blazing Combustion", 43, null, [{ x: 1470, z: -1235 }], "Rymek Mesa", "Medium (7m)", "Hard", 7, "2 Rising Sols and Molten Hulk", "+16,000 XP, Desert Sands, Various Items"),
  worldEvent("Lonely Islet", 45, null, [{ x: 451, z: -3767 }], "Ocean", "Medium (5m)", "Medium", 5, "Remnant of the Storm", "+15,000 XP, Squid's Heart, Megalophobia, Tentacle Whip, Sealight Prism, Various Items"),
  worldEvent("Encroaching Ablation", 46, null, [{ x: 105, z: -1030 }], "Nesaak Tundra", "Medium (5m)", "Hard", 4, "Infernal General", "+23,000 XP, Various Items"),
  worldEvent("Rogue Wyrmling", 50, null, [{ x: -1932, z: -5325 }, { x: -1797, z: -5247 }], "Olux Swamp", "Medium (5m)", "Medium", 6, "Grootslang Whelp", "+40,000 XP, Earthmover, Decaybound Spindle, Mould Breaker, Grootslang Fin, Various Items"),
  worldEvent("Slimy Schism", 50, null, [{ x: -560, z: -664 }], "Troms Jungle", "Medium (6m)", "Easy", 4, "Gargantuan Slime", "+40,000 XP, Jinxed Coif, Scumlord, Purity Filter, Buoyant Balmorals, Sludge Slicer, Repose, Various Items"),
  worldEvent("Swashbuckling Brawl", 50, "Ice Nations", [{ x: 730, z: -3735 }], "Ghost Ship", "Medium (4m)", "Medium", 4, "Rotten Captain", "+45,000 XP, Catamaran, Salt Crag, Anaklusmos, Soqueira, Monsoon, Canned Sardines, Various Items"),
  worldEvent("Desperate Ambush", 56, null, [{ x: -1954, z: -5120 }], "Olux Swamp", "Long (8m)", "Medium", 7, "Colossal Hatchling, Eight-Legged Atrocity, Desolate Witch", "+75,000 XP, Botched Experiment, Various Items"),
  worldEvent("A Burning Memory", 60, null, [{ x: -370, z: -695 }], "Great Bridge", "Long (8m)", "Hard", 6, "Bane of the Great Bridge", "+100,000 XP, Crumbling Foundation, Isostatic Rebound, Singed Regrets, Stronghold, Besieged Sanctum, Tattered Magic Cloth, Various Items"),
  worldEvent("Encroaching Extinction", 65, null, [{ x: -599, z: -462 }], "Dernel Jungle", "Medium (5m)", "Medium", 5, "Infernal Superior General", "+150,000 XP, Jungle Rogue, Broken Fiddle, Devilish Delight, Various Items"),
  worldEvent("Peculiar Grotto", 70, null, [{ x: -912, z: -4708 }], "Light Forest", "Medium (4m)", "Easy", 4, "Grandpa Mush", "+220,000 XP, Shining Spore, Stifling Spores, Various Items"),
  worldEvent("Light Emissaries", 70, null, [{ x: -1041, z: -4442 }], "Light Forest", "Medium (4m)", "Hard", 7, "Roaring Dawn", "+220,000 XP, Aphorism, Helios Lux, Various Items"),
  worldEvent("Unsettling Encounters", 70, null, [{ x: -821, z: -5259 }], "Kander Forest", "Medium (3m)", "Hard", 4, "Putrescent Virago", "+220,000 XP, Decaying Headdress, Disfigured Vessel, Warden, Various Items"),
  worldEvent("Visit from Beyond", 70, null, [{ x: -656, z: -5275 }], "Kander Forest", "Medium (3m)", "Hard", 4, "Kandrekk Soulweaver", "+220,000 XP, Price of Life, Phantasmal Remnants, Soul Ink, Memory Dye, Various Items"),
  worldEvent("Abandoned Sentinels", 75, null, [{ x: -53, z: -4715 }, { x: -113, z: -4667 }, { x: -178, z: -4583 }], "Cinfras County", "Long (3m)", "Hard", 5, "Goliath Construct", "+350,000 XP, Reliquiae, Isostasis, Obsolescent Panoply, Pristine Antiquity, Splintered Greathammer, Various Items"),
  worldEvent("Realmic Antigen", 85, null, [{ x: -804, z: -6242 }], "The Realm of Light", "Long (6m)", "Hard", 8, "Pearlescent Antigen", "+550,000 XP, Hollow Virtue, Traumerei, Deliverance, Apotheosis, Sliver of Sunrise, Various Items"),
  worldEvent("Territorial Trolls", 85, null, [{ x: 322, z: -5113 }, { x: 545, z: -5114 }, { x: 473, z: -5192 }], "Canyon of the Lost", "Medium (7m)", "Hard", 6, "5 Troll Pathclearers and Troll Bonecrusher", "+700,000 XP, Troll Toes, Shredder Club, Abominator, Various Items"),
  worldEvent("Colossi Ingrain", 85, null, [{ x: 531, z: -5014 }], "Canyon of the Lost", "Medium (7m)", "Hard", 7, "Roaming Ancient and 2 Agate Axons", "+700,000 XP, Earthsky Eclipse, Splintered Dawn, Shattered Horizon, Various Items"),
  worldEvent("Enraged Eagle", 85, null, [{ x: 368, z: -4447 }], "Canyon of the Lost", "Short (4m)", "Medium", 4, "Great Eagle", "+700,000 XP, Aviform, Skysquawk, Takeoff, Various Items"),
  worldEvent("Ruff & Tumble", 85, null, [{ x: 753, z: -5339 }], "Canyon of the Lost", "Medium (10m)", "Hard", 7, "Dire Tuffer", "+700,000 XP, Gneiss Belt, Granitic Mettle, Various Items"),
  worldEvent("Despermech Occupation", 85, null, [{ x: -1538, z: -2751 }], "Corkus", "Medium (5m)", "Hard", 8, "2 Rusted Warmachines", "+700,000 XP, Spring-Coiled Cataphract, Found Footage, Desperate Facsimile, Various Items"),
  worldEvent("Decommissioned War Machines", 90, null, [{ x: -1564, z: -2205 }], "Corkus", "Long (8m)", "Hard", 6, "A17-L32 Roaming Destroyer", "+1,000,000 XP, Herald of Ruin, H-209 Miniature Defibrillator, A16-L31 Handheld Mortar, Electromagnetic Shield Plating, Various Items"),
  worldEvent("Bubbling Terrace", 90, null, [{ x: 1157, z: -5415 }], "Lower Molten Heights", "Short (5m)", "Medium", 7, "Steam Ophidian", "+1,000,000 XP, Abiogenesis, Vapor Fang, Triple Point, Various Items"),
  worldEvent("Infernal Caldera", 92, null, [{ x: 1369, z: -5213 }], "Upper Molten Heights", "Medium (7m)", "Medium", 8, "2 Infernal Hounds", "+1,100,000 XP, Scorched Antiquity, Various Items"),
  worldEvent("Maar Ashpit", 94, null, [{ x: 1463, z: -5425 }], "Upper Molten Heights", "Long (10m)", "Hard", 9, "7 Extrusive Sculptures", "+1,250,000 XP, Amorphous, Eradian Cuissards, Cypress Amber, Various Items"),
  worldEvent("Shattered Roosts", 95, null, [{ x: 1160, z: -4470 }], "Sky Islands", "Medium (7m)", "Hard", 6, "2 Apollo Greatbirds and Minokawa", "+1,300,000 XP, Greatbird Eyrie, Minokawa's Grasp, Perch of the Shrouded Sun, Various Items"),
  worldEvent("Ahms Monuments", 95, null, [{ x: 1388, z: -4108 }], "Jofash Docks", "Short (6m)", "Medium", 5, "3 Colossal Ahms Carvings", "+1,300,000 XP, Blank Stare, Rano Raraku, Repurposed Vessels, Various Items"),
  worldEvent("Incomprehensible Cynosure", 100, "A Journey Beyond", [{ x: 600, z: -845 }, { x: 603, z: -503 }], "The Silent Road", "Long (4m)", "Hard", 5, "Eyed Shade and Something", "+1,800,000 XP, Impossibility Threshold, Inscrutable Illusion, Mesmerizing Madness, Various Items"),
  worldEvent("Shapes in the Dark", 101, "A Journey Beyond", [{ x: 538, z: -836 }, { x: 597, z: -341 }], "Ruined Olmic City", "Short (4m)", "Hard", 6, "Looming Presence", "+1,800,000 XP, Delusion, Death Grasp, Black Space, Various Items"),
  worldEvent("All Eyes on Me", 101, "A Journey Beyond", [{ x: 907, z: -560 }, { x: 925, z: -426 }], "Eyeball Forest", "Long (7m)", "Medium", 8, "2 Woodwalkers", "+2,000,000 XP, Sclera Swathe, Pareidolia, Fleshbark, Various Items"),
  worldEvent("Monument to Loss", 101, "A Journey Further", [{ x: 1200, z: -1025 }], "Void Valley", "Short (7m)", "Medium", 7, "5 ??? (Lv. 115) and Void-Torn Alnamar", "+2,000,000 XP, Unshackled Spirit, Tendril Talon, Withstand, Schadenfreude, Dernic Sludgebomb, Various Items"),
  worldEvent("Pestilential Downpour", 102, "A Journey Further", [{ x: 995, z: -1052 }], "Toxic Wastes", "Medium (6m)", "Medium", 7, "2 Atomic Disembougers", "+2,300,000 XP, Acidosis, Malicious Maw, Sulfur Expulser, Nuclear Emesis, Various Items"),
  worldEvent("Otherworldly Exhibition", 104, "A Journey Further", [{ x: 1450, z: -965 }], "Unknown", "Long (10m)", "Hard", 9, "Smoldering Chunk, Iconoclastic Artpiece, Null Structure, Flesh Collage, Upside Downer, Ravenous Abyss, Diminished Greater One, False Figure", "+2,500,000 XP, Agglomerate Apex, Null Plating, Transplanted Psyche, Inverted Grotesque, Various Items"),
  worldEvent("Prelude to Annihilation", 105, null, [{ x: 313, z: -1289 }], "Roots of Corruption", "Long (20m)", "Hard", 1, "Annihilation", "+15,000 XP, Mephistophelian, Syncope, Cnidarian Hellspawn, Malevolent Urge, Adherence, Blunt Force, Watchman's Vendetta, Scorching Horn, Claw of Demise, Frenetic Heart, Third Clarion, Corrupted Cache, Various Items"),
  worldEvent("Swampland Squabble", 105, "A Journey Home", [{ x: -2152, z: -1435 }], "Frog Bog", "Medium (6m)", "Medium", 7, "3 Cursed Outcast and Frog", "+2,800,000 XP, Skeetwing Jewel, Various Items"),
  worldEvent("Autumn Poachers", 105, "A Journey Home", [{ x: -1954, z: -1409 }], "Auburn Forest", "Long (7m)", "Hard", 8, "Trapper, Enraged Ursa Major, Enraged Sycamore Elk, 2 Master Trappers", "+2,800,000 XP, Poachers' Greed, Various Items"),
  worldEvent("Stackpeak Pinnacle", 108, "A Journey Home", [{ x: -1611, z: -1653 }], "Xima Valley", "Short (6m)", "Medium", 4, "Royal Stackhawk", "+3,000,000 XP, Skyline Bliss, Vigilance, Falcon, Various Items"),
  worldEvent("Karoshi Union", 108, "Revelations in Fall", [{ x: -2240, z: -910 }], "Industrial District", "Medium (6m)", "Medium", 5, "3 Padrones and 2 Pest Technicians", "+3,500,000 XP, Eternal Toil, Various Items"),
  worldEvent("Steel Skirmish", 108, "Revelations in Fall", [{ x: -1949, z: -759 }], "Industrial District", "Medium (6m)", "Medium", 6, "Commander Yoltur", "+2,000,000 XP, Gleam, Various Items"),
  worldEvent("Biohazardous Bloom", 110, "Revelations in Fall", [{ x: -2234, z: -563 }], "Industrial District", "Medium (6m)", "Hard", 7, "The Congelation", "+3,800,000 XP, Biohazard, Ravenous Hunger, Various Items"),
  worldEvent("Tree-Top Cradle", 115, "Revelations in Fall", [{ x: -1326, z: -784 }], "Mistwoods", "Short (4m)", "Medium", 4, "Mother Lammergeier", "+2,000,000 XP, Hypsophobia, Various Items"),
  worldEvent("Apiary Hive", 115, "Revelations in Fall", [{ x: -1383, z: -605 }], "Mistwoods", "Short (6m)", "Medium", 4, "Queen Apiary", "+4,200,000 XP, Queen Bee's Call, Hive Mind, Mistweb Spinner, Various Items"),
  worldEvent("Fossil Fighters", 115, "Revelations in Fall", [{ x: -1262, z: -807 }], "Mistwoods", "Long (6m)", "Hard", 8, "2 Alpha Kivaraptors and 2 Alpha Sailsaurs", "+4,500,000 XP, Last Sun, Various Items"),
  worldEvent("Citadel Barracks", 117, "Ensemble of Hope", [{ x: -1704, z: -940 }], "Aelumia Citadel", "Short (8m)", "Easy", 6, "4 Gendarme Lancers", "+6,500,000 XP, Panopticon, Ruinous, Ballistics Satchel, Various Items"),
  worldEvent("Glacial Training", 118, "Revelations in Fall", [{ x: -1079, z: -1350 }], "Highlands", "Short (8m)", "Medium", 6, "Master Archer", "+5,500,000 XP, Various Items"),
  worldEvent("Patrolling Soldiers", 118, "Revelations in Fall", [{ x: -1073, z: -1196 }, { x: -1224, z: -1350 }, { x: -1194, z: -1193 }], "Mistwoods", "Long (7m)", "Medium", 7, "4 Highlands Glaive Masters and 3 Patrolling Commanders", "+5,500,000 XP, Lumino Blossom, Light of the Wings, Various Items"),
  worldEvent("Mole Meet-Up", 119, "Revelations in Fall", [{ x: -1037, z: -1225 }], "Highlands", "Medium (8m)", "Easy", 5, "Rolling Avalanche", "+4,500,000 XP, Various Items"),
  worldEvent("Royal Alchemists", 119, "Revelations in Fall", [{ x: -1693, z: -815 }], "Aelumia Citadel", "Long (9m)", "Medium", 6, "4 Gallehauts, 2 Gendarme Kenshis, Aether-Alchemist Ronick", "+7,000,000 XP, Wraith, Propitious, Sedimentary, Episode, Futulism, Various Items"),
  worldEvent("Palace Guards", 120, "Revelations in Fall", [{ x: -1625, z: -799 }], "Aelumia Citadel", "Short (9m)", "Medium", 8, "2 Kipchak Swordancers and Emeritus Daimyo", "+8,000,000 XP, Crucible, Regiment, Cannon Coin, Various Items"),
];
