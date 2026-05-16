import { CATEGORY_META, STARTER_MARKERS } from "./data/markers.js";

const MAP_WIDTH = 4608;
const MAP_HEIGHT = 6644;
const MAP_BOUNDS = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
const MAP_MIN_X = -2540;
const MAP_MAX_X = 2046;
const MAP_MIN_Z = -6645;
const MAP_MAX_Z = 12;

const STORAGE_KEYS = {
  found: "lunaris-atlas-found-v1",
  custom: "lunaris-atlas-custom-v1",
};

const REGION_AREAS = [
  { id: "full", label: "World", min_x: MAP_MIN_X, max_x: MAP_MAX_X, min_z: MAP_MIN_Z, max_z: MAP_MAX_Z },
  { id: "wynn", label: "Wynn", min_x: -968, max_x: 906, min_z: -2334, max_z: -229 },
  { id: "gavel-west", label: "Gavel West", min_x: -2301, max_x: 338, min_z: -5704, max_z: -3515 },
  { id: "canyon", label: "Canyon", min_x: 31, max_x: 1555, min_z: -5776, max_z: -4263 },
  { id: "sky", label: "Sky", min_x: 593, max_x: 1612, min_z: -5054, max_z: -3977 },
  { id: "ocean", label: "Ocean", min_x: -1169, max_x: 1339, min_z: -4554, max_z: -2165 },
  { id: "corkus", label: "Corkus", min_x: -2550, max_x: -948, min_z: -3847, max_z: -1684 },
  { id: "gavel-core", label: "Gavel Core", min_x: -1162, max_x: 1465, min_z: -2431, max_z: -261 },
  { id: "desert", label: "Desert", min_x: 725, max_x: 1515, min_z: -2431, max_z: -1221 },
  { id: "jungle", label: "Jungle", min_x: -1060, max_x: -397, min_z: -1107, max_z: -268 },
  { id: "lutho", label: "Lutho", min_x: 335, max_x: 1465, min_z: -1197, max_z: -261 },
  { id: "fruma", label: "Fruma", min_x: -2411, max_x: -986, min_z: -1920, max_z: -287 },
];

const state = {
  markers: [],
  filteredMarkers: [],
  foundIds: loadFoundIds(),
  categoryFilter: new Set(Object.keys(CATEGORY_META)),
  selectedMarkerId: null,
  search: "",
  hideFound: false,
  addMode: false,
  pendingCustomPoint: null,
  regionHighlight: "full",
  markerLayers: new Map(),
};

const elements = {
  visibleCount: document.querySelector("#visible-count"),
  trackedCount: document.querySelector("#tracked-count"),
  customCount: document.querySelector("#custom-count"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  hideFoundToggle: document.querySelector("#hide-found-toggle"),
  categoryFilters: document.querySelector("#category-filters"),
  regionJumps: document.querySelector("#region-jumps"),
  markerList: document.querySelector("#marker-list"),
  detailCard: document.querySelector("#detail-card"),
  showAllCategories: document.querySelector("#show-all-categories"),
  hideAllCategories: document.querySelector("#hide-all-categories"),
  toggleAddMode: document.querySelector("#toggle-add-mode"),
  customPinForm: document.querySelector("#custom-pin-form"),
  customTitle: document.querySelector("#custom-title"),
  customCategory: document.querySelector("#custom-category"),
  customDescription: document.querySelector("#custom-description"),
  customCoords: document.querySelector("#custom-coords"),
  cancelCustomPin: document.querySelector("#cancel-custom-pin"),
};

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

function loadCustomMarkers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.custom);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistFoundIds() {
  localStorage.setItem(STORAGE_KEYS.found, JSON.stringify([...state.foundIds]));
}

