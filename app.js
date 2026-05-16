import { CATEGORY_META, CATEGORY_ORDER, STARTER_MARKERS } from "./data/markers.js";
import { IMPORTED_MARKERS } from "./data/imported-markers.js";

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
};
const CONTENT_BOOK_ROOT = "./assets/content-book";
const CITY_ICON_URL = "./assets/icon.png";
const query = new URLSearchParams(window.location.search);
const CALIBRATION_MODE = query.get("calibrate") === "1";
const USE_STORED_CALIBRATION = CALIBRATION_MODE || query.get("useCalibration") === "1";
const CALIBRATION_TARGETS = STARTER_MARKERS.map((marker) => ({
  id: marker.id,
  title: marker.title,
  x: marker.position.world.x,
  z: marker.position.world.z,
}));
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
};

const elements = {
  panel: document.querySelector("#marker-panel"),
  panelToggle: document.querySelector("#panel-toggle"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  showCitiesToggle: document.querySelector("#show-cities-toggle"),
  hideFoundToggle: document.querySelector("#hide-found-toggle"),
  categoryFilters: document.querySelector("#category-filters"),
  detailCard: document.querySelector("#detail-card"),
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function defaultWorldToImage(x, z) {
  return {
    x: clamp((x - DEFAULT_BOUNDS.minX) / (DEFAULT_BOUNDS.maxX - DEFAULT_BOUNDS.minX), 0, 1),
    y: clamp((DEFAULT_BOUNDS.maxZ - z) / (DEFAULT_BOUNDS.maxZ - DEFAULT_BOUNDS.minZ), 0, 1),
  };
}

function defaultImageToWorld(x, y) {
  return {
    x: Math.round(DEFAULT_BOUNDS.minX + x * (DEFAULT_BOUNDS.maxX - DEFAULT_BOUNDS.minX)),
    z: Math.round(DEFAULT_BOUNDS.maxZ - y * (DEFAULT_BOUNDS.maxZ - DEFAULT_BOUNDS.minZ)),
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
  if (state.activeTransform) {
    return applyTransform(state.activeTransform, x, z);
  }
  return defaultWorldToImage(x, z);
}

function imageToWorld(x, y) {
  if (state.activeTransform) {
    const inverted = invertTransform(state.activeTransform, x * MAP_WIDTH, y * MAP_HEIGHT);
    if (inverted) {
      return inverted;
    }
  }
  return defaultImageToWorld(x, y);
}

function markerPoint(marker) {
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

function computeCalibrationTransform() {
  const samples = CALIBRATION_TARGETS
    .map((target) => {
      const sample = state.calibrationSamples[target.id];
      return sample ? { ...target, ...sample } : null;
    })
    .filter(Boolean);

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

function importedCategory(marker) {
  switch (marker.sourceIcon) {
    case "Content_Quest.png":
      return "quests";
    case "Content_Miniquest.png":
      return "mini_quests";
    case "Content_UltimateDiscovery.png":
      return "secret_discovery";
    case "Special_LightRealm.png":
    case "Special_Rune.png":
      return "world_discovery";
    case "Special_RootsOfCorruption.png":
      return "territorial_discovery";
    case "Content_Cave.png":
      return "caves";
    case "Content_Dungeon.png":
    case "Content_CorruptedDungeon.png":
      return "dungeon";
    case "Content_Raid.png":
      return "raid";
    case "Content_BossAltar.png":
      return "boss_altar";
    case "Content_GrindSpot.png":
      return "lootrun_camp";
    default:
      return null;
  }
}

function normalizeImportedMarkers() {
  return IMPORTED_MARKERS
    .map((marker) => {
      const category = importedCategory(marker);
      if (!category) {
        return null;
      }

      return {
        ...marker,
        category,
        tags: [...(marker.tags || []), category],
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
    const classes = ["map-pin", "fixed"];
    if (isFound) {
      classes.push("found");
    }
    if (isSelected) {
      classes.push("selected");
    }

    return L.divIcon({
      className: "map-pin-wrapper",
      html: `
        <div class="${classes.join(" ")} city-pin">
          <img src="${CITY_ICON_URL}" alt="">
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  const variant = isSelected ? "tracked" : (isFound ? "locked" : "active");
  const iconUrl = categoryAssetUrl(marker.category, variant);
  const classes = ["map-pin", "asset-pin"];
  if (isFound) {
    classes.push("found");
  }
  if (isSelected) {
    classes.push("selected", "tracked");
  }

  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<div class="${classes.join(" ")}" style="--pin-glow:${meta.color};--marker-icon:url('${iconUrl}');"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createMarkerLayer(marker) {
  const layer = L.marker(markerLatLng(marker), {
    icon: buildMarkerIcon(marker, state.foundIds.has(marker.id), false),
    title: marker.title,
  });

  layer.on("click", () => setSelectedMarker(marker.id));
  state.markerLayers.set(marker.id, layer);
}

function calibrationLatLng(sample) {
  return [sample.pixelY, sample.pixelX];
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
    layer.setIcon(buildMarkerIcon(marker, state.foundIds.has(id), id === markerId));
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
    layer.setIcon(buildMarkerIcon(marker, state.foundIds.has(marker.id), marker.id === state.selectedMarkerId));
  }
}

function hydrateMarkerState() {
  const fixedCities = STARTER_MARKERS.map((marker) => ({ ...marker, fixed: true }));
  const imported = normalizeImportedMarkers();
  state.markers = [...fixedCities, ...imported];
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

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setPanelCollapsed(false);
    }
  });
}

hydrateMarkerState();
bindEvents();
renderCalibrationMarkers();
syncVisibleMarkers();
renderCategoryFilters();
renderDetailCard();
renderCalibrationPanel();
