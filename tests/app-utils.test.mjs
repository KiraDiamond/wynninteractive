import test from "node:test";
import assert from "node:assert/strict";

import {
  availableMarkerId,
  cleanImportedMarkerText,
  conciseImportedRegion,
  escapeHtml,
  html,
  normalizeMarkerLookup,
} from "../shared/app-utils.js";

test("marker ID collisions receive stable numeric suffixes", () => {
  const ids = new Set(["marker", "marker-2"]);
  assert.equal(availableMarkerId("new-marker", ids), "new-marker");
  assert.equal(availableMarkerId("marker", ids), "marker-3");
});

test("html escapes interpolated values and permits explicitly trusted markup", () => {
  assert.equal(html`<p>${"<script>"}</p>`, "<p>&lt;script&gt;</p>");
  assert.equal(html`<p>${html.raw("<strong>Safe</strong>")}</p>`, "<p><strong>Safe</strong></p>");
  assert.equal(escapeHtml(`Tom & "Qira"`), "Tom &amp; &quot;Qira&quot;");
});

test("marker lookup normalization folds punctuation and accents", () => {
  assert.equal(normalizeMarkerLookup("  Qira's Hivé! "), "qira s hive");
});

test("unresolved wiki reward fields are not shown to users", () => {
  assert.equal(
    cleanImportedMarkerText("Requirements: Combat level 99. Rewards: {{{reward}}}."),
    "Requirements: Combat level 99.",
  );
});

test("scraped article prose is removed from long region labels", () => {
  assert.equal(
    conciseImportedRegion(
      "Sky Islands. It is one of the caves that must be completed in order to unlock the Sky Islands Exploration Lootrun",
    ),
    "Sky Islands",
  );
  assert.equal(conciseImportedRegion("Canyon of the Lost near Thesead"), "Canyon of the Lost near Thesead");
  assert.equal(conciseImportedRegion("Olux Swamp. It is involved in a quest"), "Olux Swamp");
});
