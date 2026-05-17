import { CATEGORY_META, CATEGORY_ORDER, CURATED_MARKERS, STARTER_MARKERS } from "./data/markers.js?v=20260517e";
import { IMPORTED_MARKERS } from "./data/imported-markers.js?v=20260517e";

const MAP_WIDTH = 4608;
const MAP_HEIGHT = 6644;
const MAP_BOUNDS = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
const DEFAULT_BOUNDS = {
  minX: -2540,
  maxX: 2046,
  minZ: -6645,
  maxZ: 12,
};

const STORAGE_KEYS = {
  found: "wynninteractive-found-v1",
  calibrationSamples: "wynninteractive-calibration-samples-v1",
  calibrationTransform: "wynninteractive-calibration-transform-v1",
  cityEdits: "wynninteractive-city-edits-v1",
};
const CONTENT_BOOK_ROOT = "./assets/content-book";
const CITY_ICON_URL = "./assets/icon.png";
const query = new URLSearchParams(window.location.search);
const CALIBRATION_MODE = query.get("calibrate") === "1";
const USE_STORED_CALIBRATION = CALIBRATION_MODE || query.get("useCalibration") === "1";
const EDIT_CITY_QUERY_MODE = query.get("editCities") === "1";
const USE_CITY_EDITS = EDIT_CITY_QUERY_MODE || query.get("useCityEdits") === "1";

function parseNumberParam(name, fallback) {
  const raw = query.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const URL_PROJECTION_CONFIG = {
  offsetX: parseNumberParam("offsetX", 0),
  offsetY: parseNumberParam("offsetY", 0),
  scaleX: parseNumberParam("scaleX", 1),
  scaleY: parseNumberParam("scaleY", 1),
};

const CALIBRATION_TARGETS = STARTER_MARKERS.map((marker) => ({
  id: marker.id,
  title: marker.title,
  x: marker.position.world.x,
  z: marker.position.world.z,
}));
const IMPORT_ICON_META = {
  "Content_Quest.png": { category: "quests" },
  "Content_Miniquest.png": { category: "mini_quests" },
  "Content_UltimateDiscovery.png": { category: "secret_discovery" },
  "Special_LightRealm.png": { category: "world_discovery" },
  "Special_Rune.png": { category: "world_discovery" },
  "Special_RootsOfCorruption.png": { category: "territorial_discovery" },
  "Content_Cave.png": { category: "caves" },
  "Content_Dungeon.png": { category: "dungeon" },
  "Content_CorruptedDungeon.png": { category: "dungeon" },
  "Content_Raid.png": { category: "raid" },
  "Content_BossAltar.png": { category: "boss_altar" },
};
const BLOCKED_IMPORT_IDS = new Set([
  "import-650-mini-quest-slay-angels",
]);
const CATEGORY_GROUPS = [
  {
    id: "quests",
    label: "Quests",
    categories: ["quests", "mini_quests", "world_events"],
  },
  {
    id: "discoveries",
    label: "Discoveries",
    categories: ["secret_discovery", "world_discovery", "territorial_discovery"],
  },
  {
    id: "activities",
    label: "Activities",
    categories: ["caves", "dungeon", "raid", "boss_altar", "lootrun_camp"],
  },
];

const state = {
  markers: [],
  filteredMarkers: [],
  foundIds: loadFoundIds(),
  selectedMarkerId: null,
  search: "",
  hideFound: false,
  showCities: true,
  panelCollapsed: false,
  markerLayers: new Map(),
  categoryFilter: new Set(CATEGORY_ORDER),
  calibrationMode: CALIBRATION_MODE,
  calibrationSamples: loadCalibrationSamples(),
  calibrationIndex: 0,
  calibrationLayers: new Map(),
  activeTransform: USE_STORED_CALIBRATION ? loadCalibrationTransform() : null,
  editCities: EDIT_CITY_QUERY_MODE,
  cityEdits: USE_CITY_EDITS ? loadCityEdits() : {},
  cityTransform: null,
};

const elements = {
  panel: document.querySelector("#marker-panel"),
  panelToggle: document.querySelector("#panel-toggle"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  showCitiesToggle: document.querySelector("#show-cities-toggle"),
  hideFoundToggle: document.querySelector("#hide-found-toggle"),
  editCitiesToggle: document.querySelector("#edit-cities-toggle"),
  categoryFilters: document.querySelector("#category-filters"),
  detailCard: document.querySelector("#detail-card"),
  cityEditorStatus: document.querySelector("#city-editor-status"),
  cityEditorOutput: document.querySelector("#city-editor-output"),
  cityEditorCopy: document.querySelector("#city-editor-copy"),
  cityEditorClear: document.querySelector("#city-editor-clear"),
  showAllCategories: document.querySelector("#show-all-categories"),
  hideAllCategories: document.querySelector("#hide-all-categories"),
  calibrationPanel: document.querySelector("#calibration-panel"),
  calibrationTarget: document.querySelector("#calibration-target"),
  calibrationStatus: document.querySelector("#calibration-status"),
  calibrationOutput: document.querySelector("#calibration-output"),
  calibrationPrev: document.querySelector("#calibration-prev"),
  calibrationNext: document.querySelector("#calibration-next"),
  calibrationCopy: document.querySelector("#calibration-copy"),
  calibrationClear: document.querySelector("#calibration-clear"),
};

const firstOpenCalibrationIndex = CALIBRATION_TARGETS.findIndex((target) => !state.calibrationSamples[target.id]);
if (firstOpenCalibrationIndex >= 0) {
  state.calibrationIndex = firstOpenCalibrationIndex;
}

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomSnap: 0.25,
  zoomControl: true,
  attributionControl: false,
});

