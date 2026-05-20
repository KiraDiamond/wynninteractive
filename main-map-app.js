import { CATEGORY_META, CATEGORY_ORDER, CURATED_MARKERS, STARTER_MARKERS } from "./data/markers.js?v=20260520i";
import { WIKI_MAP_MARKERS } from "./data/wiki-map-markers.js?v=20260520f";
import {
  contentSourceError,
  contentSourceKeyForCategory,
  loadMarkerContentForCategory,
  manualMarkerContentEntry,
} from "./data/marker-content-loader.js";
import { MOB_ICON_URLS } from "./data/mob-icon-urls.js?v=20260518j";
import { REFERENCE_IMAGE_URLS } from "./data/reference-images.js?v=20260518j";
import {
  clamp,
  escapeAttribute,
  escapeHtml,
  findMarkerByTitle,
  loadDismissedFlag,
  loadTheme,
  markerShareUrl,
  normalizeContentLinks,
  normalizeMarkerLookup,
  parseNumberParam,
  persistDismissedFlag,
  preferLocalAvif,
  resolveImageUrl,
  splitMultiline,
  youtubeEmbedMeta,
} from "./shared/app-utils.js";

const MAP_WIDTH = 4608;
const MAP_HEIGHT = 6644;
const MAP_PIN_SIZE = 56;
const MAP_BOUNDS = [
  [0, 0],
  [MAP_HEIGHT, MAP_WIDTH],
];
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
  introDismissed: "wynninteractive-intro-dismissed-v1",
  markerContent: "wynninteractive-marker-content-v1",
  theme: "wynninteractive-theme-v1",
};
const CONTENT_BOOK_ROOT = new URL("./assets/content-book/", import.meta.url).href.replace(/\/$/, "");
const CITY_ICON_URL = new URL("./assets/icon.avif", import.meta.url).href;
const MAP_AREAS = {
  wynn: {
    id: "wynn",
    label: "Wynn",
    buttonLabel: "Wynncraft Map",
    imageUrl: new URL("./assets/map/WynncraftMapFruma.avif", import.meta.url).href,
  },
};
const HAS_MULTIPLE_MAP_AREAS = Object.keys(MAP_AREAS).length > 1;
const query = new URLSearchParams(window.location.search);
const CALIBRATION_MODE = query.get("calibrate") === "1";
const USE_STORED_CALIBRATION = CALIBRATION_MODE || query.get("useCalibration") === "1";
const EDIT_CITY_QUERY_MODE = query.get("editCities") === "1";
const USE_CITY_EDITS = EDIT_CITY_QUERY_MODE || query.get("useCityEdits") === "1";
const INITIAL_MARKER_QUERY = String(query.get("marker") || "").trim();
const DEV_MODE = window.location.pathname.replace(/\/+$/, "").endsWith("/devview");
const MAJOR_CITY_MIN_ZOOM = -2;
const MINOR_CITY_MIN_ZOOM = -1;
const CONTENT_MARKER_MIN_ZOOM = -1;
const LOW_VALUE_DESCRIPTION_PATTERNS = [
  /\bi marked .+ on the live map\.?$/i,
  /\bimported from the external wynncraft marker dataset\.?$/i,
  /\bcommunity-style preview\b/i,
];
const VIDEO_GUIDE_CATEGORY_IDS = new Set(["quests", "mini_quests", "secret_discovery"]);
const MOB_CATEGORY_IDS = CATEGORY_ORDER.filter((categoryId) => categoryId.startsWith("hostile_mobs"));
const BOSS_ALTAR_INGREDIENT_OVERRIDES = {
  "atlas-boss_altar-aerie-of-the-recluse--1746--3069": "7 Turtle Shells",
  "atlas-boss_altar-altar-of-sanctification--911--623": "1 Skiens Badge",
  "atlas-boss_altar-geyser-pit--1573--3204": "8 Robot Antennas",
  "atlas-boss_altar-plague-laboratory--1833--5259": "1 Venom Sac",
  "atlas-boss_altar-tribal-sanctuary--711--657": "4 Zombie Eyes",
};

const URL_PROJECTION_CONFIG = {
  offsetX: parseNumberParam(query, "offsetX", 0),
  offsetY: parseNumberParam(query, "offsetY", 0),
  scaleX: parseNumberParam(query, "scaleX", 1),
  scaleY: parseNumberParam(query, "scaleY", 1),
};

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
    categories: ["secret_discovery", "world_discovery"],
  },
  {
    id: "activities",
    label: "Activities",
    categories: ["fast_travel", "seaskipper", "caves", "dungeon", "raid", "boss_altar", "lootrun_camp"],
  },
  {
    id: "professions",
    label: "Professions",
    categories: ["profession_fishing", "profession_farming", "profession_mining", "profession_woodcutting"],
  },
  {
    id: "mobs",
    label: "Mobs",
    categories: MOB_CATEGORY_IDS,
  },
];
const PASSIVE_CATEGORIES = new Set([
  ...MOB_CATEGORY_IDS,
  "fast_travel",
  "seaskipper",
  "profession_fishing",
  "profession_farming",
  "profession_mining",
  "profession_woodcutting",
]);
const DEFAULT_HIDDEN_CATEGORIES = new Set([
  ...MOB_CATEGORY_IDS,
  "profession_fishing",
  "profession_farming",
  "profession_mining",
  "profession_woodcutting",
]);
const DEFAULT_CATEGORY_FILTER = new Set(
  CATEGORY_ORDER.filter((categoryId) => !DEFAULT_HIDDEN_CATEGORIES.has(categoryId))
);

const state = {
  markers: [],
  markerIndex: new Map(),
  filteredMarkers: [],
  filteredMarkerIdSet: new Set(),
  foundIds: loadFoundIds(),
  selectedMarkerId: null,
  search: "",
  hideFound: false,
  showCities: true,
  panelCollapsed: false,
  markerLayers: new Map(),
  markerRenderCache: new Map(),
  areaHighlightLayer: null,
  travelLinkLayer: null,
  categoryFilter: new Set(DEFAULT_CATEGORY_FILTER),
  calibrationMode: CALIBRATION_MODE,
  calibrationSamples: loadCalibrationSamples(),
  calibrationIndex: 0,
  calibrationLayers: new Map(),
  activeTransform: USE_STORED_CALIBRATION ? loadCalibrationTransform() : null,
  editCities: EDIT_CITY_QUERY_MODE,
  cityEdits: USE_CITY_EDITS ? loadCityEdits() : {},
  cityTransform: null,
  markerContent: loadMarkerContent(),
  shippedMarkerContent: Object.create(null),
  loadedContentSources: new Set(),
  loadingContentSources: new Set(),
  theme: loadTheme(
    STORAGE_KEYS.theme,
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  ),
  introDismissed: loadDismissedFlag(STORAGE_KEYS.introDismissed),
  panelView: "markers",
  activeMobFamily: null,
  trackedIngredient: "",
  ingredientNoteDismissed: false,
  currentArea: "wynn",
  mapSelectorOpen: false,
  suppressMarkerClickUntil: 0,
  markerPointerPress: null,
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  panel: document.querySelector("#marker-panel"),
  panelToggle: document.querySelector("#panel-toggle"),
  panelTabs: document.querySelectorAll("[data-panel-view]"),
  panelViews: document.querySelectorAll("[data-panel-screen]"),
  panelBanner: document.querySelector(".panel-banner"),
  mapSelector: document.querySelector(".map-selector"),
  mapSelectorLabel: document.querySelector(".map-selector span"),
  mapSelectorMenu: document.querySelector(".map-selector-menu"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  showCitiesToggle: document.querySelector("#show-cities-toggle"),
  hideFoundToggle: document.querySelector("#hide-found-toggle"),
  editCitiesToggle: document.querySelector("#edit-cities-toggle"),
  categoryFilters: document.querySelector("#category-filters"),
  detailCard: document.querySelector("#info-card"),
  linkCard: document.querySelector("#link-card"),
  appearanceCard: document.querySelector("#appearance-card"),
  studioCard: document.querySelector("#studio-card"),
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
  lightbox: document.querySelector("#image-lightbox"),
  lightboxImage: document.querySelector("#image-lightbox-image"),
  lightboxCaption: document.querySelector("#image-lightbox-caption"),
  lightboxClose: document.querySelector("#image-lightbox-close"),
  introModal: document.querySelector("#intro-modal"),
  introClose: document.querySelector("#intro-close"),
  introStart: document.querySelector("#intro-start"),
};

const firstOpenCalibrationIndex = CALIBRATION_TARGETS.findIndex((target) => !state.calibrationSamples[target.id]);
if (firstOpenCalibrationIndex >= 0) {
  state.calibrationIndex = firstOpenCalibrationIndex;
}

function themeOptionHtml(themeId, label, copy) {
  const active = state.theme === themeId;
  return `
    <button type="button" class="appearance-option${active ? " active" : ""}" data-theme-option="${themeId}" aria-pressed="${active ? "true" : "false"}">
      <span class="appearance-option-swatch ${escapeAttribute(themeId)}" aria-hidden="true"></span>
      <span class="appearance-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(copy)}</span>
      </span>
    </button>
  `;
}

function renderAppearanceCard() {
  if (!elements.appearanceCard) {
    return;
  }

  elements.appearanceCard.className = "detail-card appearance-card";
  elements.appearanceCard.innerHTML = `
    <div class="detail-topline compact">
      <div>
        <h2>Appearance</h2>
        <p class="detail-kind">Theme</p>
      </div>
    </div>
    <p class="appearance-intro">Choose how the atlas panel looks on this device. The same setting carries over to beta too.</p>
    <div class="appearance-grid">
      ${themeOptionHtml("light", "Light", "Clean paper panels with bright map contrast.")}
      ${themeOptionHtml("dark", "Dark", "Dimmed chrome that keeps the map in front.")}
    </div>
    <div class="appearance-note">Saved automatically in this browser.</div>
  `;

  elements.appearanceCard.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeOption);
    });
  });
}

