import test from "node:test";
import assert from "node:assert/strict";

import {
  completionExport,
  completionIdsFromImport,
  createMapTools,
  markerIssueUrl,
  routeShareUrl,
} from "../shared/map-tools.js";

test("map tools render real route and progress markup", () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.window = { location: { search: "", href: "https://example.com/" } };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const root = {
    className: "",
    innerHTML: "",
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const markers = [{
    id: "quest-1",
    title: "A Test Quest",
    category: "quests",
    region: "Wynn",
    position: { world: { x: 10, z: -20 } },
  }];
  const controller = createMapTools({
    root,
    map: { hasLayer: () => false, removeLayer: () => {} },
    leaflet: {},
    getMarkers: () => markers,
    getFoundIds: () => new Set(["quest-1"]),
    setFoundIds: () => {},
    getCurrentArea: () => "wynn",
    markerArea: () => "wynn",
    markerLatLng: () => [0, 0],
    markerSupportsFound: () => true,
    focusMarker: () => {},
  });
  controller.render();
  assert.match(root.innerHTML, /Route planner/);
  assert.doesNotMatch(root.innerHTML, /Field kit|Plan\. Track\. Transfer\./);
  assert.match(root.innerHTML, /Wynn/);
  assert.doesNotMatch(root.innerHTML, /&lt;section/);
  globalThis.window = previousWindow;
  globalThis.localStorage = previousLocalStorage;
});

test("route links replace marker deep links and deduplicate stops", () => {
  const result = new URL(routeShareUrl("https://example.com/beta/?marker=Detlas&theme=dark", ["a", "b", "a"]));
  assert.equal(result.searchParams.get("marker"), null);
  assert.equal(result.searchParams.get("theme"), "dark");
  assert.equal(result.searchParams.get("route"), "a,b");
});

test("marker reports prefill repository issues with useful context", () => {
  const result = new URL(markerIssueUrl({
    id: "marker-1",
    title: "Detlas",
    category: "city",
    region: "Wynn",
    position: { world: { x: 1, z: -2 } },
  }, "https://example.com/?marker=Detlas"));
  assert.equal(result.pathname, "/KiraDiamond/wynninteractive/issues/new");
  assert.match(result.searchParams.get("title"), /Detlas/);
  assert.match(result.searchParams.get("body"), /1, -2/);
});

test("completion exports are stable and imports accept legacy arrays", () => {
  const exported = completionExport(new Set(["b", "a", "a"]));
  assert.deepEqual(exported.foundIds, ["a", "b"]);
  assert.deepEqual(completionIdsFromImport(exported), ["a", "b"]);
  assert.deepEqual(completionIdsFromImport(["legacy", "legacy"]), ["legacy"]);
  assert.throws(() => completionIdsFromImport({ nope: [] }), /foundIds/);
});
