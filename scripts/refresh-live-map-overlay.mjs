import fs from "node:fs/promises";

const ENDPOINTS = {
  worldEvents: "https://api.wynncraft.com/v3/map/world-events",
  camps: "https://api.wynncraft.com/v3/map/camps",
  raids: "https://api.wynncraft.com/v3/map/raids",
  lootPools: "https://api.wynncraft.com/v3/map/loot-pools",
};

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\^s/g, "'s")
    .replace(/֎/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function requirementList(requirements) {
  return Array.isArray(requirements)
    ? requirements
        .map((entry) => ({
          type: cleanValue(entry?.type),
          value: cleanValue(entry?.value),
        }))
        .filter((entry) => entry.type && entry.value)
    : [];
}

function rewardList(rewards) {
  return Array.isArray(rewards)
    ? rewards
        .map((entry) => ({
          name: cleanValue(entry?.name),
          type: cleanValue(entry?.type),
          amount: Number(entry?.amount || 0),
          always: Boolean(entry?.always),
          tier: cleanValue(entry?.tier),
          shiny: Boolean(entry?.shiny),
        }))
        .filter((entry) => entry.name)
    : [];
}

function firstRequirementValue(requirements, types) {
  const match = requirements.find((entry) => types.includes(entry.type));
  return match ? match.value : "";
}

function worldEventPoints(locations) {
  return Array.isArray(locations)
    ? locations
        .map((location) => ({
          x: Number(location?.event?.x ?? location?.spawn?.x ?? location?.reward?.x),
          y: Number(location?.event?.y ?? location?.spawn?.y ?? location?.reward?.y),
          z: Number(location?.event?.z ?? location?.spawn?.z ?? location?.reward?.z),
          radius: Number(location?.radius || 0),
          spawnRadius: Number(location?.spawnRadius || 0),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    : [];
}

function worldEventRewardPerLevel(rewardPerLevel) {
  const next = {};
  if (!rewardPerLevel || typeof rewardPerLevel !== "object") {
    return next;
  }
  Object.entries(rewardPerLevel).forEach(([key, value]) => {
    next[key] = Array.isArray(value) ? value.map((entry) => cleanValue(entry)).filter(Boolean) : [];
  });
  return next;
}

function campOrRaidEntry(entry) {
  const requirements = requirementList(entry?.requirements);
  const levelRequirement = Number(firstRequirementValue(requirements, ["COMBAT_LEVEL"]) || 0);
  return {
    title: cleanValue(entry?.name),
    internalName: cleanValue(entry?.internalName),
    type: cleanValue(entry?.type),
    lore: cleanValue(entry?.lore),
    level: Number(entry?.level || levelRequirement || 0),
    difficulty: titleCase(entry?.difficulty),
    length: titleCase(entry?.length),
    requirements,
    rewards: rewardList(entry?.rewards),
    location:
      Number.isFinite(Number(entry?.location?.x)) && Number.isFinite(Number(entry?.location?.z))
        ? {
            x: Number(entry.location.x),
            y: Number(entry.location.y || 0),
            z: Number(entry.location.z),
          }
        : null,
  };
}

function worldEventEntry(entry) {
  const requirements = requirementList(entry?.requirements);
  return {
    title: cleanValue(entry?.name),
    internalName: cleanValue(entry?.internalName),
    lore: cleanValue(entry?.lore),
    level: Number(entry?.level || 0),
    difficulty: titleCase(entry?.difficulty),
    length: titleCase(entry?.length),
    requiredQuest: firstRequirementValue(requirements, ["QUEST", "GLOBAL_QUEST"]),
    rewardPerLevel: worldEventRewardPerLevel(entry?.rewardPerLevel),
    points: worldEventPoints(entry?.location),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  const [worldEvents, camps, raids, lootPools] = await Promise.all([
    fetchJson(ENDPOINTS.worldEvents),
    fetchJson(ENDPOINTS.camps),
    fetchJson(ENDPOINTS.raids),
    fetchJson(ENDPOINTS.lootPools),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    worldEvents: Array.isArray(worldEvents) ? worldEvents.map(worldEventEntry) : [],
    camps: Array.isArray(camps) ? camps.map(campOrRaidEntry) : [],
    raids: Array.isArray(raids) ? raids.map(campOrRaidEntry) : [],
    lootPools: Array.isArray(lootPools) ? lootPools.map(campOrRaidEntry) : [],
  };

  const targetPath = new URL("../data/live-map-overlay.beta.json", import.meta.url);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote beta live map overlay snapshot with ${payload.worldEvents.length} world events, ${payload.camps.length} camps, ${payload.raids.length} raids, and ${payload.lootPools.length} loot pools.\n`,
  );
}

await main();