function renderPanelBanner() {
  if (!elements.panelBanner) {
    return;
  }

  if (state.trackedIngredient && !state.ingredientNoteDismissed) {
    elements.panelBanner.classList.add("panel-banner-info");
    elements.panelBanner.innerHTML = `
      <span>Clear the search bar to reveal all markers.</span>
      <button type="button" class="panel-banner-close" data-dismiss-ingredient-note="1" aria-label="Dismiss tracking note">×</button>
    `;
    return;
  }

  elements.panelBanner.classList.remove("panel-banner-info");
  elements.panelBanner.textContent = "Routes, rewards, discoveries, profession spots, and mobs.";
}

function renderSearchButton() {
  if (!elements.clearSearch) {
    return;
  }
  const hasText = Boolean(state.search);
  elements.clearSearch.setAttribute("aria-label", hasText ? "Clear search" : "Search");
  elements.clearSearch.innerHTML = hasText
    ? `<span class="icon-button-glyph">×</span>`
    : `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.5 4a6.5 6.5 0 0 1 5.2 10.4l4 4-1.4 1.4-4-4A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/>
      </svg>
    `;
}

function getMarkerById(markerId) {
  return state.markerIndex.get(markerId) || null;
}

function markerDisplayZoom(marker) {
  if (!marker) {
    return Math.max(map.getZoom(), 0);
  }
  if (marker.fixed) {
    return Math.max(map.getZoom(), marker.minor ? MINOR_CITY_MIN_ZOOM : MAJOR_CITY_MIN_ZOOM);
  }
  if (isMobCategory(marker.category)) {
    return Math.max(map.getZoom(), 0.25);
  }
  return Math.max(map.getZoom(), 0);
}

function ensureMarkerSelectable(marker) {
  if (!marker) {
    return;
  }

  if (state.hideFound) {
    state.hideFound = false;
    if (elements.hideFoundToggle) {
      elements.hideFoundToggle.checked = false;
    }
  }

  if (marker.fixed) {
    state.showCities = true;
    if (elements.showCitiesToggle) {
      elements.showCitiesToggle.checked = true;
    }
    return;
  }

  if (isMobCategory(marker.category)) {
    state.activeMobFamily = marker.category;
    state.search = marker.title.toLowerCase();
    if (elements.searchInput) {
      elements.searchInput.value = marker.title;
    }
    renderSearchButton();
    return;
  }

  state.categoryFilter.add(marker.category);
}

function applyTheme(theme, { persist = true } = {}) {
  state.theme = theme === "dark" ? "dark" : "light";
  if (state.theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    } catch {}
  }
  renderAppearanceCard();
}

applyTheme(state.theme, { persist: false });

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomDelta: 0.25,
  zoomSnap: 0.25,
  zoomControl: true,
  attributionControl: false,
  wheelPxPerZoomLevel: 100,
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
});
map.zoomControl.setPosition("bottomright");

const baseMapOverlay = L.imageOverlay(MAP_AREAS.wynn.imageUrl, MAP_BOUNDS).addTo(map);
map.fitBounds(MAP_BOUNDS, { padding: [24, 24] });

function createCoordinateControl() {
  const control = L.control({ position: "bottomright" });
  control.onAdd = () => {
    const shell = L.DomUtil.create("div", "leaflet-control map-coordinate-control");
    shell.innerHTML = '<span class="map-coordinate-label">X -- Z --</span>';
    L.DomEvent.disableClickPropagation(shell);
    return shell;
  };
  return control;
}

const coordinateControl = createCoordinateControl();
coordinateControl.addTo(map);
const coordinateLabel = coordinateControl.getContainer()?.querySelector(".map-coordinate-label") || null;

function updateCoordinateReadout(latlng) {
  if (!coordinateLabel) {
    return;
  }
  const x = Math.round(clamp(latlng.lng, 0, MAP_WIDTH));
  const z = Math.round(clamp(latlng.lat, 0, MAP_HEIGHT));
  coordinateLabel.textContent = `X ${x}  Z ${z}`;
}

function resetCoordinateReadout() {
  if (coordinateLabel) {
    coordinateLabel.textContent = "X --  Z --";
  }
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

function loadMarkerContent() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.markerContent) || "{}");
  } catch {
    return {};
  }
}

function persistMarkerContent() {
  localStorage.setItem(STORAGE_KEYS.markerContent, JSON.stringify(state.markerContent));
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

function persistIntroDismissed() {
  persistDismissedFlag(STORAGE_KEYS.introDismissed, state.introDismissed);
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
    x: clamp((shiftedX - 0.5) / scaleX + 0.5, 0, 1),
    y: clamp((shiftedY - 0.5) / scaleY + 0.5, 0, 1),
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

function markerArea(marker) {
  return marker.area || "wynn";
}

function markerPoint(marker) {
  if (marker.fixed && state.cityEdits[marker.id]) {
    return {
      x: clamp(state.cityEdits[marker.id].x / MAP_WIDTH, 0, 1),
      y: clamp(state.cityEdits[marker.id].y / MAP_HEIGHT, 0, 1),
    };
  }
  if (marker.position?.image) {
    return marker.position.image;
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

function setPanelView(view) {
  state.panelView = view;
  elements.panelTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.panelView === view);
  });
  elements.panelViews.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panelScreen !== view);
  });
}

function markerSupportsFound(marker) {
  return !marker.fixed && !marker.disableFound && !PASSIVE_CATEGORIES.has(marker.category);
}

function isMobCategory(categoryId) {
  return MOB_CATEGORY_IDS.includes(categoryId);
}

function mobFamilyMarkers(categoryId) {
  return state.markers
    .filter((marker) => !marker.fixed && marker.category === categoryId)
    .sort((left, right) => left.title.localeCompare(right.title) || left.region.localeCompare(right.region));
}

function filteredMobFamilyMarkers(categoryId) {
  return mobFamilyMarkers(categoryId).filter(markerMatchesSearch);
}

function activeMobFamilyMarkers() {
  return state.activeMobFamily ? filteredMobFamilyMarkers(state.activeMobFamily) : [];
}

function markerIsFound(marker) {
  return markerSupportsFound(marker) && state.foundIds.has(marker.id);
}

function markerContentAuthorEntry(markerId) {
  const entry = state.markerContent[markerId] || {};
  return {
    summary: entry.summary || "",
    explanation: entry.explanation || "",
    coverImage: entry.coverImage || "",
    gallery: Array.isArray(entry.gallery) ? entry.gallery : splitMultiline(entry.gallery || ""),
    sourceUrl: entry.sourceUrl || "",
    links: normalizeContentLinks(entry.links),
    tutorials: Array.isArray(entry.tutorials) ? entry.tutorials : splitMultiline(entry.tutorials || ""),
  };
}

function shippedMarkerContentEntry(markerId) {
  return {
    ...(state.shippedMarkerContent[markerId] || {}),
    ...(manualMarkerContentEntry(markerId) || {}),
  };
}

function normalizeMarkerContentEntry(entry) {
  return {
    summary: entry?.summary || "",
    explanation: entry?.explanation || "",
    coverImage: entry?.coverImage || "",
    gallery: Array.isArray(entry?.gallery) ? entry.gallery : splitMultiline(entry?.gallery || ""),
    sourceUrl: entry?.sourceUrl || "",
    links: normalizeContentLinks(entry?.links),
    tutorials: Array.isArray(entry?.tutorials) ? entry.tutorials : splitMultiline(entry?.tutorials || ""),
  };
}

function markerContentEntry(marker) {
  const entry = markerContentAuthorEntry(marker.id);
  const shipped = normalizeMarkerContentEntry(shippedMarkerContentEntry(marker.id));
  const fallbackSummary = LOW_VALUE_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(marker.description || ""))
    ? ""
    : marker.description || "";
  return {
    summary: entry.summary || shipped.summary || fallbackSummary,
    explanation: entry.explanation || shipped.explanation,
    coverImage: entry.coverImage || shipped.coverImage,
    gallery: entry.gallery.length ? entry.gallery : shipped.gallery,
    sourceUrl: entry.sourceUrl || shipped.sourceUrl,
    links: entry.links.length ? entry.links : shipped.links,
    tutorials: entry.tutorials.length ? entry.tutorials : shipped.tutorials,
  };
}

function markerSupportsVideoGuide(marker) {
  return VIDEO_GUIDE_CATEGORY_IDS.has(marker.category);
}

function contentExportEntry(marker) {
  const entry = markerContentEntry(marker);
  return {
    id: marker.id,
    title: marker.title,
    category: marker.category,
    region: marker.region,
    world: marker.position?.world || null,
    summary: entry.summary,
    explanation: entry.explanation,
    coverImage: entry.coverImage,
    gallery: entry.gallery,
    sourceUrl: entry.sourceUrl,
    links: entry.links,
    tutorials: entry.tutorials,
  };
}

function hasMarkerContent(entry) {
  return Boolean(
    entry.summary ||
    entry.explanation ||
    entry.coverImage ||
    entry.gallery.length ||
    entry.sourceUrl ||
    entry.links.length ||
    entry.tutorials.length
  );
}

function contentSourceLoaded(categoryId) {
  const sourceKey = contentSourceKeyForCategory(categoryId);
  return !sourceKey || state.loadedContentSources.has(sourceKey);
}

function contentSourceLoadError(categoryId) {
  return contentSourceError(categoryId);
}

