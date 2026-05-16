import { CATEGORY_META, CATEGORY_ORDER, STARTER_MARKERS } from "./data/markers.js";
import { IMPORTED_MARKERS } from "./data/imported-markers.js";

const MAP_WIDTH = 4608;
const MAP_HEIGHT = 6644;
const MAP_BOUNDS = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
const MAP_MIN_X = -2540;
const MAP_MAX_X = 2046;
const MAP_MIN_Z = -6645;
const MAP_MAX_Z = 12;

const STORAGE_KEYS = {
  found: "wynninteractive-found-v1",
};
const CONTENT_BOOK_ROOT = "./assets/content-book";
const CITY_ICON_URL = "./assets/icon.png";

const state = {
  markers: [],
  filteredMarkers: [],
  foundIds: loadFoundIds(),
  selectedMarkerId: null,
  search: "",
  hideFound: false,
  panelCollapsed: false,
  markerLayers: new Map(),
  categoryFilter: new Set(CATEGORY_ORDER),
};

const elements = {
  panel: document.querySelector("#marker-panel"),
  panelToggle: document.querySelector("#panel-toggle"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  hideFoundToggle: document.querySelector("#hide-found-toggle"),
  categoryFilters: document.querySelector("#category-filters"),
  detailCard: document.querySelector("#detail-card"),
  showAllCategories: document.querySelector("#show-all-categories"),
  hideAllCategories: document.querySelector("#hide-all-categories"),
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

function persistFoundIds() {
  localStorage.setItem(STORAGE_KEYS.found, JSON.stringify([...state.foundIds]));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function worldToImage(x, z) {
  return {
    x: clamp((x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X), 0, 1),
    y: clamp((z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z), 0, 1),
  };
}

function imageToWorld(x, y) {
  return {
    x: Math.round(MAP_MIN_X + x * (MAP_MAX_X - MAP_MIN_X)),
    z: Math.round(MAP_MIN_Z + y * (MAP_MAX_Z - MAP_MIN_Z)),
  };
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

function categoryCount(categoryId) {
  return state.markers.filter((marker) => marker.category === categoryId && !marker.fixed).length;
}

function categoryVisibleCount(categoryId) {
  return state.filteredMarkers.filter((marker) => marker.category === categoryId && !marker.fixed).length;
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = CATEGORY_ORDER.map((categoryId) => {
    const meta = CATEGORY_META[categoryId];
    const active = state.categoryFilter.has(categoryId);
    const total = categoryCount(categoryId);
    const visible = categoryVisibleCount(categoryId);
    const iconUrl = categoryAssetUrl(categoryId, active ? "active" : "locked");
    return `
      <button type="button" class="category-card ${active ? "active" : ""}" data-category="${categoryId}">
        <span class="category-icon asset-icon" style="--category-icon:url('${iconUrl}');--category-accent:${meta.color};"></span>
        <span class="category-copy">
          <strong>${escapeHtml(meta.label)}</strong>
          <span class="category-meta">${active ? `${visible} shown` : "Hidden"}</span>
        </span>
        <span class="category-count">${total}</span>
      </button>
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
  const world = imageToWorld(point.x, point.y);
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

function bindEvents() {
  elements.panelToggle.addEventListener("click", () => {
    setPanelCollapsed(!state.panelCollapsed);
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

  elements.showAllCategories.addEventListener("click", () => {
    state.categoryFilter = new Set(CATEGORY_ORDER);
    syncVisibleMarkers();
    renderCategoryFilters();
  });

  elements.hideAllCategories.addEventListener("click", () => {
    state.categoryFilter = new Set();
    syncVisibleMarkers();
    renderCategoryFilters();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setPanelCollapsed(false);
    }
  });
}

hydrateMarkerState();
bindEvents();
syncVisibleMarkers();
renderCategoryFilters();
renderDetailCard();