function persistCustomMarkers() {
  const customMarkers = state.markers.filter((marker) => marker.isCustom);
  localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(customMarkers));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function worldToImage(x, z) {
  const xRatio = (x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
  const zRatio = (z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);
  return {
    x: clamp(xRatio, 0, 1),
    y: clamp(zRatio, 0, 1),
  };
}

function imageToWorld(x, y) {
  const worldX = MAP_MIN_X + x * (MAP_MAX_X - MAP_MIN_X);
  const worldZ = MAP_MIN_Z + y * (MAP_MAX_Z - MAP_MIN_Z);
  return {
    x: Math.round(worldX),
    z: Math.round(worldZ),
  };
}

function markerPoint(marker) {
  if (marker.position?.world) {
    const converted = worldToImage(marker.position.world.x, marker.position.world.z);
    return converted;
  }

  return marker.position;
}

function markerLatLng(marker) {
  const point = markerPoint(marker);
  return [point.y * MAP_HEIGHT, point.x * MAP_WIDTH];
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
  if (!state.categoryFilter.has(marker.category)) {
    return false;
  }

  if (state.hideFound && state.foundIds.has(marker.id)) {
    return false;
  }

  return markerMatchesSearch(marker);
}

function categoryPill(meta) {
  return `
    <span class="category-pill" style="background:${meta.color}1f;color:${meta.color};border:1px solid ${meta.color}55;">
      ${meta.label}
    </span>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSelectedMarker(markerId) {
  state.selectedMarkerId = markerId;

  for (const [id, layer] of state.markerLayers) {
    const marker = state.markers.find((item) => item.id === id);
    const meta = CATEGORY_META[marker.category];
    const isFound = state.foundIds.has(id);
    const isSelected = id === markerId;
    layer.setIcon(buildMarkerIcon(meta.color, isFound, isSelected));
  }

  renderDetailCard();
  renderMarkerList();
}

function buildMarkerIcon(color, isFound, isSelected) {
  const classes = ["map-pin"];
  if (isFound) {
    classes.push("found");
  }
  if (isSelected) {
    classes.push("selected");
  }

  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<div class="${classes.join(" ")}" style="background:${color};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
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
  renderDetailCard();
  renderMarkerList();
}

function removeCustomMarker(markerId) {
  state.markers = state.markers.filter((marker) => marker.id !== markerId);
  persistCustomMarkers();

  const layer = state.markerLayers.get(markerId);
  if (layer) {
    map.removeLayer(layer);
    state.markerLayers.delete(markerId);
  }

  if (state.selectedMarkerId === markerId) {
    state.selectedMarkerId = null;
  }

  syncVisibleMarkers();
  renderDetailCard();
  renderMarkerList();
}

function renderDetailCard() {
  const marker = state.markers.find((item) => item.id === state.selectedMarkerId);
  if (!marker) {
    elements.detailCard.className = "detail-card empty";
    elements.detailCard.innerHTML = `
      <h2>No marker selected</h2>
      <p>Use the map, search, or the list below to inspect locations.</p>
    `;
    return;
  }

  const meta = CATEGORY_META[marker.category];
  const point = markerPoint(marker);
  const worldPoint = imageToWorld(point.x, point.y);
  const isFound = state.foundIds.has(marker.id);

  elements.detailCard.className = "detail-card";
  elements.detailCard.innerHTML = `
    <div class="marker-title-row">
      <h2>${escapeHtml(marker.title)}</h2>
      ${categoryPill(meta)}
    </div>
    <p>${escapeHtml(marker.description || "No description yet.")}</p>
    <p class="marker-meta">Region: ${escapeHtml(marker.region || "Unknown")} | Approx world: ${worldPoint.x}, ${worldPoint.z}</p>
    <div class="detail-tags">
      ${(marker.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="detail-actions">
      <button type="button" class="accent-button" data-action="toggle-found">
        ${isFound ? "Mark not found" : "Mark found"}
      </button>
      <button type="button" class="ghost-button" data-action="focus-marker">Focus on map</button>
      ${marker.isCustom ? '<button type="button" class="ghost-button" data-action="delete-marker">Delete custom pin</button>' : ""}
    </div>
  `;

  elements.detailCard.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "toggle-found") {
        toggleFound(marker.id);
      } else if (action === "focus-marker") {
        flyToMarker(marker);
      } else if (action === "delete-marker") {
        removeCustomMarker(marker.id);
      }
    });
  });
}

function renderMarkerList() {
  if (!state.filteredMarkers.length) {
    elements.markerList.innerHTML = "<p class='marker-meta'>No markers match the current filters.</p>";
    return;
  }

  elements.markerList.innerHTML = state.filteredMarkers.map((marker) => {
    const meta = CATEGORY_META[marker.category];
    const isFound = state.foundIds.has(marker.id);
    const isActive = marker.id === state.selectedMarkerId;
    return `
      <article class="marker-item ${isFound ? "found" : ""} ${isActive ? "active" : ""}" data-id="${marker.id}">
        <div class="marker-title-row">
          <h3>${escapeHtml(marker.title)}</h3>
          ${categoryPill(meta)}
        </div>
        <p class="marker-meta">${escapeHtml(marker.region || "Unknown region")}</p>
        <div class="marker-tags">
          ${(marker.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </article>
    `;
  }).join("");

  elements.markerList.querySelectorAll(".marker-item").forEach((item) => {
    item.addEventListener("click", () => {
      const marker = state.markers.find((entry) => entry.id === item.dataset.id);
      if (marker) {
        flyToMarker(marker);
      }
    });
  });
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = Object.entries(CATEGORY_META).map(([id, meta]) => `
    <button
      type="button"
      class="chip ${state.categoryFilter.has(id) ? "active" : ""}"
      data-category="${id}"
      style="--chip:${meta.color};"
    >
      ${meta.label}
    </button>
  `).join("");

  elements.categoryFilters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (state.categoryFilter.has(category)) {
        state.categoryFilter.delete(category);
      } else {
        state.categoryFilter.add(category);
      }
      syncVisibleMarkers();
      renderCategoryFilters();
    });
  });
}

function renderRegionJumps() {
  elements.regionJumps.innerHTML = REGION_AREAS.map((region) => `
    <button
      type="button"
      class="chip region-chip ${region.id === state.regionHighlight ? "active" : ""}"
      data-region="${region.id}"
    >
      ${region.label}
    </button>
  `).join("");

  elements.regionJumps.querySelectorAll("[data-region]").forEach((button) => {
    button.addEventListener("click", () => {
      const region = REGION_AREAS.find((item) => item.id === button.dataset.region);
      if (!region) {
        return;
      }
      state.regionHighlight = region.id;
      renderRegionJumps();
      const topLeft = worldToImage(region.min_x, region.min_z);
      const bottomRight = worldToImage(region.max_x, region.max_z);
      const bounds = [
        [topLeft.y * MAP_HEIGHT, topLeft.x * MAP_WIDTH],
        [bottomRight.y * MAP_HEIGHT, bottomRight.x * MAP_WIDTH],
      ];
      map.fitBounds(bounds, { padding: [24, 24], animate: true });
    });
  });
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

    const meta = CATEGORY_META[marker.category];
    layer.setIcon(buildMarkerIcon(meta.color, state.foundIds.has(marker.id), marker.id === state.selectedMarkerId));
  }

  elements.visibleCount.textContent = String(state.filteredMarkers.length);
  elements.trackedCount.textContent = String(state.markers.length);
  elements.customCount.textContent = String(state.markers.filter((marker) => marker.isCustom).length);
  renderMarkerList();
}

function createMarkerLayer(marker) {
  const meta = CATEGORY_META[marker.category];
  const layer = L.marker(markerLatLng(marker), {
    icon: buildMarkerIcon(meta.color, state.foundIds.has(marker.id), false),
    title: marker.title,
  });

  layer.on("click", () => setSelectedMarker(marker.id));
  state.markerLayers.set(marker.id, layer);
}

function startAddMode() {
  state.addMode = true;
  state.pendingCustomPoint = null;
  elements.toggleAddMode.textContent = "Click map...";
  elements.toggleAddMode.classList.add("ghost-button");
  elements.customPinForm.classList.remove("hidden");
  elements.customCoords.textContent = "Waiting for map click";
  elements.customTitle.focus();
}

function stopAddMode(resetForm = true) {
  state.addMode = false;
  state.pendingCustomPoint = null;
  elements.toggleAddMode.textContent = "Add mode";
  elements.customPinForm.classList.add("hidden");
  elements.customCoords.textContent = "Waiting for map click";
  if (resetForm) {
    elements.customPinForm.reset();
    elements.customCategory.value = "custom";
  }
}

function bootstrapCustomCategorySelect() {
  elements.customCategory.innerHTML = Object.entries(CATEGORY_META)
    .map(([id, meta]) => `<option value="${id}">${meta.label}</option>`)
    .join("");
  elements.customCategory.value = "custom";
}

function hydrateMarkerState() {
  state.markers = [
    ...STARTER_MARKERS,
    ...loadCustomMarkers().map((marker) => ({ ...marker, isCustom: true })),
  ];

  state.markers.forEach(createMarkerLayer);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    syncVisibleMarkers();
  });

  elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.search = "";
    syncVisibleMarkers();
  });

  elements.hideFoundToggle.addEventListener("change", (event) => {
    state.hideFound = event.target.checked;
    syncVisibleMarkers();
  });

  elements.showAllCategories.addEventListener("click", () => {
    state.categoryFilter = new Set(Object.keys(CATEGORY_META));
    renderCategoryFilters();
    syncVisibleMarkers();
  });

  elements.hideAllCategories.addEventListener("click", () => {
    state.categoryFilter = new Set();
    renderCategoryFilters();
    syncVisibleMarkers();
  });

  elements.toggleAddMode.addEventListener("click", () => {
    if (state.addMode) {
      stopAddMode();
    } else {
      startAddMode();
    }
  });

  elements.cancelCustomPin.addEventListener("click", () => stopAddMode());

  elements.customPinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.pendingCustomPoint) {
      elements.customCoords.textContent = "Click the map before saving.";
      return;
    }

    const title = elements.customTitle.value.trim();
    if (!title) {
      elements.customTitle.focus();
      return;
    }

    const marker = {
      id: `custom-${Date.now()}`,
      title,
      category: elements.customCategory.value,
      region: "Custom",
      description: elements.customDescription.value.trim(),
      tags: ["custom"],
      position: state.pendingCustomPoint,
      isCustom: true,
    };

    state.markers.push(marker);
    createMarkerLayer(marker);
    persistCustomMarkers();
    stopAddMode();
    syncVisibleMarkers();
    flyToMarker(marker);
  });

  map.on("click", (event) => {
    if (!state.addMode) {
      return;
    }

    const x = clamp(event.latlng.lng / MAP_WIDTH, 0, 1);
    const y = clamp(event.latlng.lat / MAP_HEIGHT, 0, 1);
    state.pendingCustomPoint = { x, y };

    const world = imageToWorld(x, y);
    elements.customCoords.textContent = `Approx world coords: ${world.x}, ${world.z}`;
  });
}

bootstrapCustomCategorySelect();
hydrateMarkerState();
renderCategoryFilters();
renderRegionJumps();
bindEvents();
syncVisibleMarkers();
renderDetailCard();