async function ensureMarkerContentLoaded(marker) {
  const sourceKey = contentSourceKeyForCategory(marker?.category);
  if (!sourceKey || state.loadedContentSources.has(sourceKey) || state.loadingContentSources.has(sourceKey)) {
    return;
  }

  state.loadingContentSources.add(sourceKey);
  try {
    const content = await loadMarkerContentForCategory(marker.category);
    Object.assign(state.shippedMarkerContent, content);
    state.loadedContentSources.add(sourceKey);
  } catch (error) {
    console.error(`Failed to load marker content for ${marker.category}.`, error);
  } finally {
    state.loadingContentSources.delete(sourceKey);
  }

  if (state.selectedMarkerId === marker.id) {
    renderDetailCard();
  }
}

function contextGroupIdForMarker(marker) {
  return marker?.contextGroupId || null;
}

function activeContextGroupId() {
  const selected = getMarkerById(state.selectedMarkerId);
  return contextGroupIdForMarker(selected);
}

function contextChildMarkers(marker) {
  const groupId = contextGroupIdForMarker(marker);
  if (!groupId) {
    return [];
  }
  return state.markers
    .filter((item) => item.contextOnly && item.contextGroupId === groupId)
    .sort(
      (left, right) => (left.contextOrder || 0) - (right.contextOrder || 0) || left.title.localeCompare(right.title)
    );
}

function contextParentMarker(marker) {
  const groupId = contextGroupIdForMarker(marker);
  if (!groupId) {
    return null;
  }
  return state.markers.find((item) => !item.contextOnly && item.contextGroupId === groupId) || null;
}

function encounterNavigatorHtml(marker) {
  const encounters = contextChildMarkers(marker);
  if (!encounters.length) {
    return "";
  }

  const parent = contextParentMarker(marker);
  const returnButton = parent
    ? `
      <button type="button" class="context-return" data-context-marker="${escapeAttribute(parent.id)}">
        Return to ${escapeHtml(parent.title)}
      </button>
    `
    : "";

  return `
    <section class="context-panel">
      <div class="context-head">
        <div>
          <h3>Hive Encounters</h3>
          <p>Select a wing to open its own route and boss guide.</p>
        </div>
        ${returnButton}
      </div>
      <div class="context-chip-grid">
        ${encounters
          .map(
            (entry) => `
          <button
            type="button"
            class="context-chip ${entry.id === marker.id ? "active" : ""}"
            data-context-marker="${escapeAttribute(entry.id)}"
          >
            <strong>${escapeHtml(entry.title)}</strong>
            <span>${escapeHtml(entry.description || entry.region || "Encounter")}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function openImageLightbox(src, caption) {
  if (!elements.lightbox || !elements.lightboxImage) {
    return;
  }

  elements.lightboxImage.src = src;
  elements.lightboxImage.alt = caption || "";
  if (elements.lightboxCaption) {
    elements.lightboxCaption.textContent = caption || "";
  }
  elements.lightbox.classList.remove("hidden");
  elements.lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
}

function closeImageLightbox() {
  if (!elements.lightbox || !elements.lightboxImage) {
    return;
  }

  elements.lightbox.classList.add("hidden");
  elements.lightbox.setAttribute("aria-hidden", "true");
  elements.lightboxImage.src = "";
  elements.lightboxImage.alt = "";
  if (elements.lightboxCaption) {
    elements.lightboxCaption.textContent = "";
  }
  document.body.classList.remove("lightbox-open");
}

function bossAltarIngredientMeta(marker, entry) {
  if (marker.category !== "boss_altar") {
    return null;
  }

  const rawRequirement =
    BOSS_ALTAR_INGREDIENT_OVERRIDES[marker.id] ||
    String(entry.explanation || "").match(/Items required:\s*([^\.\n]+)/i)?.[1] ||
    "";
  const raw = String(rawRequirement).trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d+)\s+(.+)$/);
  const itemName = (match ? match[2] : raw).trim();
  return { raw, itemName };
}

function miniQuestIngredientOptions(marker, entry) {
  if (marker.category !== "mini_quests") {
    return [];
  }

  const seen = new Set();
  return String(entry.explanation || "")
    .split("\n")
    .map((line) => line.replace(/^[•»]\s*/, "").trim())
    .filter((line) => /^Bring\s+/i.test(line))
    .map((line) => {
      const match = line.match(/^Bring\s+([\d?()]+)\s+(.+?)\.?$/i);
      if (!match) {
        return null;
      }

      const rawItem = String(match[2] || "").trim();
      if (!rawItem || /\bkilled\b$/i.test(rawItem)) {
        return null;
      }

      const itemName = rawItem.trim();
      const key = itemName.toLowerCase();
      if (seen.has(key) || !mobMarkersForIngredient(itemName).length) {
        return null;
      }

      seen.add(key);
      return {
        raw: `${match[1]} ${itemName}`,
        itemName,
      };
    })
    .filter(Boolean);
}

function contentPreviewHtml(marker, entry) {
  const blocks = [];
  const gallery = entry.gallery.filter((url) => url !== entry.coverImage);
  const referenceLinks = entry.links;
  const tutorials = entry.tutorials;
  const altarIngredient = bossAltarIngredientMeta(marker, entry);
  const miniQuestIngredients = miniQuestIngredientOptions(marker, entry);

  if (entry.coverImage) {
    const coverUrl = resolveImageUrl(entry.coverImage, MOB_ICON_URLS, REFERENCE_IMAGE_URLS);
    blocks.push(`
      <button type="button" class="content-image-button content-cover" data-preview-image="${escapeAttribute(coverUrl)}" data-preview-caption="${escapeAttribute(`${marker.title} cover image`)}">
        <img src="${escapeAttribute(coverUrl)}" alt="${escapeAttribute(marker.title)} cover image" loading="lazy" referrerpolicy="no-referrer">
      </button>
    `);
  }

  if (entry.summary) {
    blocks.push(`<p class="content-summary">${escapeHtml(entry.summary)}</p>`);
  }

  if (entry.explanation) {
    const sections = entry.explanation
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) =>
        part
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      );

    const renderSectionCard = (lines) => {
      const [title, ...items] = lines;
      if (!title) {
        return "";
      }
      if (!items.length) {
        return `
          <section class="content-step content-step-rich">
            <h3>${escapeHtml(title)}</h3>
          </section>
        `;
      }

      const allBullets = items.every((line) => /^[•»]/.test(line));
      const body = allBullets
        ? `
            <ul>
              ${items.map((line) => `<li>${escapeHtml(line.replace(/^[•»]\s*/, ""))}</li>`).join("")}
            </ul>
          `
        : `
            <div class="content-step-copy">
              ${items.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
          `;

      return `
        <section class="content-step content-step-rich">
          <h3>${escapeHtml(title)}</h3>
          ${body}
        </section>
      `;
    };

    const stepCards = sections.every((lines) => /^Stage\s+\d+\b/i.test(lines[0] || ""))
      ? sections
          .map((lines) => {
            const [title, ...items] = lines;
            if (!items.length) {
              return "";
            }

            return `
            <section class="content-step">
              <h3>${escapeHtml(title)}</h3>
              <ul>
                ${items.map((line) => `<li>${escapeHtml(line.replace(/^[•»]\s*/, ""))}</li>`).join("")}
              </ul>
            </section>
          `;
          })
          .filter(Boolean)
          .join("")
      : "";

    const sectionCards =
      !stepCards && sections.every((lines) => lines.length > 0 && !/^[•»]/.test(lines[0]))
        ? sections
            .map((lines) => renderSectionCard(lines))
            .filter(Boolean)
            .join("")
        : "";

    if (stepCards) {
      blocks.push(`<div class="content-steps">${stepCards}</div>`);
    } else if (sectionCards) {
      blocks.push(`<div class="content-steps">${sectionCards}</div>`);
    } else {
      const paragraphs = sections
        .map((lines) => `<p>${escapeHtml(lines.join("\n")).replaceAll("\n", "<br>")}</p>`)
        .join("");
      blocks.push(`<div class="content-prose">${paragraphs}</div>`);
    }
  }

  if (entry.sourceUrl) {
    blocks.push(`
      <section class="content-source">
        <span>Full article</span>
        <a href="${escapeAttribute(entry.sourceUrl)}" target="_blank" rel="noreferrer">Open the wiki page</a>
      </section>
    `);
  }

  if (altarIngredient) {
    blocks.push(`
      <section class="content-block content-links">
        <h3>Opening Ingredient</h3>
        <div class="content-link-list">
          <button type="button" class="content-link-chip" data-ingredient-mobs="${escapeAttribute(altarIngredient.itemName)}">
            ${escapeHtml(`Show where to get ${altarIngredient.raw}`)}
          </button>
        </div>
      </section>
    `);
  }

  if (miniQuestIngredients.length) {
    blocks.push(`
      <section class="content-block content-links">
        <h3>${miniQuestIngredients.length === 1 ? "Required Item" : "Required Items"}</h3>
        <div class="content-link-list">
          ${miniQuestIngredients
            .map(
              (item) => `
            <button type="button" class="content-link-chip" data-ingredient-mobs="${escapeAttribute(item.itemName)}">
              ${escapeHtml(`Show where to get ${item.raw}`)}
            </button>
          `
            )
            .join("")}
        </div>
      </section>
    `);
  }

  if (referenceLinks.length) {
    blocks.push(`
      <section class="content-block content-links">
        <h3>Reference Links</h3>
        <div class="content-link-list">
          ${referenceLinks
            .map(
              (item) => `
            <a class="content-link-chip" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(item.label)}
            </a>
          `
            )
            .join("")}
        </div>
      </section>
    `);
  }

  const embeddableGallery = gallery.map((url) => resolveImageUrl(url, MOB_ICON_URLS, REFERENCE_IMAGE_URLS));

  if (embeddableGallery.length) {
    blocks.push(`
      <div class="content-gallery">
        ${embeddableGallery
          .map(
            (url, index) => `
          <button type="button" class="content-image-button content-thumb" data-preview-image="${escapeAttribute(url)}" data-preview-caption="${escapeAttribute(`${marker.title} reference image ${index + 1}`)}">
            <img src="${escapeAttribute(url)}" alt="${escapeAttribute(`${marker.title} gallery ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer">
          </button>
        `
          )
          .join("")}
      </div>
    `);
  }

  if (tutorials.length && !markerSupportsVideoGuide(marker)) {
    const tutorialCards = tutorials
      .map((url) => {
        const embed = youtubeEmbedMeta(url);
        if (embed?.embedUrl) {
          return `
          <div class="tutorial-card${embed.isShort ? " short" : ""}">
            <iframe
              src="${escapeAttribute(embed.embedUrl)}"
              title="${escapeAttribute(`${marker.title} tutorial video`)}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
            <a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">Open source video</a>
          </div>
        `;
        }

        return `
        <div class="tutorial-link">
          <a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
        </div>
      `;
      })
      .join("");

    blocks.push(`
      <section class="content-block">
        <h3>Tutorials</h3>
        <div class="tutorial-stack">${tutorialCards}</div>
      </section>
    `);
  }

  if (!blocks.length) {
    const emptyTitle = DEV_MODE ? "No entry yet." : "No notes yet.";
    const emptyCopy = DEV_MODE
      ? "Use the editor below for notes, image links, and tutorial links. Changes save locally in this browser."
      : "This marker still links to the source page even when no local notes are available.";

    return `
      <div class="content-empty">
        <strong>${emptyTitle}</strong>
        <span>${emptyCopy}</span>
      </div>
    `;
  }

  return blocks.join("");
}