L.imageOverlay("./assets/map/WynncraftMapFruma.png", MAP_BOUNDS).addTo(map);
map.fitBounds(MAP_BOUNDS, { padding: [24, 24] });

function updatePinScale() {
  const zoom = map.getZoom();
  const scale = zoom <= 0 ? 1 : 1 + (zoom * 0.16);
  document.documentElement.style.setProperty("--map-pin-scale", String(scale));
}

function loadFoundIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.found);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistFoundIds() {
  localStorage.setItem(STORAGE_KEYS.found, JSON.stringify([...state.foundIds]));
}

function loadCalibrationSamples() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.calibrationSamples) || "{}");
  } catch {
    return {};
  }
}

function persistCalibrationSamples() {
  localStorage.setItem(STORAGE_KEYS.calibrationSamples, JSON.stringify(state.calibrationSamples));
}

function loadCalibrationTransform() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.calibrationTransform) || "null");
  } catch {
    return null;
  }
}

function persistCalibrationTransform() {
  if (state.activeTransform) {
    localStorage.setItem(STORAGE_KEYS.calibrationTransform, JSON.stringify(state.activeTransform));
  } else {
    localStorage.removeItem(STORAGE_KEYS.calibrationTransform);
  }
}

function loadCityEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cityEdits) || "{}");
  } catch {
    return {};
  }
}

