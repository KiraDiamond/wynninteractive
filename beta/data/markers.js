import {
  CATEGORY_META as ROOT_CATEGORY_META,
  CATEGORY_ORDER as ROOT_CATEGORY_ORDER,
  CURATED_MARKERS as ROOT_CURATED_MARKERS,
  STARTER_MARKERS,
} from "../../data/markers.js?v=20260518c";
import { GENERATED_MOB_AREA_MARKERS } from "../../data/generated-mob-area-markers.js?v=20260518c";

export const CATEGORY_META = {
  ...ROOT_CATEGORY_META,
  hostile_mobs: { label: "Mob Areas", color: "#d4644f", selectable: true, icon: null },
};

const eventIndex = ROOT_CATEGORY_ORDER.indexOf("world_events");
export const CATEGORY_ORDER = [
  ...ROOT_CATEGORY_ORDER.slice(0, eventIndex + 1),
  "hostile_mobs",
  ...ROOT_CATEGORY_ORDER.slice(eventIndex + 1),
];

export { STARTER_MARKERS };

export const CURATED_MARKERS = [
  ...ROOT_CURATED_MARKERS,
  ...GENERATED_MOB_AREA_MARKERS,
];