function videoGuidePreviewHtml(marker, entry) {
  if (!markerSupportsVideoGuide(marker)) {
    return `
      <div class="content-empty">
        <strong>No linked video here.</strong>
        <span>Video guide links are only set up for quests, mini quests, and secret discoveries right now.</span>
      </div>
    `;
  }

  const primaryVideo = entry.tutorials[0] || "";
  if (!primaryVideo) {
    return `
      <div class="content-empty video-guide-empty">
        <strong>No linked video yet.</strong>
        <span>a video guide for this isnt currently avalable</span>
      </div>
    `;
  }

  const embed = youtubeEmbedMeta(primaryVideo);
  const body = embed?.embedUrl
    ? `
      <div class="tutorial-card${embed.isShort ? " short" : ""}">
        <iframe
          src="${escapeAttribute(embed.embedUrl)}"
          title="${escapeAttribute(`${marker.title} tutorial video`)}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
        <a href="${escapeAttribute(primaryVideo)}" target="_blank" rel="noreferrer">Open linked video</a>
      </div>
    `
    : `
      <div class="tutorial-link">
        <a href="${escapeAttribute(primaryVideo)}" target="_blank" rel="noreferrer">${escapeHtml(primaryVideo)}</a>
      </div>
    `;

  return `
    <section class="content-block">
      <h3>Video Guide</h3>
      <div class="tutorial-stack">${body}</div>
    </section>
  `;
}

function contentEditorHtml(marker, entry) {
  return `
    <section class="content-studio">
      <div class="content-studio-head">
        <h3>Content Studio</h3>
        <span class="content-studio-note">Notes, image links, and tutorial links.</span>
      </div>
      <label class="content-field">
        <span>Summary</span>
        <input type="text" data-content-field="summary" value="${escapeAttribute(entry.summary)}" placeholder="Short line shown at the top of the marker entry.">
      </label>
      <label class="content-field">
        <span>Cover Image URL</span>
        <input type="url" data-content-field="coverImage" value="${escapeAttribute(entry.coverImage)}" placeholder="https://drive.google.com/file/d/.../view">
      </label>
      <label class="content-field">
        <span>Gallery Image URLs</span>
        <textarea data-content-field="gallery" rows="4" placeholder="One Google Drive image link per line.">${escapeHtml(entry.gallery.join("\n"))}</textarea>
      </label>
      <label class="content-field">
        <span>Explanation</span>
        <textarea data-content-field="explanation" rows="8" placeholder="Write the full explanation for this location.">${escapeHtml(entry.explanation)}</textarea>
      </label>
      <label class="content-field">
        <span>Tutorial Videos</span>
        <textarea data-content-field="tutorials" rows="4" placeholder="One YouTube URL per line.">${escapeHtml(entry.tutorials.join("\n"))}</textarea>
      </label>
      <div class="detail-actions">
        <button type="button" class="detail-button secondary" data-content-action="copy-marker">Copy marker JSON</button>
        <button type="button" class="detail-button secondary" data-content-action="copy-all">Copy all content JSON</button>
      </div>
      <div class="content-save-note">Typing saves automatically to this browser.</div>
    </section>
  `;
}

function worldEventDetailsHtml(marker) {
  const details = marker.details;
  if (marker.category !== "world_events" || !details) {
    return "";
  }

  const enemies = Array.isArray(details.enemies) ? details.enemies : [];
  const drops = Array.isArray(details.drops) ? details.drops : [];
  const boss = String(details.boss || "").trim();
  const coordinates = Array.isArray(details.coordinates) ? details.coordinates : [];
  const coordText = coordinates.length ? coordinates.map((point) => `${point.x}, ${point.z}`).join(" | ") : "Unknown";
  const enemyBlock = enemies.length
    ? `
        <section class="event-detail-block">
          <h4>Enemies</h4>
          <ul>
            ${enemies.map((enemy) => `<li>${escapeHtml(enemy)}</li>`).join("")}
          </ul>
        </section>
      `
    : "";
  const bossBlock = boss
    ? `
        <section class="event-detail-block">
          <h4>Boss</h4>
          <p>${escapeHtml(boss)}</p>
        </section>
      `
    : "";
  const detailGrid =
    enemyBlock || bossBlock
      ? `
      <div class="event-detail-grid">
        ${enemyBlock}
        ${bossBlock}
      </div>
    `
      : "";
  const dropsBlock = drops.length
    ? `
      <section class="event-detail-block drops">
        <h4>Drops</h4>
        <div class="event-drop-list">
          ${drops.map((drop) => `<span class="event-drop-chip">${escapeHtml(drop)}</span>`).join("")}
        </div>
      </section>
    `
    : "";

  return `
    <section class="event-intel-panel">
      <div class="event-intel-head">
        <h3>World Event Intel</h3>
        <span>Combat breakdown for this event.</span>
      </div>
      <div class="event-stat-grid">
        <div class="event-stat-card">
          <strong>Suggested Lv.</strong>
          <span>${escapeHtml(details.level)}</span>
        </div>
        <div class="event-stat-card">
          <strong>Waves</strong>
          <span>${escapeHtml(details.waves)}</span>
        </div>
        <div class="event-stat-card">
          <strong>Length</strong>
          <span>${escapeHtml(details.length)}</span>
        </div>
        <div class="event-stat-card">
          <strong>Difficulty</strong>
          <span>${escapeHtml(details.difficulty)}</span>
        </div>
      </div>
      ${
        details.requiredQuest
          ? `
        <div class="event-detail-row">
          <strong>Required Quest</strong>
          <span>${escapeHtml(details.requiredQuest)}</span>
        </div>
      `
          : ""
      }
      <div class="event-detail-row">
        <strong>Anchor Coordinates</strong>
        <span>${escapeHtml(coordText)}</span>
      </div>
      ${detailGrid}
      ${dropsBlock}
    </section>
  `;
}