function persistCityEdits() {
  localStorage.setItem(STORAGE_KEYS.cityEdits, JSON.stringify(state.cityEdits));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyUrlProjectionConfig(point) {
  const scaledX = (point.x - 0.5) * URL_PROJECTION_CONFIG.scaleX + 0.5;
  const scaledY = (point.y - 0.5) * URL_PROJECTION_CONFIG.scaleY + 0.5;

  return {
    x: clamp(scaledX + URL_PROJECTION_CONFIG.offsetX / MAP_WIDTH, 0, 1),
    y: clamp(scaledY + URL_PROJECTION_CONFIG.offsetY / MAP_HEIGHT, 0, 1),
  };
}

function removeUrlProjectionConfig(point) {
  const shiftedX = point.x - URL_PROJECTION_CONFIG.offsetX / MAP_WIDTH;
  const shiftedY = point.y - URL_PROJECTION_CONFIG.offsetY / MAP_HEIGHT;
  const scaleX = URL_PROJECTION_CONFIG.scaleX || 1;
  const scaleY = URL_PROJECTION_CONFIG.scaleY || 1;

  return {
    x: clamp(((shiftedX - 0.5) / scaleX) + 0.5, 0, 1),
    y: clamp(((shiftedY - 0.5) / scaleY) + 0.5, 0, 1),
  };
}

function defaultWorldToImage(x, z) {
  const normalizedX = clamp((x - DEFAULT_BOUNDS.minX) / (DEFAULT_BOUNDS.maxX - DEFAULT_BOUNDS.minX), 0, 1);
  const normalizedY = clamp((z - DEFAULT_BOUNDS.minZ) / (DEFAULT_BOUNDS.maxZ - DEFAULT_BOUNDS.minZ), 0, 1);
  return applyUrlProjectionConfig({
    x: normalizedX,
    y: 1 - normalizedY,
  });
}

function defaultImageToWorld(x, y) {
  const point = removeUrlProjectionConfig({ x, y });
  return {
    x: Math.round(DEFAULT_BOUNDS.minX + point.x * (DEFAULT_BOUNDS.maxX - DEFAULT_BOUNDS.minX)),
    z: Math.round(DEFAULT_BOUNDS.minZ + (1 - point.y) * (DEFAULT_BOUNDS.maxZ - DEFAULT_BOUNDS.minZ)),
  };
}

function applyTransform(transform, x, z) {
  return {
    x: clamp((transform.a * x + transform.b * z + transform.c) / MAP_WIDTH, 0, 1),
    y: clamp((transform.d * x + transform.e * z + transform.f) / MAP_HEIGHT, 0, 1),
  };
}

function invertTransform(transform, px, py) {
  const det = transform.a * transform.e - transform.b * transform.d;
  if (!det) {
    return null;
  }

  const adjX = px - transform.c;
  const adjY = py - transform.f;
  return {
    x: Math.round((transform.e * adjX - transform.b * adjY) / det),
    z: Math.round((-transform.d * adjX + transform.a * adjY) / det),
  };
}

function worldToImage(x, z) {
  if (USE_CITY_EDITS && state.cityTransform) {
    return applyTransform(state.cityTransform, x, z);
  }
  if (state.activeTransform) {
    return applyTransform(state.activeTransform, x, z);
  }
  return defaultWorldToImage(x, z);
}

function imageToWorld(x, y) {
  if (USE_CITY_EDITS && state.cityTransform) {
    const inverted = invertTransform(state.cityTransform, x * MAP_WIDTH, y * MAP_HEIGHT);
    if (inverted) {
      return inverted;
    }
  }
  if (state.activeTransform) {
    const inverted = invertTransform(state.activeTransform, x * MAP_WIDTH, y * MAP_HEIGHT);
    if (inverted) {
      return inverted;
    }
  }
  return defaultImageToWorld(x, y);
}

function markerPoint(marker) {
  if (marker.fixed && state.cityEdits[marker.id]) {
    return {
      x: clamp(state.cityEdits[marker.id].x / MAP_WIDTH, 0, 1),
      y: clamp(state.cityEdits[marker.id].y / MAP_HEIGHT, 0, 1),
    };
  }
  if (marker.position?.world) {
    return worldToImage(marker.position.world.x, marker.position.world.z);
  }
  return marker.position;
}

function markerLatLng(marker) {
  const point = markerPoint(marker);
  return [point.y * MAP_HEIGHT, point.x * MAP_WIDTH];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function categoryAssetUrl(categoryId, variant = "active") {
  const icon = CATEGORY_META[categoryId]?.icon;
  if (!icon) {
    return null;
  }
  return `${CONTENT_BOOK_ROOT}/${icon}_${variant}.png`;
}

function buildCityLabelHtml(marker, isFound, isSelected) {
  const classes = ["city-map-label"];
  if (state.editCities) {
    classes.push("editable");
  }
  if (isFound) {
    classes.push("found");
  }
  if (isSelected) {
    classes.push("selected");
  }

  return `<span class="${classes.join(" ")}">${escapeHtml(marker.title)}</span>`;
}

function bindCityTooltip(layer, marker, isFound, isSelected) {
  const html = buildCityLabelHtml(marker, isFound, isSelected);
  const tooltipOptions = {
    permanent: true,
    direction: "top",
    offset: [0, -8],
    className: "city-tooltip-shell",
    interactive: true,
    opacity: 1,
  };

  if (layer.getTooltip()) {
    layer.setTooltipContent(html);
  } else {
    layer.bindTooltip(html, tooltipOptions);
  }

  window.requestAnimationFrame(() => wireCityTooltip(layer, marker.id));
}

function wireCityTooltip(layer, markerId) {
  const element = layer.getTooltip()?.getElement();
  if (!element) {
    return;
  }

  element.dataset.markerId = markerId;
  if (element.dataset.clickBound === "1") {
    return;
  }

  element.dataset.clickBound = "1";
  element.addEventListener("click", (event) => {
    const id = event.currentTarget?.dataset?.markerId;
    if (!id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedMarker(id);
  });
}

function activeCalibrationTarget() {
  return CALIBRATION_TARGETS[state.calibrationIndex] || CALIBRATION_TARGETS[0];
}

function solve3x3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(rows[maxRow][pivot]) < 1e-8) {
      return null;
    }

    if (maxRow !== pivot) {
      [rows[pivot], rows[maxRow]] = [rows[maxRow], rows[pivot]];
    }

    const divisor = rows[pivot][pivot];
    for (let column = pivot; column < 4; column += 1) {
      rows[pivot][column] /= divisor;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = rows[row][pivot];
      for (let column = pivot; column < 4; column += 1) {
        rows[row][column] -= factor * rows[pivot][column];
      }
    }
  }

  return rows.map((row) => row[3]);
}

