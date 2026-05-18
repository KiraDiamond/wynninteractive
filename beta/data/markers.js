import {
  CATEGORY_META as ROOT_CATEGORY_META,
  CATEGORY_ORDER as ROOT_CATEGORY_ORDER,
  CURATED_MARKERS as ROOT_CURATED_MARKERS,
  STARTER_MARKERS,
} from "../../data/markers.js?v=20260518h";
import { GENERATED_MOB_MARKERS } from "../../data/generated-mob-markers.js?v=20260518h";

const MOB_CATEGORY_META = {
  hostile_mobs_zombie: { label: "Zombies", color: "#c7644f", selectable: true, icon: null },
  hostile_mobs_spider: { label: "Spiders", color: "#8d6549", selectable: true, icon: null },
  hostile_mobs_skeleton: { label: "Skeletons", color: "#8a939d", selectable: true, icon: null },
  hostile_mobs_humanoid: { label: "Humanoids", color: "#9e6a55", selectable: true, icon: null },
  hostile_mobs_beast: { label: "Beasts", color: "#7f8f51", selectable: true, icon: null },
  hostile_mobs_elemental: { label: "Elementals", color: "#5d8bb8", selectable: true, icon: null },
  hostile_mobs_construct: { label: "Constructs", color: "#6c7787", selectable: true, icon: null },
  hostile_mobs_aquatic: { label: "Aquatic", color: "#4e98a8", selectable: true, icon: null },
  hostile_mobs_other: { label: "Other Mobs", color: "#b36f5c", selectable: true, icon: null },
};

const MOB_CATEGORY_ORDER = [
  "hostile_mobs_zombie",
  "hostile_mobs_spider",
  "hostile_mobs_skeleton",
  "hostile_mobs_humanoid",
  "hostile_mobs_beast",
  "hostile_mobs_elemental",
  "hostile_mobs_construct",
  "hostile_mobs_aquatic",
  "hostile_mobs_other",
];

export const CATEGORY_META = {
  ...ROOT_CATEGORY_META,
  ...MOB_CATEGORY_META,
};

const eventIndex = ROOT_CATEGORY_ORDER.indexOf("world_events");
export const CATEGORY_ORDER = [
  ...ROOT_CATEGORY_ORDER.slice(0, eventIndex + 1),
  ...MOB_CATEGORY_ORDER,
  ...ROOT_CATEGORY_ORDER.slice(eventIndex + 1),
];

export { STARTER_MARKERS };

export const CURATED_MARKERS = [
  ...ROOT_CURATED_MARKERS,
  ...GENERATED_MOB_MARKERS,
];