function updateMarkerContent(marker, field, rawValue) {
  const current = markerContentAuthorEntry(marker.id);
  if (field === "videoGuide") {
    current.tutorials = rawValue.trim() ? [rawValue.trim()] : [];
  } else if (field === "gallery" || field === "tutorials") {
    current[field] = splitMultiline(rawValue);
  } else {
    current[field] = rawValue.trim();
  }
  state.markerContent[marker.id] = current;
  persistMarkerContent();
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function categoryAssetUrl(categoryId, variant = "active") {
  const icon = CATEGORY_META[categoryId]?.icon;
  if (!icon) {
    return null;
  }
  if (categoryId === "fast_travel" || categoryId === "seaskipper") {
    return `${CONTENT_BOOK_ROOT}/${icon}_${variant}.png`;
  }
  return `${CONTENT_BOOK_ROOT}/${icon}_${variant}.avif`;
}

function genericIconMarkup(categoryId, extraClass = "") {
  const meta = CATEGORY_META[categoryId];
  return `<span class="generic-category-icon ${extraClass}" style="--category-accent:${meta.color};"></span>`;
}

function markerIconUrl(marker, variant = "active") {
  if (marker?.iconImage && MOB_ICON_URLS[marker.iconImage]) {
    return preferLocalAvif(MOB_ICON_URLS[marker.iconImage]);
  }
  return categoryAssetUrl(marker?.category, variant);
}

function buildCityLabelHtml(marker, isFound, isSelected) {
  const classes = ["city-map-label"];
  if (marker.minor) {
    classes.push("minor");
  }
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

  const error =
    samples.reduce((sum, sample) => {
      const point = applyTransform(transform, sample.x, sample.z);
      const dx = point.x * MAP_WIDTH - sample.pixelX;
      const dy = point.y * MAP_HEIGHT - sample.pixelY;
      return sum + Math.hypot(dx, dy);
    }, 0) / samples.length;

  return { ...transform, sampleCount: samples.length, averagePixelError: Number(error.toFixed(2)) };
}

function computeCalibrationTransform() {
  const samples = CALIBRATION_TARGETS.map((target) => {
    const sample = state.calibrationSamples[target.id];
    return sample ? { ...target, ...sample } : null;
  }).filter(Boolean);

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

function markerMatchesSearch(marker) {
  if (!state.search) {
    return true;
  }

  const haystack = [marker.title, marker.region, marker.description, ...(marker.tags || [])].join(" ").toLowerCase();

  return haystack.includes(state.search);
}

// Ingredient labels in guides often include counts. Strip those before matching
// against mob-drop tags so altar and turn-in tracking resolves to the real item.
function ingredientLookupKeys(ingredientName) {
  const raw = String(ingredientName || "").trim();
  if (!raw) {
    return [];
  }

  const seeds = new Set([
    raw,
    raw.replace(/^\s*\d+(?:-\d+)?\s*(?:x\s*)?/i, "").trim(),
    raw.replace(/^\s*(?:bring|collect|get|find)\s+/i, "").trim(),
  ]);
  const keys = new Set();

  for (const seed of seeds) {
    const normalized = normalizeMarkerLookup(seed);
    if (!normalized) {
      continue;
    }

    keys.add(normalized);
    keys.add(normalized.replace(/^\d+\s+/, "").trim());

    if (normalized.endsWith("ies")) {
      keys.add(`${normalized.slice(0, -3)}y`);
    } else if (normalized.endsWith("s")) {
      keys.add(normalized.slice(0, -1));
    } else {
      keys.add(`${normalized}s`);
    }
  }

  return [...keys].filter(Boolean);
}

function mobMarkersForIngredient(ingredientName) {
  const candidates = ingredientLookupKeys(ingredientName);
  if (!candidates.length) {
    return [];
  }
  const candidateSet = new Set(candidates);

  return state.markers
    .filter((marker) => isMobCategory(marker.category))
    .filter((marker) => {
      const normalizedTags = (marker.tags || []).map((tag) => normalizeMarkerLookup(tag));
      if (normalizedTags.some((tag) => candidateSet.has(tag))) {
        return true;
      }
      const searchHaystack = normalizeMarkerLookup([marker.title, marker.description, ...(marker.tags || [])].join(" "));
      return candidates.some((candidate) => searchHaystack.includes(candidate));
    })
    .sort((left, right) => left.title.localeCompare(right.title) || left.region.localeCompare(right.region));
}

function ingredientSearchLabel(ingredientName, matches) {
  const candidateSet = new Set(ingredientLookupKeys(ingredientName));
  for (const match of matches) {
    for (const tag of match.tags || []) {
      if (candidateSet.has(normalizeMarkerLookup(tag))) {
        return tag;
      }
    }
  }
  return String(ingredientName || "")
    .replace(/^\s*\d+(?:-\d+)?\s*(?:x\s*)?/i, "")
    .trim();
}

function focusIngredientMobs(ingredientName) {
  const matches = mobMarkersForIngredient(ingredientName);
  if (!matches.length) {
    return false;
  }

  const activeCategory = matches[0].category;
  const searchLabel = ingredientSearchLabel(ingredientName, matches);
  state.trackedIngredient = ingredientName;
  state.ingredientNoteDismissed = false;
  state.search = String(searchLabel || "").trim().toLowerCase();
  if (elements.searchInput) {
    elements.searchInput.value = searchLabel;
  }

  state.activeMobFamily = activeCategory;
  setPanelCollapsed(false);
  syncVisibleMarkers();
  renderSearchButton();
  renderCategoryFilters();
  renderPanelBanner();
  setSelectedMarker(matches[0].id);
  state.activeMobFamily = activeCategory;
  setPanelView("markers");
  renderCategoryFilters();
  return true;
}

function clearIngredientTracking() {
  const selected = getMarkerById(state.selectedMarkerId);
  state.trackedIngredient = "";
  state.ingredientNoteDismissed = false;
  state.search = "";
  state.activeMobFamily = null;
  if (elements.searchInput) {
    elements.searchInput.value = "";
  }
  if (selected && isMobCategory(selected.category)) {
    state.selectedMarkerId = null;
  }
  syncVisibleMarkers();
  renderSearchButton();
  renderCategoryFilters();
  renderPanelBanner();
  renderDetailCard();
  renderActiveAreaHighlight();
  setPanelView("markers");
}

function contentMarkersVisibleAtCurrentZoom() {
  return map.getZoom() >= CONTENT_MARKER_MIN_ZOOM;
}

function cityVisibleAtCurrentZoom(marker) {
  if (markerArea(marker) === "outer_void") {
    return true;
  }
  const zoom = map.getZoom();
  if (marker.minor) {
    return zoom >= MINOR_CITY_MIN_ZOOM;
  }
  return zoom >= MAJOR_CITY_MIN_ZOOM;
}

function markerIsVisible(marker) {
  if (markerArea(marker) !== state.currentArea) {
    return false;
  }

  if (marker.fixed) {
    if (!state.showCities) {
      return false;
    }
    if (!cityVisibleAtCurrentZoom(marker)) {
      return false;
    }
    if (state.hideFound && markerIsFound(marker)) {
      return false;
    }
    return markerMatchesSearch(marker);
  }

  const matchesSearch = markerMatchesSearch(marker);
  const searchSurfacedMob = Boolean(state.search) && isMobCategory(marker.category) && matchesSearch;
  if (isMobCategory(marker.category) && !searchSurfacedMob) {
    return false;
  }

  if (marker.contextOnly) {
    if (activeContextGroupId() !== marker.contextGroupId) {
      return false;
    }
    if (!contentMarkersVisibleAtCurrentZoom()) {
      return false;
    }
    return state.categoryFilter.has(marker.category);
  }

  if (!contentMarkersVisibleAtCurrentZoom() && !searchSurfacedMob) {
    return false;
  }
  if (!state.categoryFilter.has(marker.category) && !searchSurfacedMob) {
    return false;
  }
  if (state.hideFound && markerIsFound(marker)) {
    return false;
  }
  return matchesSearch;
}

function buildMarkerIcon(marker, isFound, isSelected) {
  const meta = CATEGORY_META[marker.category];
  const isTravelMarker = marker.category === "fast_travel" || marker.category === "seaskipper";
  const pinSize = isTravelMarker ? 20 : MAP_PIN_SIZE;
  const artSize = pinSize;
  if (marker.fixed) {
    return L.divIcon({
      className: "city-anchor-icon",
      html: "",
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });
  }

  const variant = isFound ? "locked" : "active";
  const iconUrl = markerIconUrl(marker, variant);
  const classes = ["asset-pin"];
  if (marker.iconImage && iconUrl) {
    classes.push("mob-pin");
  }
  if (isFound) {
    classes.push("found");
  }
  if (isSelected) {
    classes.push("selected");
  }

  const iconMarkup = iconUrl
    ? `<img class="${classes.join(" ")}" src="${iconUrl}" alt="" draggable="false" style="--pin-glow:${meta.color};width:${artSize}px;height:${artSize}px;">`
    : `<span class="generic-pin ${classes.join(" ")}" style="--pin-glow:${meta.color};--pin-fill:${meta.color};width:${artSize}px;height:${artSize}px;"></span>`;

  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="asset-pin-shell" style="width:${pinSize}px;height:${pinSize}px;">${iconMarkup}</span>`,
    iconSize: [pinSize, pinSize],
    iconAnchor: [pinSize / 2, pinSize / 2],
  });
}

function createMarkerLayer(marker) {
  const layer = L.marker(markerLatLng(marker), {
    icon: buildMarkerIcon(marker, markerIsFound(marker), false),
    title: marker.title,
    draggable: marker.fixed,
    autoPan: marker.fixed,
  });

  layer.on("mousedown", (event) => {
    const source = event.originalEvent;
    if (!source) {
      return;
    }
    state.markerPointerPress = {
      markerId: marker.id,
      x: source.clientX,
      y: source.clientY,
      moved: false,
    };
  });
  layer.on("click", (event) => {
    if (Date.now() < state.suppressMarkerClickUntil) {
      event.originalEvent?.stopPropagation?.();
      return;
    }
    event.originalEvent?.stopPropagation?.();
    setSelectedMarker(marker.id);
  });
  if (marker.fixed) {
    bindCityTooltip(layer, marker, markerIsFound(marker), false);
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

      state.suppressMarkerClickUntil = Date.now() + 250;
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
  } else {
    layer.bindTooltip(marker.title, {
      direction: "top",
      offset: [0, -10],
      opacity: 0.94,
      sticky: true,
    });
  }
  state.markerLayers.set(marker.id, layer);
}

function markerRenderStateKey(marker, isVisible, isFound, isSelected) {
  return [
    isVisible ? 1 : 0,
    isFound ? 1 : 0,
    isSelected ? 1 : 0,
    marker.fixed && state.editCities ? 1 : 0,
    marker.fixed ? "city" : "pin",
  ].join(":");
}

function applyMarkerLayerVisual(marker, layer, isVisible, isFound, isSelected) {
  if (isVisible) {
    if (!map.hasLayer(layer)) {
      layer.addTo(map);
    }
  } else if (map.hasLayer(layer)) {
    map.removeLayer(layer);
  }

  if (marker.fixed && layer.dragging) {
    if (state.editCities) {
      layer.dragging.enable();
    } else {
      layer.dragging.disable();
    }
  }

  const nextKey = markerRenderStateKey(marker, isVisible, isFound, isSelected);
  if (state.markerRenderCache.get(marker.id) === nextKey) {
    return;
  }

  layer.setIcon(buildMarkerIcon(marker, isFound, isSelected));
  if (marker.fixed) {
    bindCityTooltip(layer, marker, isFound, isSelected);
  }
  state.markerRenderCache.set(marker.id, nextKey);
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
    const marker = getMarkerById(id);
    if (!marker) {
      continue;
    }
    layer.setLatLng(markerLatLng(marker));
  }
  renderActiveAreaHighlight();
}

function categoryCount(categoryId) {
  return state.markers.filter(
    (marker) =>
      marker.category === categoryId && !marker.fixed && !marker.contextOnly && markerArea(marker) === state.currentArea
  ).length;
}

function categoryVisibleCount(categoryId) {
  return state.filteredMarkers.filter(
    (marker) =>
      marker.category === categoryId && !marker.fixed && !marker.contextOnly && markerArea(marker) === state.currentArea
  ).length;
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = CATEGORY_GROUPS.map((group) => {
    if (group.id === "mobs") {
      const cards = group.categories
        .map((categoryId) => {
          const meta = CATEGORY_META[categoryId];
          const total = categoryCount(categoryId);
          const matching = filteredMobFamilyMarkers(categoryId).length;
          const active = state.activeMobFamily === categoryId;
          const metaText = active
            ? `${matching} ${matching === 1 ? "mob" : "mobs"} listed`
            : state.search && matching
              ? `${matching} matching`
              : `${total} ${total === 1 ? "type" : "types"}`;
          const iconMarkup = genericIconMarkup(categoryId, "category-icon");
          return `
          <div class="mob-family-stack ${active ? "active" : ""}">
            <button type="button" class="category-card ${active ? "active" : "inactive"} mob-family-card" data-mob-family="${categoryId}">
              ${iconMarkup}
              <span class="category-copy">
                <strong>${escapeHtml(meta.label)}</strong>
                <span class="category-meta">${metaText}</span>
              </span>
              <span class="category-count">${total}</span>
            </button>
            ${
              active
                ? `
              <section class="mob-browser-panel">
                <div class="mob-browser-head">
                  <div class="mob-browser-copy">
                    <span class="mob-browser-kicker">Mob Browser</span>
                    <strong>${escapeHtml(meta.label)}</strong>
                  </div>
                  <button type="button" class="mob-browser-close" data-close-mob-family="1" aria-label="Close mob family list">×</button>
                </div>
                ${
                  state.trackedIngredient
                    ? `
                  <div class="mob-tracking-strip">
                    <div class="mob-tracking-copy">
                      <span>Tracking ${escapeHtml(state.trackedIngredient)}</span>
                    </div>
                    <button type="button" class="text-action" data-clear-ingredient-tracking="1">Cancel tracking</button>
                  </div>
                `
                    : ""
                }
                <p class="mob-browser-note">Pick a mob and the map will outline every exact spawn node we have for it.</p>
                <div class="mob-browser-list">
                  ${
                    activeMobFamilyMarkers().length
                      ? activeMobFamilyMarkers()
                          .map((marker) => {
                            const selected = marker.id === state.selectedMarkerId;
                            const secondary = [
                              marker.region || "World",
                              `${marker.spawnPointCount || 0} ${marker.spawnPointCount === 1 ? "node" : "nodes"}`,
                            ].join(" · ");
                            const mobIconUrl = markerIconUrl(marker, "active");
                            return `
                        <button
                          type="button"
                          class="mob-list-item ${selected ? "active" : ""}"
                          data-mob-marker="${marker.id}"
                        >
                          <span class="mob-list-icon-shell">
                            ${
                              mobIconUrl
                                ? `<img class="mob-list-icon" src="${escapeAttribute(mobIconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                                : genericIconMarkup(marker.category, "mob-list-icon generic-category-icon")
                            }
                          </span>
                          <span class="mob-list-copy">
                            <strong>${escapeHtml(marker.title)}</strong>
                            <span>${escapeHtml(secondary)}</span>
                          </span>
                          <span class="mob-list-count">${marker.spawnPointCount || 0}</span>
                        </button>
                      `;
                          })
                          .join("")
                      : `<div class="mob-browser-empty">No ${escapeHtml(meta.label.toLowerCase())} match the current search.</div>`
                  }
                </div>
              </section>
            `
                : ""
            }
          </div>
        `;
        })
        .join("");

      return `
        <section class="category-section">
          <div class="section-head">
            <span>${escapeHtml(group.label)}</span>
          </div>
          <div class="category-grid mob-category-grid">${cards}</div>
        </section>
      `;
    }

    const cards = group.categories
      .map((categoryId) => {
        const meta = CATEGORY_META[categoryId];
        const active = state.categoryFilter.has(categoryId);
        const total = categoryCount(categoryId);
        const visible = categoryVisibleCount(categoryId);
        const iconUrl = categoryAssetUrl(categoryId, active ? "active" : "locked");
        const iconMarkup = iconUrl
          ? `<span class="category-icon asset-icon" style="--category-icon:url('${iconUrl}');--category-accent:${meta.color};"></span>`
          : genericIconMarkup(categoryId, "category-icon");
        return `
        <button type="button" class="category-card ${active ? "active" : "inactive"}" data-category="${categoryId}">
          ${iconMarkup}
          <span class="category-copy">
            <strong>${escapeHtml(meta.label)}</strong>
            <span class="category-meta">${active ? `${visible} shown` : state.search && visible ? `${visible} matching` : "Hidden"}</span>
          </span>
          <span class="category-count">${total}</span>
        </button>
      `;
      })
      .join("");

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

  elements.categoryFilters.querySelectorAll("[data-mob-family]").forEach((button) => {
    button.addEventListener("click", () => {
      const categoryId = button.dataset.mobFamily;
      const nextFamily = state.activeMobFamily === categoryId ? null : categoryId;
      const selected = state.markers.find((marker) => marker.id === state.selectedMarkerId);
      state.activeMobFamily = nextFamily;
      if (!nextFamily && selected && isMobCategory(selected.category)) {
        state.selectedMarkerId = null;
      }
      if (nextFamily && selected && isMobCategory(selected.category) && selected.category !== nextFamily) {
        state.selectedMarkerId = null;
      }
      syncVisibleMarkers();
      renderCategoryFilters();
      renderDetailCard();
    });
  });

  elements.categoryFilters.querySelectorAll("[data-mob-marker]").forEach((button) => {
    button.addEventListener("click", () => {
      const marker = state.markers.find((entry) => entry.id === button.dataset.mobMarker);
      if (!marker) {
        return;
      }
      state.activeMobFamily = marker.category;
      flyToMarker(marker);
      renderCategoryFilters();
    });
  });

  elements.categoryFilters.querySelectorAll("[data-close-mob-family]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = state.markers.find((marker) => marker.id === state.selectedMarkerId);
      state.trackedIngredient = "";
      state.activeMobFamily = null;
      if (selected && isMobCategory(selected.category)) {
        state.selectedMarkerId = null;
      }
      state.search = "";
      if (elements.searchInput) {
        elements.searchInput.value = "";
      }
      syncVisibleMarkers();
      renderCategoryFilters();
      renderDetailCard();
    });
  });

  elements.categoryFilters.querySelectorAll("[data-clear-ingredient-tracking]").forEach((button) => {
    button.addEventListener("click", () => {
      clearIngredientTracking();
    });
  });

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
      <p>Select a marker to view notes, rewards, routes, and source links.</p>
    `;
    if (elements.studioCard) {
      elements.studioCard.className = "detail-card empty";
      elements.studioCard.innerHTML = `
        <h2>No marker selected</h2>
        <p>Select a marker to open its editor here.</p>
      `;
    }
    if (elements.linkCard) {
      elements.linkCard.className = "detail-card empty";
      elements.linkCard.innerHTML = `
        <h2>No marker selected</h2>
        <p>Select a quest or secret discovery to view its linked video.</p>
      `;
    }
    return;
  }

  // Heavy guide bundles now load by category on demand so the map can paint quickly.
  void ensureMarkerContentLoaded(marker);

  const point = markerPoint(marker);
  const world = marker.position?.world || imageToWorld(point.x, point.y);
  const isFound = markerIsFound(marker);
  const supportsFound = markerSupportsFound(marker);
  const meta = CATEGORY_META[marker.category];
  const iconUrl = marker.fixed ? CITY_ICON_URL : markerIconUrl(marker, isFound ? "locked" : "active");
  const detailIcon = marker.fixed
    ? `<span class="detail-icon city" style="--detail-icon:url('${iconUrl}');"></span>`
    : iconUrl
      ? `<span class="detail-icon ${marker.iconImage ? "mob-detail-icon" : ""}" style="--detail-icon:url('${iconUrl}');--detail-accent:${meta.color};"></span>`
      : genericIconMarkup(marker.category, "detail-icon generic-detail-icon");
  const content = contentExportEntry(marker);
  const authoredContent = markerContentAuthorEntry(marker.id);
  const contentLoading = !contentSourceLoaded(marker.category);
  const contentError = contentSourceLoadError(marker.category);
  const eventIntel = worldEventDetailsHtml(marker);
  const detailMeta = [
    `<span class="detail-pill">${escapeHtml(marker.region || "World")}</span>`,
    `<span class="detail-pill">${world.x}, ${world.z}</span>`,
  ].join("");
  const actionButtons = [
    supportsFound
      ? `<button type="button" class="detail-button" data-action="toggle-found">${isFound ? "Mark not found" : "Mark found"}</button>`
      : "",
    `<button type="button" class="detail-button secondary" data-action="focus">Focus</button>`,
    `<button type="button" class="detail-button secondary" data-action="share">Share</button>`,
  ]
    .filter(Boolean)
    .join("");
  const infoBody = `
    <div class="detail-topline">
      ${detailIcon}
      <div>
        <h2>${escapeHtml(marker.title)}</h2>
        <p class="detail-kind">${escapeHtml(meta.label)}</p>
      </div>
    </div>
    <div class="detail-meta">${detailMeta}</div>
    ${eventIntel}
    <div class="detail-actions">
      ${actionButtons}
    </div>
    ${encounterNavigatorHtml(marker)}
    <section class="content-preview-panel">
      <div class="content-preview-head">
        <h3>Guide & Reference</h3>
      </div>
      <div id="content-preview-body" class="content-preview-body">
        ${contentLoading ? `<div class="content-loading">Loading guide content…</div>` : ""}
        ${contentError ? `<div class="content-load-error">Guide content could not be loaded right now.</div>` : ""}
        ${contentPreviewHtml(marker, content)}
      </div>
    </section>
  `;

  elements.detailCard.className = "detail-card";
  elements.detailCard.innerHTML = infoBody;

  if (elements.linkCard) {
    elements.linkCard.className = "detail-card";
    elements.linkCard.innerHTML = `
      <div class="detail-topline compact">
        <div>
          <h2>${escapeHtml(marker.title)}</h2>
          <p class="detail-kind">Linked Video</p>
        </div>
      </div>
      ${videoGuidePreviewHtml(marker, content)}
    `;
  }

  if (elements.studioCard) {
    elements.studioCard.className = "detail-card";
    elements.studioCard.innerHTML = `
      ${infoBody}
      ${contentEditorHtml(marker, authoredContent)}
    `;
  }

  const interactiveRoot = elements.studioCard || elements.detailCard;

  interactiveRoot.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "toggle-found") {
        toggleFound(marker.id);
      } else if (action === "focus") {
        flyToMarker(marker);
      } else if (action === "share") {
        const original = button.textContent;
        copyText(markerShareUrl(window.location.href, marker.title)).then((ok) => {
          button.textContent = ok ? "Copied link" : "Copy failed";
          window.setTimeout(() => {
            button.textContent = original;
          }, 1400);
        });
      }
    });
  });

  interactiveRoot.querySelectorAll("[data-context-marker]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.markers.find((item) => item.id === button.dataset.contextMarker);
      if (!target) {
        return;
      }
      flyToMarker(target);
    });
  });

  interactiveRoot.querySelectorAll("[data-ingredient-mobs]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ingredient = button.dataset.ingredientMobs || "";
      focusIngredientMobs(ingredient);
    });
  });

  document.querySelectorAll("[data-preview-image]").forEach((button) => {
    button.addEventListener("click", () => {
      openImageLightbox(button.dataset.previewImage, button.dataset.previewCaption || marker.title);
    });
  });

  const previewBodies = [...document.querySelectorAll("#content-preview-body")];
  const saveNote = interactiveRoot.querySelector(".content-save-note");
  const fields = interactiveRoot.querySelectorAll("[data-content-field]");

  if (elements.studioCard) {
    fields.forEach((field) => {
      field.addEventListener("input", () => {
        updateMarkerContent(marker, field.dataset.contentField, field.value);
        const entry = markerContentEntry(marker);
        previewBodies.forEach((previewBody) => {
          previewBody.innerHTML = contentPreviewHtml(marker, entry);
        });
        saveNote.textContent = "Saved locally.";
      });
    });

    interactiveRoot.querySelectorAll("[data-content-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.contentAction;
        if (action === "copy-marker") {
          const ok = await copyText(JSON.stringify(contentExportEntry(marker), null, 2));
          saveNote.textContent = ok ? "Marker JSON copied." : "Clipboard copy failed.";
        } else if (action === "copy-all") {
          const payload = state.markers
            .map((item) => contentExportEntry(item))
            .filter((entry) => hasMarkerContent(entry));
          const ok = await copyText(JSON.stringify(payload, null, 2));
          saveNote.textContent = ok ? "All authored marker content copied." : "Clipboard copy failed.";
        }
      });
    });
  }
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
    : editedCount >= 3
      ? " City-fit could not be solved from the current edits."
      : " Move at least 3 cities to solve the full map transform.";
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

  elements.calibrationOutput.textContent = JSON.stringify(
    {
      target: current.id,
      samples: state.calibrationSamples,
      transform: solved,
    },
    null,
    2
  );
}

function setPanelCollapsed(collapsed) {
  state.panelCollapsed = collapsed;
  elements.panel.classList.toggle("collapsed", collapsed);
  elements.appShell?.classList.toggle("panel-collapsed", collapsed);
  if (elements.panelToggle) {
    elements.panelToggle.setAttribute("aria-expanded", String(!collapsed));
    elements.panelToggle.setAttribute("aria-label", collapsed ? "Open marker panel" : "Collapse marker panel");
  }
}

function closeIntroModal() {
  state.introDismissed = true;
  persistIntroDismissed();
  if (!elements.introModal) {
    return;
  }
  elements.introModal.classList.add("hidden");
  elements.introModal.setAttribute("aria-hidden", "true");
}

function maybeOpenIntroModal() {
  if (!elements.introModal || state.introDismissed) {
    return;
  }
  elements.introModal.classList.remove("hidden");
  elements.introModal.setAttribute("aria-hidden", "false");
}

function updateMapSelector() {
  const area = MAP_AREAS[state.currentArea];
  if (elements.mapSelectorLabel && area) {
    elements.mapSelectorLabel.textContent = area.buttonLabel;
  }
  if (elements.mapSelector) {
    elements.mapSelector.setAttribute("aria-expanded", String(HAS_MULTIPLE_MAP_AREAS && state.mapSelectorOpen));
    elements.mapSelector.classList.toggle("single-area", !HAS_MULTIPLE_MAP_AREAS);
    elements.mapSelector.disabled = !HAS_MULTIPLE_MAP_AREAS;
  }
  if (elements.mapSelectorMenu) {
    elements.mapSelectorMenu.classList.toggle("hidden", !state.mapSelectorOpen);
    elements.mapSelectorMenu.innerHTML = HAS_MULTIPLE_MAP_AREAS
      ? Object.values(MAP_AREAS)
          .map(
            (mapArea) => `
      <button
        type="button"
        class="map-selector-option ${mapArea.id === state.currentArea ? "active" : ""}"
        data-map-area="${mapArea.id}"
        role="menuitemradio"
        aria-checked="${mapArea.id === state.currentArea ? "true" : "false"}"
      >
        <span class="map-selector-option-label">
          <strong>${escapeHtml(mapArea.buttonLabel)}</strong>
        </span>
      </button>
    `
          )
          .join("")
      : "";
  }
}

function setMapSelectorOpen(open) {
  state.mapSelectorOpen = HAS_MULTIPLE_MAP_AREAS ? open : false;
  updateMapSelector();
}

function setCurrentArea(areaId) {
  if (!MAP_AREAS[areaId] || state.currentArea === areaId) {
    setMapSelectorOpen(false);
    updateMapSelector();
    return;
  }

  state.currentArea = areaId;
  baseMapOverlay.setUrl(MAP_AREAS[areaId].imageUrl);

  const selected = state.markers.find((marker) => marker.id === state.selectedMarkerId);
  if (selected && markerArea(selected) !== areaId) {
    state.selectedMarkerId = null;
    state.activeMobFamily = null;
  }

  map.fitBounds(MAP_BOUNDS, { padding: [24, 24], animate: false });
  if (areaId === "outer_void" && map.getZoom() < MINOR_CITY_MIN_ZOOM) {
    map.setZoom(MINOR_CITY_MIN_ZOOM, { animate: false });
  }
  state.mapSelectorOpen = false;
  updateMapSelector();
  syncVisibleMarkers();
  renderCategoryFilters();
  renderDetailCard();
  renderActiveAreaHighlight();
}

function applyInitialMarkerDeepLink() {
  const marker = findMarkerByTitle(state.markers, INITIAL_MARKER_QUERY);
  if (!marker) {
    return;
  }

  if (!MAP_AREAS[markerArea(marker)]) {
    return;
  }

  ensureMarkerSelectable(marker);
  const areaId = markerArea(marker);
  if (areaId !== state.currentArea) {
    setCurrentArea(areaId);
  }
  updateMapSelector();
  syncVisibleMarkers();
  renderCategoryFilters();

  const targetZoom = markerDisplayZoom(marker);
  map.setView(markerLatLng(marker), targetZoom, { animate: false });
  setSelectedMarker(marker.id);
}

function worldBoundsToLatLng(bounds) {
  if (!bounds) {
    return null;
  }

  const corners = [
    worldToImage(bounds.minX, bounds.minZ),
    worldToImage(bounds.minX, bounds.maxZ),
    worldToImage(bounds.maxX, bounds.minZ),
    worldToImage(bounds.maxX, bounds.maxZ),
  ].map((point) => [point.y * MAP_HEIGHT, point.x * MAP_WIDTH]);

  const lats = corners.map(([lat]) => lat);
  const lngs = corners.map(([, lng]) => lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function markerBoundsLatLngList(marker) {
  const sourceBounds =
    Array.isArray(marker.spawnNodes) && marker.spawnNodes.length
      ? marker.spawnNodes
      : Array.isArray(marker.spawnRegions) && marker.spawnRegions.length
        ? marker.spawnRegions
        : marker.spawnBounds
          ? [marker.spawnBounds]
          : [];

  return sourceBounds.map((bounds) => worldBoundsToLatLng(bounds)).filter(Boolean);
}

function fastTravelLinkedMarkers(marker) {
  if (marker?.category !== "fast_travel") {
    return [];
  }

  const entry = markerContentEntry(marker);
  const connectedRaw = String(entry.explanation || "").match(/•\s*Connected stops:\s*([^\n]+)/i)?.[1] || "";
  const connectedStops = [
    ...new Set(
      connectedRaw
        .split(",")
        .map((item) => item.trim().replace(/\.$/, ""))
        .filter(Boolean)
    ),
  ];
  if (!connectedStops.length) {
    return [];
  }

  const connectedSet = new Set(connectedStops.map((item) => item.toLowerCase()));
  return state.markers.filter(
    (candidate) =>
      candidate.id !== marker.id &&
      candidate.category === "fast_travel" &&
      markerArea(candidate) === markerArea(marker) &&
      candidate.region === marker.region &&
      connectedSet.has(
        String(candidate.title || "")
          .trim()
          .toLowerCase()
      )
  );
}

function renderActiveAreaHighlight() {
  if (state.areaHighlightLayer) {
    map.removeLayer(state.areaHighlightLayer);
    state.areaHighlightLayer = null;
  }
  if (state.travelLinkLayer) {
    map.removeLayer(state.travelLinkLayer);
    state.travelLinkLayer = null;
  }

  const marker = getMarkerById(state.selectedMarkerId);
  const visible = marker ? isMobCategory(marker.category) || state.filteredMarkerIdSet.has(marker.id) : false;
  if (!marker || !visible) {
    return;
  }

  if (marker.category === "fast_travel") {
    const linked = fastTravelLinkedMarkers(marker);
    if (linked.length) {
      const meta = CATEGORY_META.fast_travel;
      state.travelLinkLayer = L.featureGroup(
        linked.map((target) =>
          L.polyline([markerLatLng(marker), markerLatLng(target)], {
            color: meta.color,
            weight: 3,
            opacity: 0.92,
            dashArray: "10 8",
            lineCap: "round",
            interactive: false,
          })
        )
      ).addTo(map);
      state.travelLinkLayer.eachLayer((layer) => layer.bringToBack());
    }
  }

  const boundsList = markerBoundsLatLngList(marker);
  if (!boundsList.length) {
    return;
  }

  const meta = CATEGORY_META[marker.category];
  const approximate = Boolean(marker.spawnZoneApproximate);
  state.areaHighlightLayer = L.featureGroup(
    boundsList.map((bounds) =>
      L.rectangle(bounds, {
        color: meta.color,
        weight: approximate ? 2 : 3,
        opacity: 0.9,
        fillColor: meta.color,
        fillOpacity: approximate ? 0.05 : 0.08,
        dashArray: approximate ? "9 7" : "4 4",
        interactive: false,
      })
    )
  ).addTo(map);
  state.areaHighlightLayer.eachLayer((layer) => layer.bringToBack());
}

function setSelectedMarker(markerId) {
  state.selectedMarkerId = markerId;
  const marker = getMarkerById(markerId);
  if (marker && isMobCategory(marker.category)) {
    state.activeMobFamily = marker.category;
  }

  if (DEV_MODE && elements.studioCard) {
    setPanelView("studio");
  } else {
    setPanelView("info");
  }

  setPanelCollapsed(false);
  syncVisibleMarkers();
  renderDetailCard();
  renderActiveAreaHighlight();
  renderCategoryFilters();
}

function clearSelectedMarker({ resetMobFamily = true } = {}) {
  if (!state.selectedMarkerId && (!resetMobFamily || !state.activeMobFamily)) {
    return;
  }

  state.selectedMarkerId = null;
  if (resetMobFamily) {
    state.activeMobFamily = null;
  }
  syncVisibleMarkers();
  renderCategoryFilters();
  renderDetailCard();
  renderActiveAreaHighlight();
}

function flyToMarker(marker) {
  map.flyTo(markerLatLng(marker), Math.max(map.getZoom(), 0), { duration: 0.55 });
  setSelectedMarker(marker.id);
}

function toggleFound(markerId) {
  const marker = state.markers.find((item) => item.id === markerId);
  if (!marker || !markerSupportsFound(marker)) {
    return;
  }

  if (state.foundIds.has(markerId)) {
    state.foundIds.delete(markerId);
  } else {
    state.foundIds.add(markerId);
  }

  persistFoundIds();
  syncVisibleMarkers();
  renderCategoryFilters();
  renderDetailCard();
  renderActiveAreaHighlight();
}

function syncVisibleMarkers() {
  state.filteredMarkers = state.markers.filter(markerIsVisible);
  state.filteredMarkerIdSet = new Set(state.filteredMarkers.map((marker) => marker.id));

  for (const marker of state.markers) {
    const layer = state.markerLayers.get(marker.id);
    if (!layer) {
      continue;
    }
    const visible = state.filteredMarkerIdSet.has(marker.id);
    const isFound = markerIsFound(marker);
    const isSelected = marker.id === state.selectedMarkerId;
    applyMarkerLayerVisual(marker, layer, visible, isFound, isSelected);
  }
  renderActiveAreaHighlight();
}

function hydrateMarkerState() {
  const fixedCities = STARTER_MARKERS.map((marker) => ({ ...marker, fixed: true }));
  // Curated overlays override generic wiki imports where they carry better names or event metadata.
  const curatedSupplemental = CURATED_MARKERS;
  const wikiMarkers = WIKI_MAP_MARKERS.map((marker) =>
    marker.id === "atlas-quests-the-qira-hive-372--5501" ? { ...marker, contextGroupId: "qira-hive" } : marker
  ).filter((marker) => marker.category !== "world_events");
  state.markers = [...fixedCities, ...curatedSupplemental, ...wikiMarkers];
  state.markerIndex = new Map(state.markers.map((marker) => [marker.id, marker]));
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

  elements.panelTabs.forEach((button) => {
    button.addEventListener("click", () => {
      setPanelView(button.dataset.panelView);
    });
  });

  if (elements.mapSelector && HAS_MULTIPLE_MAP_AREAS) {
    elements.mapSelector.addEventListener("click", (event) => {
      event.stopPropagation();
      setMapSelectorOpen(!state.mapSelectorOpen);
    });
  }

  if (elements.mapSelectorMenu && HAS_MULTIPLE_MAP_AREAS) {
    elements.mapSelectorMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-map-area]");
      if (!button) {
        return;
      }
      setCurrentArea(button.dataset.mapArea);
    });
  }

  if (elements.panelBanner) {
    elements.panelBanner.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dismiss-ingredient-note]");
      if (!button) {
        return;
      }
      state.ingredientNoteDismissed = true;
      renderPanelBanner();
    });
  }

  document.addEventListener("click", (event) => {
    if (!HAS_MULTIPLE_MAP_AREAS || !state.mapSelectorOpen) {
      return;
    }
    if (event.target.closest(".map-selector-wrap")) {
      return;
    }
    setMapSelectorOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (state.calibrationMode || !state.selectedMarkerId) {
      return;
    }
    if (
      event.target.closest(".marker-panel") ||
      event.target.closest(".panel-edge-toggle") ||
      event.target.closest(".leaflet-marker-icon") ||
      event.target.closest(".map-pin-wrapper") ||
      event.target.closest(".asset-pin-shell") ||
      event.target.closest(".leaflet-control") ||
      event.target.closest(".image-lightbox") ||
      event.target.closest(".intro-modal")
    ) {
      return;
    }
    clearSelectedMarker();
  });

  map.on("click", (event) => {
    if (state.calibrationMode) {
      recordCalibrationSample(event.latlng);
      return;
    }
  });

  map.getContainer().addEventListener("click", (event) => {
    if (state.calibrationMode) {
      return;
    }
    if (
      event.target.closest(".leaflet-marker-icon") ||
      event.target.closest(".map-pin-wrapper") ||
      event.target.closest(".asset-pin-shell") ||
      event.target.closest(".leaflet-control")
    ) {
      return;
    }
    clearSelectedMarker();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderSearchButton();
    syncVisibleMarkers();
    renderCategoryFilters();
  });

  elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.search = "";
    if (state.trackedIngredient) {
      state.trackedIngredient = "";
      state.ingredientNoteDismissed = false;
      state.activeMobFamily = null;
    }
    renderSearchButton();
    syncVisibleMarkers();
    renderCategoryFilters();
    renderPanelBanner();
  });

  elements.hideFoundToggle.addEventListener("change", (event) => {
    state.hideFound = event.target.checked;
    syncVisibleMarkers();
    renderCategoryFilters();
    renderDetailCard();
    renderActiveAreaHighlight();
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
      renderActiveAreaHighlight();
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

  if (elements.lightboxClose) {
    elements.lightboxClose.addEventListener("click", () => {
      closeImageLightbox();
    });
  }

  if (elements.lightbox) {
    elements.lightbox.addEventListener("click", (event) => {
      if (event.target === elements.lightbox) {
        closeImageLightbox();
      }
    });
  }

  if (elements.introClose) {
    elements.introClose.addEventListener("click", () => {
      closeIntroModal();
    });
  }

  if (elements.introStart) {
    elements.introStart.addEventListener("click", () => {
      closeIntroModal();
    });
  }

  if (elements.introModal) {
    elements.introModal.addEventListener("click", (event) => {
      if (event.target === elements.introModal) {
        closeIntroModal();
      }
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeImageLightbox();
      closeIntroModal();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.found) {
      state.foundIds = loadFoundIds();
      syncVisibleMarkers();
      renderCategoryFilters();
      renderDetailCard();
      renderActiveAreaHighlight();
      return;
    }

    if (event.key === STORAGE_KEYS.theme) {
      applyTheme(event.newValue === "dark" ? "dark" : "light", { persist: false });
      return;
    }

    if (event.key === STORAGE_KEYS.markerContent) {
      state.markerContent = loadMarkerContent();
      renderDetailCard();
    }
  });

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

  document.addEventListener("mousemove", (event) => {
    if (!state.markerPointerPress) {
      return;
    }
    const deltaX = event.clientX - state.markerPointerPress.x;
    const deltaY = event.clientY - state.markerPointerPress.y;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      state.markerPointerPress.moved = true;
    }
  });

  document.addEventListener("mouseup", () => {
    if (state.markerPointerPress?.moved) {
      state.suppressMarkerClickUntil = Date.now() + 250;
    }
    state.markerPointerPress = null;
  });

  map.on("mousemove", (event) => {
    updateCoordinateReadout(event.latlng);
  });
  map.on("mouseout", () => {
    resetCoordinateReadout();
  });
  map.on("zoomend", () => {
    syncVisibleMarkers();
    renderCategoryFilters();
  });
}

hydrateMarkerState();
state.cityTransform = USE_CITY_EDITS ? computeCityEditTransform() : null;
bindEvents();
setPanelCollapsed(state.panelCollapsed);
setPanelView("markers");
renderPanelBanner();
renderSearchButton();
updateMapSelector();
renderCalibrationMarkers();
syncVisibleMarkers();
renderCategoryFilters();
renderDetailCard();
renderCityEditor();
renderCalibrationPanel();
applyInitialMarkerDeepLink();
maybeOpenIntroModal();