function solveAffineTransform(samples) {
  if (samples.length < 3) {
    return null;
  }

  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const xVector = [0, 0, 0];
  const yVector = [0, 0, 0];

  for (const sample of samples) {
    const terms = [sample.x, sample.z, 1];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        matrix[row][column] += terms[row] * terms[column];
      }
      xVector[row] += terms[row] * sample.pixelX;
      yVector[row] += terms[row] * sample.pixelY;
    }
  }

  const xSolution = solve3x3(matrix, xVector);
  const ySolution = solve3x3(matrix, yVector);
  if (!xSolution || !ySolution) {
    return null;
  }

  const transform = {
    a: xSolution[0],
    b: xSolution[1],
    c: xSolution[2],
    d: ySolution[0],
    e: ySolution[1],
    f: ySolution[2],
  };

  const error = samples.reduce((sum, sample) => {
    const point = applyTransform(transform, sample.x, sample.z);
    const dx = point.x * MAP_WIDTH - sample.pixelX;
    const dy = point.y * MAP_HEIGHT - sample.pixelY;
    return sum + Math.hypot(dx, dy);
  }, 0) / samples.length;

  return { ...transform, sampleCount: samples.length, averagePixelError: Number(error.toFixed(2)) };
}

function computeCalibrationTransform() {
  const samples = CALIBRATION_TARGETS
    .map((target) => {
      const sample = state.calibrationSamples[target.id];
      return sample ? { ...target, ...sample } : null;
    })
    .filter(Boolean);

  return solveAffineTransform(samples);
}

function computeCityEditTransform() {
  const samples = state.markers
    .filter((marker) => marker.fixed && state.cityEdits[marker.id] && marker.position?.world)
    .map((marker) => ({
      x: marker.position.world.x,
      z: marker.position.world.z,
      pixelX: state.cityEdits[marker.id].x,
      pixelY: state.cityEdits[marker.id].y,
    }));

  return solveAffineTransform(samples);
}

function importedCategory(marker) {
  return IMPORT_ICON_META[marker.sourceIcon]?.category ?? null;
}

function normalizedImportedTitle(marker, category) {
  const title = marker.title?.trim() || CATEGORY_META[category]?.label || "Marker";

  if (category === "boss_altar" && title === "Boss Altar") {
    return "Boss Altar";
  }
  if (category === "caves" && title === "Cave") {
    return "Cave";
  }

  return title;
}

function normalizedImportedDescription(marker, category, title) {
  const categoryLabel = CATEGORY_META[category]?.label || "Marker";

  if (title === categoryLabel) {
    return `${categoryLabel} imported from the Wynncraft category dataset.`;
  }

  return `${title} imported from the Wynncraft category dataset.`;
}

function normalizeImportedMarkers() {
  return IMPORTED_MARKERS
    .map((marker) => {
      if (BLOCKED_IMPORT_IDS.has(marker.id)) {
        return null;
      }

      const category = importedCategory(marker);
      if (!category) {
        return null;
      }

      const title = normalizedImportedTitle(marker, category);
      return {
        ...marker,
        title,
        category,
        description: normalizedImportedDescription(marker, category, title),
        tags: [...new Set([...(marker.tags || []), category, "curated-import"])],
      };
    })
    .filter(Boolean);
}

function markerMatchesSearch(marker) {
  if (!state.search) {
    return true;
  }

  const haystack = [
    marker.title,
    marker.region,
    marker.description,
    ...(marker.tags || []),
  ].join(" ").toLowerCase();

  return haystack.includes(state.search);
}

