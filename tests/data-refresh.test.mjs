import test from "node:test";
import assert from "node:assert/strict";

import { GENERATED_MARKER_SUPPLEMENTS } from "../data/generated-marker-supplements.js";
import { GENERATED_MARKER_POSITION_OVERRIDES } from "../data/generated-marker-position-overrides.js";
import { GENERATED_MOB_CATEGORY_COUNTS } from "../data/generated-mob-counts.js";
import { GENERATED_MOB_MARKERS } from "../data/generated-mob-markers.js";
import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js";

test("generated supplements are valid, unique, and include the known missing mini-quest", () => {
  const ids = new Set();
  for (const marker of GENERATED_MARKER_SUPPLEMENTS) {
    assert.ok(marker.id);
    assert.ok(!ids.has(marker.id), `duplicate supplement id: ${marker.id}`);
    ids.add(marker.id);
    assert.ok(["caves", "mini_quests"].includes(marker.category));
    assert.ok(Number.isFinite(marker.position?.world?.x));
    assert.ok(Number.isFinite(marker.position?.world?.z));
    assert.ok(marker.sourceUrl);
  }
  assert.ok(GENERATED_MARKER_SUPPLEMENTS.some((marker) => marker.title === "Slay Angels"));
});

test("generated position overrides only target known cave or discovery markers", () => {
  const eligibleIds = new Set(
    WIKI_MAP_MARKERS
      .filter((marker) => ["caves", "secret_discovery", "world_discovery"].includes(marker.category))
      .map((marker) => marker.id),
  );
  for (const [markerId, position] of Object.entries(GENERATED_MARKER_POSITION_OVERRIDES)) {
    assert.ok(eligibleIds.has(markerId), markerId);
    assert.ok(Number.isFinite(position?.world?.x));
    assert.ok(Number.isFinite(position?.world?.z));
  }
});

test("generated mob category counts match the generated marker dataset", () => {
  const actual = Object.groupBy(GENERATED_MOB_MARKERS, (marker) => marker.category);
  for (const [category, expectedCount] of Object.entries(GENERATED_MOB_CATEGORY_COUNTS)) {
    assert.equal(actual[category]?.length || 0, expectedCount, category);
  }
  assert.equal(
    Object.values(GENERATED_MOB_CATEGORY_COUNTS).reduce((sum, count) => sum + count, 0),
    GENERATED_MOB_MARKERS.length,
  );
});
