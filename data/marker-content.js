import { GENERATED_QUEST_MARKER_CONTENT } from "./generated-quest-marker-content.js?v=20260517s";
import { GENERATED_SUPPLEMENTAL_MARKER_CONTENT } from "./generated-supplemental-marker-content.js?v=20260517s";

const MANUAL_MARKER_CONTENT = {};

export const MARKER_CONTENT = {
  ...GENERATED_QUEST_MARKER_CONTENT,
  ...GENERATED_SUPPLEMENTAL_MARKER_CONTENT,
  ...MANUAL_MARKER_CONTENT,
};