function markerIsVisible(marker) {
  if (marker.fixed) {
    if (!state.showCities) {
      return false;
    }
    if (state.hideFound && state.foundIds.has(marker.id)) {
      return false;
    }
    return markerMatchesSearch(marker);
  }

  if (!state.categoryFilter.has(marker.category)) {
    return false;
  }
  if (state.hideFound && state.foundIds.has(marker.id)) {
    return false;
  }
  return markerMatchesSearch(marker);
}

function buildMarkerIcon(marker, isFound, isSelected) {
  const meta = CATEGORY_META[marker.category];
  if (marker.fixed) {
    return L.divIcon({
      className: "city-anchor-icon",
      html: "",
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });
  }

  const variant = isFound ? "locked" : "active";
  const iconUrl = categoryAssetUrl(marker.category, variant);
  const classes = ["asset-pin"];
  if (isFound) {
    classes.push("found");
  }
  if (isSelected) {
    classes.push("selected");
  }

  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="asset-pin-shell"><img class="${classes.join(" ")}" src="${iconUrl}" alt="" draggable="false" style="--pin-glow:${meta.color};"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createMarkerLayer(marker) {
  const layer = L.marker(markerLatLng(marker), {
    icon: buildMarkerIcon(marker, state.foundIds.has(marker.id), false),
    title: marker.title,
    draggable: marker.fixed,
    autoPan: marker.fixed,
  });

  layer.on("click", () => setSelectedMarker(marker.id));
  if (marker.fixed) {
    bindCityTooltip(layer, marker, state.foundIds.has(marker.id), false);
    layer.on("add", () => {
      window.requestAnimationFrame(() => wireCityTooltip(layer, marker.id));
    });
    layer.on("tooltipopen", () => {
      wireCityTooltip(layer, marker.id);
    });
    layer.on("dragstart", () => {
      if (state.editCities) {
        setSelectedMarker(marker.id);
      }
    });
    layer.on("dragend", (event) => {
      if (!state.editCities) {
        updateMarkerLayerPositions();
        return;
      }

      const latlng = event.target.getLatLng();
      state.cityEdits[marker.id] = {
        x: clamp(Math.round(latlng.lng), 0, MAP_WIDTH),
        y: clamp(Math.round(latlng.lat), 0, MAP_HEIGHT),
      };
      persistCityEdits();
      refreshCityTransform();
    });
    if (!state.editCities && layer.dragging) {
      layer.dragging.disable();
    }
  }
  state.markerLayers.set(marker.id, layer);
}

function calibrationLatLng(sample) {
  return [sample.pixelY, sample.pixelX];
}

function refreshCityTransform() {
  state.cityTransform = computeCityEditTransform();
  updateMarkerLayerPositions();
  syncVisibleMarkers();
  renderCityEditor();
  renderDetailCard();
}

function renderCalibrationMarkers() {
  for (const layer of state.calibrationLayers.values()) {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }
  state.calibrationLayers.clear();

  if (!state.calibrationMode) {
    return;
  }

  const current = activeCalibrationTarget();
  for (const target of CALIBRATION_TARGETS) {
    const sample = state.calibrationSamples[target.id];
    if (!sample) {
      continue;
    }

    const layer = L.marker(calibrationLatLng(sample), {
      icon: L.divIcon({
        className: "map-pin-wrapper",
        html: `<div class="calibration-anchor${target.id === current.id ? " active" : ""}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: `${target.title} calibration`,
    });

    layer.addTo(map);
    state.calibrationLayers.set(target.id, layer);
  }
}

function updateMarkerLayerPositions() {
  for (const [id, layer] of state.markerLayers) {
    const marker = state.markers.find((item) => item.id === id);
    if (!marker) {
      continue;
    }
    layer.setLatLng(markerLatLng(marker));
  }
}

function categoryCount(categoryId) {
  return state.markers.filter((marker) => marker.category === categoryId && !marker.fixed).length;
}

function categoryVisibleCount(categoryId) {
  return state.filteredMarkers.filter((marker) => marker.category === categoryId && !marker.fixed).length;
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = CATEGORY_GROUPS.map((group) => {
    const cards = group.categories.map((categoryId) => {
      const meta = CATEGORY_META[categoryId];
      const active = state.categoryFilter.has(categoryId);
      const total = categoryCount(categoryId);
      const visible = categoryVisibleCount(categoryId);
      const iconUrl = categoryAssetUrl(categoryId, active ? "active" : "locked");
      return `
        <button type="button" class="category-card ${active ? "active" : "inactive"}" data-category="${categoryId}">
          <span class="category-icon asset-icon" style="--category-icon:url('${iconUrl}');--category-accent:${meta.color};"></span>
          <span class="category-copy">
            <strong>${escapeHtml(meta.label)}</strong>
            <span class="category-meta">${active ? `${visible} shown` : "Hidden"}</span>
          </span>
          <span class="category-count">${total}</span>
        </button>
      `;
    }).join("");

    return `
      <section class="category-section">
        <div class="section-head">
          <span>${escapeHtml(group.label)}</span>
          <div class="head-actions">
            <button type="button" class="text-action" data-group-action="select" data-group="${group.id}">Select All</button>
            <button type="button" class="text-action" data-group-action="clear" data-group="${group.id}">Clear</button>
          </div>
        </div>
        <div class="category-grid">${cards}</div>
      </section>
    `;
  }).join("");

  elements.categoryFilters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.category;
      if (state.categoryFilter.has(id)) {
        state.categoryFilter.delete(id);
      } else {
        state.categoryFilter.add(id);
      }
      syncVisibleMarkers();
      renderCategoryFilters();
    });
  });

  elements.categoryFilters.querySelectorAll("[data-group-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = CATEGORY_GROUPS.find((entry) => entry.id === button.dataset.group);
      if (!group) {
        return;
      }
      const select = button.dataset.groupAction === "select";
      group.categories.forEach((categoryId) => {
        if (select) {
          state.categoryFilter.add(categoryId);
        } else {
          state.categoryFilter.delete(categoryId);
        }
      });
      syncVisibleMarkers();
      renderCategoryFilters();
    });
  });
}

function renderDetailCard() {
  const marker = state.markers.find((item) => item.id === state.selectedMarkerId);
  if (!marker) {
    elements.detailCard.className = "detail-card empty";
    elements.detailCard.innerHTML = `
      <h2>No marker selected</h2>
      <p>Click a map marker to inspect it.</p>
    `;
    return;
  }

  const point = markerPoint(marker);
  const world = marker.position?.world || imageToWorld(point.x, point.y);
  const isFound = state.foundIds.has(marker.id);
  const meta = CATEGORY_META[marker.category];
  const iconUrl = marker.fixed ? CITY_ICON_URL : categoryAssetUrl(marker.category, isFound ? "locked" : "active");

  elements.detailCard.className = "detail-card";
  elements.detailCard.innerHTML = `
    <div class="detail-topline">
      <span class="detail-icon${marker.fixed ? " city" : ""}" style="${marker.fixed ? `--detail-icon:url('${iconUrl}');` : `--detail-icon:url('${iconUrl}');--detail-accent:${meta.color};`}"></span>
      <div>
        <h2>${escapeHtml(marker.title)}</h2>
        <p class="detail-kind">${escapeHtml(meta.label)}</p>
      </div>
    </div>
    <p class="detail-meta">${escapeHtml(marker.region || "World")} | ${world.x}, ${world.z}</p>
    <p>${escapeHtml(marker.description || "No description available.")}</p>
    <div class="detail-actions">
      <button type="button" class="detail-button" data-action="toggle-found">${isFound ? "Mark not found" : "Mark found"}</button>
      <button type="button" class="detail-button secondary" data-action="focus">Focus</button>
    </div>
  `;

  elements.detailCard.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "toggle-found") {
        toggleFound(marker.id);
      } else if (action === "focus") {
        flyToMarker(marker);
      }
    });
  });
}

function cityEditExport() {
  return state.markers
    .filter((marker) => marker.fixed)
    .map((marker) => {
      const point = markerPoint(marker);
      return {
        id: marker.id,
        title: marker.title,
        region: marker.region,
        world: marker.position.world,
        pixel: {
          x: Math.round(point.x * MAP_WIDTH),
          y: Math.round(point.y * MAP_HEIGHT),
        },
        saved: Boolean(state.cityEdits[marker.id]),
      };
    });
}

function renderCityEditor() {
  if (!elements.cityEditorStatus || !elements.cityEditorOutput) {
    return;
  }

  if (!EDIT_CITY_QUERY_MODE) {
    const panel = elements.cityEditorStatus.closest(".city-editor-panel");
    if (panel) {
      panel.classList.add("hidden");
    }
    const toggleRow = elements.editCitiesToggle?.closest(".toggle-row");
    if (toggleRow) {
      toggleRow.classList.add("hidden");
    }
    return;
  }

  const editedCount = Object.keys(state.cityEdits).length;
  const transformStatus = state.cityTransform
    ? ` City-fit active from ${state.cityTransform.sampleCount} cities. Average error: ${state.cityTransform.averagePixelError}px.`
    : (editedCount >= 3 ? " City-fit could not be solved from the current edits." : " Move at least 3 cities to solve the full map transform.");
  elements.cityEditorStatus.textContent = state.editCities
    ? `Edit mode is on. Drag city labels on the map. ${editedCount} city edits saved locally.${transformStatus}`
    : `Edit mode is off. ${editedCount} city edits saved locally. Enable edit mode to drag city labels.${transformStatus}`;
  elements.cityEditorOutput.textContent = JSON.stringify(cityEditExport(), null, 2);
}

function renderCalibrationPanel() {
  if (!elements.calibrationPanel) {
    return;
  }

  if (!state.calibrationMode) {
    elements.calibrationPanel.classList.add("hidden");
    return;
  }

  elements.calibrationPanel.classList.remove("hidden");

  const current = activeCalibrationTarget();
  const sample = state.calibrationSamples[current.id];
  const solved = state.activeTransform;
  const sampleCount = Object.keys(state.calibrationSamples).length;

  elements.calibrationTarget.innerHTML = `
    <strong>${escapeHtml(current.title)}</strong>
    <span>World: ${current.x}, ${current.z}</span><br>
    <span>${sample ? `Pixel: ${sample.pixelX}, ${sample.pixelY}` : "Click this landmark on the map to record it."}</span>
  `;

  elements.calibrationStatus.textContent = solved
    ? `${sampleCount} points captured. Average error: ${solved.averagePixelError ?? "?"} px.`
    : `${sampleCount} points captured. Need at least 3 to solve the transform.`;

  elements.calibrationOutput.textContent = JSON.stringify({
    target: current.id,
    samples: state.calibrationSamples,
    transform: solved,
  }, null, 2);
}

function setPanelCollapsed(collapsed) {
  state.panelCollapsed = collapsed;
  elements.panel.classList.toggle("collapsed", collapsed);
}

function setSelectedMarker(markerId) {
  state.selectedMarkerId = markerId;

  for (const [id, layer] of state.markerLayers) {
    const marker = state.markers.find((item) => item.id === id);
    const isFound = state.foundIds.has(id);
    const isSelected = id === markerId;
    layer.setIcon(buildMarkerIcon(marker, isFound, isSelected));
    if (marker.fixed) {
      bindCityTooltip(layer, marker, isFound, isSelected);
    }
  }

  setPanelCollapsed(false);
  renderDetailCard();
}

function flyToMarker(marker) {
  map.flyTo(markerLatLng(marker), Math.max(map.getZoom(), 0), { duration: 0.55 });
  setSelectedMarker(marker.id);
}

function toggleFound(markerId) {
  if (state.foundIds.has(markerId)) {
    state.foundIds.delete(markerId);
  } else {
    state.foundIds.add(markerId);
  }

  persistFoundIds();
  syncVisibleMarkers();
  renderCategoryFilters();
  renderDetailCard();
}

function syncVisibleMarkers() {
  state.filteredMarkers = state.markers.filter(markerIsVisible);

  for (const marker of state.markers) {
    const layer = state.markerLayers.get(marker.id);
    if (!layer) {
      continue;
    }
    const visible = state.filteredMarkers.some((item) => item.id === marker.id);
    if (visible && !map.hasLayer(layer)) {
      layer.addTo(map);
    }
    if (!visible && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    if (marker.fixed && layer.dragging) {
      if (state.editCities) {
        layer.dragging.enable();
      } else {
        layer.dragging.disable();
      }
    }
    const isFound = state.foundIds.has(marker.id);
    const isSelected = marker.id === state.selectedMarkerId;
    layer.setIcon(buildMarkerIcon(marker, isFound, isSelected));
    if (marker.fixed) {
      bindCityTooltip(layer, marker, isFound, isSelected);
    }
  }
}

function hydrateMarkerState() {
  const fixedCities = STARTER_MARKERS.map((marker) => ({ ...marker, fixed: true }));
  const imported = normalizeImportedMarkers();
  state.markers = [...fixedCities, ...CURATED_MARKERS, ...imported];
  state.markers.forEach(createMarkerLayer);
}

function refreshTransformFromSamples() {
  state.activeTransform = computeCalibrationTransform();
  persistCalibrationTransform();
  updateMarkerLayerPositions();
  syncVisibleMarkers();
  renderCalibrationMarkers();
  renderCalibrationPanel();
}

function recordCalibrationSample(latlng) {
  if (!state.calibrationMode) {
    return;
  }

  const current = activeCalibrationTarget();
  state.calibrationSamples[current.id] = {
    pixelX: Math.round(latlng.lng),
    pixelY: Math.round(latlng.lat),
  };

  persistCalibrationSamples();
  refreshTransformFromSamples();
}

function bindEvents() {
  elements.panelToggle.addEventListener("click", () => {
    setPanelCollapsed(!state.panelCollapsed);
  });

  map.on("click", (event) => {
    if (state.calibrationMode) {
      recordCalibrationSample(event.latlng);
    }
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    syncVisibleMarkers();
    renderCategoryFilters();
  });

  elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.search = "";
    syncVisibleMarkers();
    renderCategoryFilters();
  });

  elements.hideFoundToggle.addEventListener("change", (event) => {
    state.hideFound = event.target.checked;
    syncVisibleMarkers();
    renderCategoryFilters();
    renderDetailCard();
  });

  if (elements.editCitiesToggle) {
    elements.editCitiesToggle.addEventListener("change", (event) => {
      state.editCities = event.target.checked;
      syncVisibleMarkers();
      renderCityEditor();
    });
  }

  if (elements.showCitiesToggle) {
    elements.showCitiesToggle.addEventListener("change", (event) => {
      state.showCities = event.target.checked;
      syncVisibleMarkers();
      renderDetailCard();
    });
  }

  if (elements.showAllCategories) {
    elements.showAllCategories.addEventListener("click", () => {
      state.categoryFilter = new Set(CATEGORY_ORDER);
      syncVisibleMarkers();
      renderCategoryFilters();
    });
  }

  if (elements.hideAllCategories) {
    elements.hideAllCategories.addEventListener("click", () => {
      state.categoryFilter = new Set();
      syncVisibleMarkers();
      renderCategoryFilters();
    });
  }

  if (elements.calibrationPrev) {
    elements.calibrationPrev.addEventListener("click", () => {
      state.calibrationIndex = (state.calibrationIndex - 1 + CALIBRATION_TARGETS.length) % CALIBRATION_TARGETS.length;
      renderCalibrationMarkers();
      renderCalibrationPanel();
    });
  }

  if (elements.calibrationNext) {
    elements.calibrationNext.addEventListener("click", () => {
      state.calibrationIndex = (state.calibrationIndex + 1) % CALIBRATION_TARGETS.length;
      renderCalibrationMarkers();
      renderCalibrationPanel();
    });
  }

  if (elements.calibrationCopy) {
    elements.calibrationCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(elements.calibrationOutput.textContent);
      } catch {
        // Ignore clipboard failures in unsupported contexts.
      }
    });
  }

  if (elements.calibrationClear) {
    elements.calibrationClear.addEventListener("click", () => {
      state.calibrationSamples = {};
      state.activeTransform = null;
      persistCalibrationSamples();
      persistCalibrationTransform();
      updateMarkerLayerPositions();
      syncVisibleMarkers();
      renderCalibrationMarkers();
      renderCalibrationPanel();
    });
  }

  if (elements.cityEditorCopy) {
    elements.cityEditorCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(elements.cityEditorOutput.textContent);
        elements.cityEditorStatus.textContent = "Copied city edit JSON.";
      } catch {
        elements.cityEditorStatus.textContent = "Clipboard copy failed.";
      }
    });
  }

  if (elements.cityEditorClear) {
    elements.cityEditorClear.addEventListener("click", () => {
      state.cityEdits = {};
      persistCityEdits();
      refreshCityTransform();
    });
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setPanelCollapsed(false);
    }
  });

  map.on("zoom zoomend", updatePinScale);
}

hydrateMarkerState();
state.cityTransform = USE_CITY_EDITS ? computeCityEditTransform() : null;
bindEvents();
updatePinScale();
renderCalibrationMarkers();
syncVisibleMarkers();
renderCategoryFilters();
renderDetailCard();
renderCityEditor();
renderCalibrationPanel();
