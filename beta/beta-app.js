import { CATEGORY_META, CATEGORY_ORDER, CURATED_MARKERS, STARTER_MARKERS } from "./data/markers.js?v=20260518u";
import { WIKI_MAP_MARKERS } from "../data/wiki-map-markers.js?v=20260518j";
import { MARKER_CONTENT } from "./data/marker-content.js?v=20260518u";
import { MOB_ICON_URLS } from "../data/mob-icon-urls.js?v=20260518j";
import { REFERENCE_IMAGE_URLS } from "../data/reference-images.js?v=20260518j";

const MAP_WIDTH = 4608;
const MAP_HEIGHT = 6644;
const MAP_PIN_SIZE = 56;
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
  areaOffsets: "wynninteractive-beta-area-offsets-v1",
  markerContent: "wynninteractive-marker-content-v1",
};
const CONTENT_BOOK_ROOT = new URL("../assets/content-book/", import.meta.url).href.replace(/\/$/, "");
const CITY_ICON_URL = new URL("../assets/icon.png", import.meta.url).href;
const MAP_AREAS = {
  wynn: {
    id: "wynn",
    label: "Wynn",
    buttonLabel: "Wynncraft Map",
    imageUrl: new URL("../assets/map/WynncraftMapFruma.png", import.meta.url).href,
  },
  outer_void: {
    id: "outer_void",
    label: "Outer Void",
    buttonLabel: "Outer Void",
    imageUrl: new URL("../assets/map/OuterVoid.png", import.meta.url).href,
  },
};
const query = new URLSearchParams(window.location.search);
const CALIBRATION_MODE = query.get("calibrate") === "1";
const USE_STORED_CALIBRATION = CALIBRATION_MODE || query.get("useCalibration") === "1";
const EDIT_CITY_QUERY_MODE = query.get("editCities") === "1";
const USE_CITY_EDITS = EDIT_CITY_QUERY_MODE || query.get("useCityEdits") === "1";
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
  CATEGORY_ORDER.filter((categoryId) => !DEFAULT_HIDDEN_CATEGORIES.has(categoryId)),
);

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
  areaHighlightLayer: null,
  categoryFilter: new Set(DEFAULT_CATEGORY_FILTER),
  calibrationMode: CALIBRATION_MODE,
  calibrationSamples: loadCalibrationSamples(),
  calibrationIndex: 0,
  calibrationLayers: new Map(),
  activeTransform: USE_STORED_CALIBRATION ? loadCalibrationTransform() : null,
  editCities: EDIT_CITY_QUERY_MODE,
  cityEdits: USE_CITY_EDITS ? loadCityEdits() : {},
  cityTransform: null,
  markerContent: { ...MARKER_CONTENT, ...loadMarkerContent() },
  panelView: "markers",
  activeMobFamily: null,
  currentArea: "wynn",
  mapSelectorOpen: false,
  areaOffsets: loadAreaOffsets(),
  areaOffsetMode: false,
  areaOffsetDrag: null,
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
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
});

const baseMapOverlay = L.imageOverlay(MAP_AREAS.wynn.imageUrl, MAP_BOUNDS).addTo(map);
map.fitBounds(MAP_BOUNDS, { padding: [24, 24] });

function updatePinScale() {
  const zoom = map.getZoom();
  const scale = zoom <= 0 ? 1 : 1 + (zoom * 0.28) + (zoom * zoom * 0.05);
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

function loadAreaOffsets() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.areaOffsets) || "{}");
    return Object.fromEntries(
      Object.entries(raw).map(([areaId, value]) => [
        areaId,
        {
          x: Number.isFinite(Number(value?.x)) ? Number(value.x) : 0,
          y: Number.isFinite(Number(value?.y)) ? Number(value.y) : 0,
        },
      ]),
    );
  } catch {
    return {};
  }
}

function persistAreaOffsets() {
  localStorage.setItem(STORAGE_KEYS.areaOffsets, JSON.stringify(state.areaOffsets));
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

function markerArea(marker) {
  return marker.area || "wynn";
}

function areaOffset(areaId) {
  return state.areaOffsets[areaId] || { x: 0, y: 0 };
}

function applyAreaOffsetToPoint(point, areaId) {
  const offset = areaOffset(areaId);
  return {
    x: point.x + (offset.x / MAP_WIDTH),
    y: point.y + (offset.y / MAP_HEIGHT),
  };
}

function markerPoint(marker) {
  let point;
  if (marker.fixed && state.cityEdits[marker.id]) {
    point = {
      x: clamp(state.cityEdits[marker.id].x / MAP_WIDTH, 0, 1),
      y: clamp(state.cityEdits[marker.id].y / MAP_HEIGHT, 0, 1),
    };
  } else if (marker.position?.image) {
    point = marker.position.image;
  } else if (marker.position?.world) {
    point = worldToImage(marker.position.world.x, marker.position.world.z);
  } else {
    point = marker.position;
  }
  return applyAreaOffsetToPoint(point, markerArea(marker));
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

function escapeAttribute(value) {
  return escapeHtml(value ?? "");
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

function splitMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function markerSupportsFound(marker) {
  return !marker.fixed && !PASSIVE_CATEGORIES.has(marker.category);
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
    tutorials: Array.isArray(entry.tutorials) ? entry.tutorials : splitMultiline(entry.tutorials || ""),
  };
}

function markerContentEntry(marker) {
  const entry = markerContentAuthorEntry(marker.id);
  const fallbackSummary = LOW_VALUE_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(marker.description || ""))
    ? ""
    : (marker.description || "");
  return {
    ...entry,
    summary: entry.summary || fallbackSummary,
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
    entry.tutorials.length
  );
}

function extractGoogleDriveId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("drive.google.com")) {
      return null;
    }

    const directId = parsed.searchParams.get("id");
    if (directId) {
      return directId;
    }

    const parts = parsed.pathname.split("/");
    const fileIndex = parts.indexOf("d");
    if (fileIndex >= 0 && parts[fileIndex + 1]) {
      return parts[fileIndex + 1];
    }
  } catch {
    return null;
  }

  return null;
}

function resolveImageUrl(url) {
  if (MOB_ICON_URLS[url]) {
    return MOB_ICON_URLS[url];
  }
  if (REFERENCE_IMAGE_URLS[url]) {
    return REFERENCE_IMAGE_URLS[url];
  }
  const fileId = extractGoogleDriveId(url);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  }
  return url;
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

function youtubeEmbedUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replaceAll("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return url;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function contentPreviewHtml(marker, entry) {
  const blocks = [];
  const gallery = entry.gallery.filter((url) => url !== entry.coverImage);
  const tutorials = entry.tutorials;

  if (entry.coverImage) {
    const coverUrl = resolveImageUrl(entry.coverImage);
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
      .map((part) => part.split("\n").map((line) => line.trim()).filter(Boolean));

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

    const listCards = !stepCards && sections.every((lines) => lines.length > 1 && !/^[•»]/.test(lines[0]) && lines.slice(1).every((line) => /^[•»]/.test(line)))
      ? sections
        .map((lines) => {
          const [title, ...items] = lines;
          return `
            <section class="content-step content-step-list">
              <h3>${escapeHtml(title)}</h3>
              <ul>
                ${items.map((line) => `<li>${escapeHtml(line.replace(/^[•»]\s*/, ""))}</li>`).join("")}
              </ul>
            </section>
          `;
        })
        .join("")
      : "";

    if (stepCards) {
      blocks.push(`<div class="content-steps">${stepCards}</div>`);
    } else if (listCards) {
      blocks.push(`<div class="content-steps">${listCards}</div>`);
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

  const embeddableGallery = gallery.map((url) => resolveImageUrl(url));

  if (embeddableGallery.length) {
    blocks.push(`
      <div class="content-gallery">
        ${embeddableGallery.map((url, index) => `
          <button type="button" class="content-image-button content-thumb" data-preview-image="${escapeAttribute(url)}" data-preview-caption="${escapeAttribute(`${marker.title} reference image ${index + 1}`)}">
            <img src="${escapeAttribute(url)}" alt="${escapeAttribute(`${marker.title} gallery ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer">
          </button>
        `).join("")}
      </div>
    `);
  }

  if (tutorials.length && !markerSupportsVideoGuide(marker)) {
    const tutorialCards = tutorials.map((url) => {
      const embed = youtubeEmbedUrl(url);
      if (embed) {
        return `
          <div class="tutorial-card">
            <iframe
              src="${escapeAttribute(embed)}"
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
    }).join("");

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

  const embed = youtubeEmbedUrl(primaryVideo);
  const body = embed
    ? `
      <div class="tutorial-card">
        <iframe
          src="${escapeAttribute(embed)}"
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
  const coordText = coordinates.length
    ? coordinates.map((point) => `${point.x}, ${point.z}`).join(" | ")
    : "Unknown";
  const enemyBlock = enemies.length ? `
        <section class="event-detail-block">
          <h4>Enemies</h4>
          <ul>
            ${enemies.map((enemy) => `<li>${escapeHtml(enemy)}</li>`).join("")}
          </ul>
        </section>
      ` : "";
  const bossBlock = boss ? `
        <section class="event-detail-block">
          <h4>Boss</h4>
          <p>${escapeHtml(boss)}</p>
        </section>
      ` : "";
  const detailGrid = enemyBlock || bossBlock
    ? `
      <div class="event-detail-grid">
        ${enemyBlock}
        ${bossBlock}
      </div>
    `
    : "";
  const dropsBlock = drops.length ? `
      <section class="event-detail-block drops">
        <h4>Drops</h4>
        <div class="event-drop-list">
          ${drops.map((drop) => `<span class="event-drop-chip">${escapeHtml(drop)}</span>`).join("")}
        </div>
      </section>
    ` : "";

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
      ${details.requiredQuest ? `
        <div class="event-detail-row">
          <strong>Required Quest</strong>
          <span>${escapeHtml(details.requiredQuest)}</span>
        </div>
      ` : ""}
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

function videoGuideEditorHtml(marker, entry) {
  if (!markerSupportsVideoGuide(marker)) {
    return "";
  }

  return `
    <section class="content-studio video-guide-studio">
      <div class="content-studio-head">
        <h3>Linked Video</h3>
        <span class="content-studio-note">Beta only. Saved in this browser and shown on the main site in this browser too.</span>
      </div>
      <label class="content-field">
        <span>YouTube Link</span>
        <input type="url" data-content-field="videoGuide" value="${escapeAttribute(entry.tutorials[0] || "")}" placeholder="https://www.youtube.com/watch?v=...">
      </label>
      <div class="content-save-note">Paste one video link for this quest or secret discovery.</div>
    </section>
  `;
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
  return `${CONTENT_BOOK_ROOT}/${icon}_${variant}.png`;
}

function markerIconUrl(marker, variant = "active") {
  if (marker?.iconImage && MOB_ICON_URLS[marker.iconImage]) {
    return MOB_ICON_URLS[marker.iconImage];
  }
  return categoryAssetUrl(marker?.category, variant);
}

function genericIconMarkup(categoryId, extraClass = "") {
  const meta = CATEGORY_META[categoryId];
  return `<span class="generic-category-icon ${extraClass}" style="--category-accent:${meta.color};"></span>`;
}

function buildCityLabelHtml(marker, isFound, isSelected) {
  const classes = ["city-map-label"];
  if (marker.minor) {
    classes.push("minor");
  }
  if (state.editCities || state.areaOffsetMode) {
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

  if (element.dataset.dragBound === "1") {
    return;
  }

  element.dataset.dragBound = "1";
  const beginDrag = (event) => {
    if (!state.areaOffsetMode) {
      return;
    }
    const id = event.currentTarget?.dataset?.markerId;
    const marker = state.markers.find((item) => item.id === id);
    if (!marker) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    startAreaOffsetDrag(marker, map.mouseEventToLatLng(event));
  };
  element.addEventListener("pointerdown", beginDrag);
  element.addEventListener("mousedown", beginDrag);
}

function wireMarkerAnchor(layer, markerId) {
  const element = layer.getElement();
  if (!element) {
    return;
  }

  element.dataset.markerId = markerId;
  if (element.dataset.dragBound === "1") {
    return;
  }

  element.dataset.dragBound = "1";
  const beginDrag = (event) => {
    if (!state.areaOffsetMode) {
      return;
    }
    const id = event.currentTarget?.dataset?.markerId;
    const marker = state.markers.find((item) => item.id === id);
    if (!marker) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    startAreaOffsetDrag(marker, map.mouseEventToLatLng(event));
  };
  element.addEventListener("pointerdown", beginDrag);
  element.addEventListener("mousedown", beginDrag);
}

function activeCalibrationTarget() {
  return CALIBRATION_TARGETS[state.calibrationIndex] || CALIBRATION_TARGETS[0];
}

function startAreaOffsetDrag(marker, latlng) {
  if (!state.areaOffsetMode) {
    return;
  }
  state.areaOffsetDrag = {
    areaId: markerArea(marker),
    markerId: marker.id,
    startLatLng: { lat: latlng.lat, lng: latlng.lng },
    startOffset: { ...areaOffset(markerArea(marker)) },
  };
  setSelectedMarker(marker.id);
  if (map.dragging?.enabled()) {
    map.dragging.disable();
  }
}

function updateAreaOffsetDrag(latlng) {
  if (!state.areaOffsetDrag) {
    return;
  }
  state.areaOffsets[state.areaOffsetDrag.areaId] = {
    x: Math.round(state.areaOffsetDrag.startOffset.x + (latlng.lng - state.areaOffsetDrag.startLatLng.lng)),
    y: Math.round(state.areaOffsetDrag.startOffset.y + (latlng.lat - state.areaOffsetDrag.startLatLng.lat)),
  };
  updateMarkerLayerPositions();
  renderPanelBanner();
  renderActiveAreaHighlight();
}

function finishAreaOffsetDrag() {
  if (!state.areaOffsetDrag) {
    return;
  }
  persistAreaOffsets();
  state.areaOffsetDrag = null;
  if (map.dragging && !map.dragging.enabled()) {
    map.dragging.enable();
  }
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
  if (isMobCategory(marker.category)) {
    return false;
  }

  const searchSurfacedMob = Boolean(state.search) && isMobCategory(marker.category) && matchesSearch;
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
  if (marker.fixed) {
    if (state.areaOffsetMode) {
      return L.divIcon({
        className: "map-pin-wrapper",
        html: `<span class="area-offset-handle ${marker.minor ? "minor" : ""}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
    }
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
    ? `<img class="${classes.join(" ")}" src="${iconUrl}" alt="" draggable="false" style="--pin-glow:${meta.color};">`
    : `<span class="generic-pin ${classes.join(" ")}" style="--pin-glow:${meta.color};--pin-fill:${meta.color};"></span>`;

  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="asset-pin-shell">${iconMarkup}</span>`,
    iconSize: [MAP_PIN_SIZE, MAP_PIN_SIZE],
    iconAnchor: [MAP_PIN_SIZE / 2, MAP_PIN_SIZE / 2],
  });
}

function createMarkerLayer(marker) {
  const layer = L.marker(markerLatLng(marker), {
    icon: buildMarkerIcon(marker, markerIsFound(marker), false),
    title: marker.title,
    draggable: marker.fixed,
    autoPan: marker.fixed,
  });

  layer.on("click", () => setSelectedMarker(marker.id));
  layer.on("mousedown", (event) => {
    if (!state.areaOffsetMode) {
      return;
    }
    event.originalEvent?.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    startAreaOffsetDrag(marker, event.latlng);
  });
  if (marker.fixed) {
    bindCityTooltip(layer, marker, markerIsFound(marker), false);
    layer.on("add", () => {
      window.requestAnimationFrame(() => {
        wireCityTooltip(layer, marker.id);
        wireMarkerAnchor(layer, marker.id);
      });
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
  } else {
    layer.bindTooltip(marker.title, {
      direction: "top",
      offset: [0, -10],
      opacity: 0.94,
      sticky: true,
    });
    layer.on("add", () => {
      window.requestAnimationFrame(() => wireMarkerAnchor(layer, marker.id));
    });
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
  renderActiveAreaHighlight();
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
  return state.markers.filter((marker) =>
    marker.category === categoryId &&
    !marker.fixed &&
    markerArea(marker) === state.currentArea,
  ).length;
}

function categoryVisibleCount(categoryId) {
  return state.filteredMarkers.filter((marker) =>
    marker.category === categoryId &&
    !marker.fixed &&
    markerArea(marker) === state.currentArea,
  ).length;
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = CATEGORY_GROUPS.map((group) => {
    if (group.id === "mobs") {
      const cards = group.categories.map((categoryId) => {
        const meta = CATEGORY_META[categoryId];
        const total = categoryCount(categoryId);
        const matching = filteredMobFamilyMarkers(categoryId).length;
        const active = state.activeMobFamily === categoryId;
        const metaText = active
          ? `${matching} ${matching === 1 ? "mob" : "mobs"} listed`
          : (state.search && matching ? `${matching} matching` : `${total} ${total === 1 ? "type" : "types"}`);
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
            ${active ? `
              <section class="mob-browser-panel">
                <div class="mob-browser-head">
                  <div class="mob-browser-copy">
                    <span class="mob-browser-kicker">Mob Browser</span>
                    <strong>${escapeHtml(meta.label)}</strong>
                  </div>
                  <button type="button" class="mob-browser-close" data-close-mob-family="1" aria-label="Close mob family list">×</button>
                </div>
                <p class="mob-browser-note">Pick a mob and the map will outline every exact spawn node we have for it.</p>
                <div class="mob-browser-list">
                  ${activeMobFamilyMarkers().length
                    ? activeMobFamilyMarkers().map((marker) => {
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
                            ${mobIconUrl
                              ? `<img class="mob-list-icon" src="${escapeAttribute(mobIconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                              : genericIconMarkup(marker.category, "mob-list-icon generic-category-icon")}
                          </span>
                          <span class="mob-list-copy">
                            <strong>${escapeHtml(marker.title)}</strong>
                            <span>${escapeHtml(secondary)}</span>
                          </span>
                          <span class="mob-list-count">${marker.spawnPointCount || 0}</span>
                        </button>
                      `;
                    }).join("")
                    : `<div class="mob-browser-empty">No ${escapeHtml(meta.label.toLowerCase())} match the current search.</div>`}
                </div>
              </section>
            ` : ""}
          </div>
        `;
      }).join("");

      return `
        <section class="category-section">
          <div class="section-head">
            <span>${escapeHtml(group.label)}</span>
          </div>
          <div class="category-grid mob-category-grid">${cards}</div>
        </section>
      `;
    }

    const cards = group.categories.map((categoryId) => {
      const meta = CATEGORY_META[categoryId];
      const active = state.categoryFilter.has(categoryId);
      const total = categoryCount(categoryId);
      const visible = categoryVisibleCount(categoryId);
      const iconUrl = categoryAssetUrl(categoryId, active ? "active" : "locked");
      const metaText = active
        ? `${visible} shown`
        : (state.search && visible ? `${visible} matching` : "Hidden");
      const iconMarkup = iconUrl
        ? `<span class="category-icon asset-icon" style="--category-icon:url('${iconUrl}');--category-accent:${meta.color};"></span>`
        : genericIconMarkup(categoryId, "category-icon");
      return `
        <button type="button" class="category-card ${active ? "active" : "inactive"}" data-category="${categoryId}">
          ${iconMarkup}
          <span class="category-copy">
            <strong>${escapeHtml(meta.label)}</strong>
            <span class="category-meta">${metaText}</span>
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
      state.activeMobFamily = null;
      if (selected && isMobCategory(selected.category)) {
        state.selectedMarkerId = null;
      }
      syncVisibleMarkers();
      renderCategoryFilters();
      renderDetailCard();
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
        <p>Select a quest or secret discovery to view or set its linked video.</p>
      `;
    }
    return;
  }

  const point = markerPoint(marker);
  const world = marker.position?.world || imageToWorld(point.x, point.y);
  const isFound = markerIsFound(marker);
  const supportsFound = markerSupportsFound(marker);
  const meta = CATEGORY_META[marker.category];
  const iconUrl = marker.fixed ? CITY_ICON_URL : markerIconUrl(marker, isFound ? "locked" : "active");
  const detailIcon = marker.fixed
    ? `<span class="detail-icon city" style="--detail-icon:url('${iconUrl}');"></span>`
    : (iconUrl
      ? `<span class="detail-icon ${marker.iconImage ? "mob-detail-icon" : ""}" style="--detail-icon:url('${iconUrl}');--detail-accent:${meta.color};"></span>`
      : genericIconMarkup(marker.category, "detail-icon generic-detail-icon"));
  const content = contentExportEntry(marker);
  const authoredContent = markerContentAuthorEntry(marker.id);
  const eventIntel = worldEventDetailsHtml(marker);
  const detailMeta = [
    `<span class="detail-pill">${escapeHtml(marker.region || "World")}</span>`,
    `<span class="detail-pill">${world.x}, ${world.z}</span>`,
  ].join("");
  const actionButtons = [
    supportsFound ? `<button type="button" class="detail-button" data-action="toggle-found">${isFound ? "Mark not found" : "Mark found"}</button>` : "",
    `<button type="button" class="detail-button secondary" data-action="focus">Focus</button>`,
  ].filter(Boolean).join("");
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
    <section class="content-preview-panel">
      <div class="content-preview-head">
        <h3>Guide & Reference</h3>
      </div>
      <div id="content-preview-body" class="content-preview-body">
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
      <div id="video-guide-preview-body" class="content-preview-body">
        ${videoGuidePreviewHtml(marker, content)}
      </div>
      ${videoGuideEditorHtml(marker, authoredContent)}
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
      }
    });
  });

  document.querySelectorAll("[data-preview-image]").forEach((button) => {
    button.addEventListener("click", () => {
      openImageLightbox(button.dataset.previewImage, button.dataset.previewCaption || marker.title);
    });
  });

  const previewBodies = [...document.querySelectorAll("#content-preview-body")];
  const linkPreviewBody = elements.linkCard?.querySelector("#video-guide-preview-body");
  const saveNote = elements.linkCard?.querySelector(".content-save-note");
  const linkFields = elements.linkCard?.querySelectorAll("[data-content-field]") || [];

  linkFields.forEach((field) => {
    field.addEventListener("input", () => {
      updateMarkerContent(marker, field.dataset.contentField, field.value);
      const entry = markerContentEntry(marker);
      previewBodies.forEach((previewBody) => {
        previewBody.innerHTML = contentPreviewHtml(marker, entry);
      });
      if (linkPreviewBody) {
        linkPreviewBody.innerHTML = videoGuidePreviewHtml(marker, entry);
      }
      if (saveNote) {
        saveNote.textContent = "Saved locally.";
      }
    });
  });

  if (elements.studioCard) {
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
    : (editedCount >= 3 ? " City-fit could not be solved from the current edits." : " Move at least 3 cities to solve the full map transform.");
  elements.cityEditorStatus.textContent = state.editCities
    ? `Edit mode is on. Drag city labels on the map. ${editedCount} city edits saved locally.${transformStatus}`
    : `Edit mode is off. ${editedCount} city edits saved locally. Enable edit mode to drag city labels.${transformStatus}`;
  elements.cityEditorOutput.textContent = JSON.stringify(cityEditExport(), null, 2);
}

function renderPanelBanner() {
  if (!elements.panelBanner) {
    return;
  }
  if (state.areaOffsetMode) {
    const offset = areaOffset(state.currentArea);
    elements.panelBanner.textContent = `Offset edit is on for ${MAP_AREAS[state.currentArea].buttonLabel}. Drag any visible marker to shift this area only. Ctrl+X exits. Current offset: ${offset.x}, ${offset.y}.`;
    return;
  }
  elements.panelBanner.textContent = "Routes, rewards, discoveries, profession spots, and exact mob markers.";
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
  elements.appShell?.classList.toggle("panel-collapsed", collapsed);
  if (elements.panelToggle) {
    elements.panelToggle.setAttribute("aria-expanded", String(!collapsed));
    elements.panelToggle.setAttribute("aria-label", collapsed ? "Open marker panel" : "Collapse marker panel");
  }
}

function updateMapSelector() {
  const area = MAP_AREAS[state.currentArea];
  if (elements.mapSelectorLabel && area) {
    elements.mapSelectorLabel.textContent = area.buttonLabel;
  }
  if (elements.mapSelector) {
    elements.mapSelector.setAttribute("aria-expanded", String(state.mapSelectorOpen));
  }
  if (elements.mapSelectorMenu) {
    elements.mapSelectorMenu.classList.toggle("hidden", !state.mapSelectorOpen);
    elements.mapSelectorMenu.innerHTML = Object.values(MAP_AREAS).map((mapArea) => `
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
    `).join("");
  }
}

function setMapSelectorOpen(open) {
  state.mapSelectorOpen = open;
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
  renderPanelBanner();
  syncVisibleMarkers();
  renderCategoryFilters();
  renderDetailCard();
  renderActiveAreaHighlight();
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
  ].map((point) => applyAreaOffsetToPoint(point, state.currentArea))
    .map((point) => [point.y * MAP_HEIGHT, point.x * MAP_WIDTH]);

  const lats = corners.map(([lat]) => lat);
  const lngs = corners.map(([, lng]) => lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function markerBoundsLatLngList(marker) {
  const sourceBounds = Array.isArray(marker.spawnNodes) && marker.spawnNodes.length
    ? marker.spawnNodes
    : (Array.isArray(marker.spawnRegions) && marker.spawnRegions.length
    ? marker.spawnRegions
    : (marker.spawnBounds ? [marker.spawnBounds] : []));

  return sourceBounds
    .map((bounds) => worldBoundsToLatLng(bounds))
    .filter(Boolean);
}

function renderActiveAreaHighlight() {
  if (state.areaHighlightLayer) {
    map.removeLayer(state.areaHighlightLayer);
    state.areaHighlightLayer = null;
  }

  const marker = state.markers.find((item) => item.id === state.selectedMarkerId);
  const boundsList = marker ? markerBoundsLatLngList(marker) : [];
  const visible = marker
    ? (isMobCategory(marker.category) || state.filteredMarkers.some((item) => item.id === marker.id))
    : false;
  if (!marker || !boundsList.length || !visible) {
    return;
  }

  const meta = CATEGORY_META[marker.category];
  const approximate = Boolean(marker.spawnZoneApproximate);
  state.areaHighlightLayer = L.featureGroup(
    boundsList.map((bounds) => L.rectangle(bounds, {
      color: meta.color,
      weight: approximate ? 2 : 3,
      opacity: 0.9,
      fillColor: meta.color,
      fillOpacity: approximate ? 0.05 : 0.08,
      dashArray: approximate ? "9 7" : "4 4",
      interactive: false,
    })),
  ).addTo(map);
  state.areaHighlightLayer.eachLayer((layer) => layer.bringToBack());
}

function setSelectedMarker(markerId) {
  state.selectedMarkerId = markerId;
  const marker = state.markers.find((item) => item.id === markerId);
  if (marker && isMobCategory(marker.category)) {
    state.activeMobFamily = marker.category;
  }

  for (const [id, layer] of state.markerLayers) {
    const marker = state.markers.find((item) => item.id === id);
    const isFound = markerIsFound(marker);
    const isSelected = id === markerId;
    layer.setIcon(buildMarkerIcon(marker, isFound, isSelected));
    if (marker.fixed) {
      bindCityTooltip(layer, marker, isFound, isSelected);
    }
  }

  if (DEV_MODE && elements.studioCard) {
    setPanelView("studio");
  } else {
    setPanelView("info");
  }

  setPanelCollapsed(false);
  renderDetailCard();
  renderActiveAreaHighlight();
  renderCategoryFilters();
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
    if (layer.dragging) {
      if (marker.fixed && state.editCities && !state.areaOffsetMode) {
        layer.dragging.enable();
      } else {
        layer.dragging.disable();
      }
    }
    const isFound = markerIsFound(marker);
    const isSelected = marker.id === state.selectedMarkerId;
    layer.setIcon(buildMarkerIcon(marker, isFound, isSelected));
    window.requestAnimationFrame(() => wireMarkerAnchor(layer, marker.id));
    if (marker.fixed) {
      bindCityTooltip(layer, marker, isFound, isSelected);
    }
  }
  renderActiveAreaHighlight();
}

function hydrateMarkerState() {
  const fixedCities = STARTER_MARKERS.map((marker) => ({ ...marker, fixed: true }));
  const curatedSupplemental = CURATED_MARKERS.filter((marker) => marker.category !== "world_events");
  state.markers = [...fixedCities, ...curatedSupplemental, ...WIKI_MAP_MARKERS];
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

  if (elements.mapSelector) {
    elements.mapSelector.addEventListener("click", (event) => {
      event.stopPropagation();
      setMapSelectorOpen(!state.mapSelectorOpen);
    });
  }

  if (elements.mapSelectorMenu) {
    elements.mapSelectorMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-map-area]");
      if (!button) {
        return;
      }
      setCurrentArea(button.dataset.mapArea);
    });
  }

  document.addEventListener("click", (event) => {
    if (!state.mapSelectorOpen) {
      return;
    }
    if (event.target.closest(".map-selector-wrap")) {
      return;
    }
    setMapSelectorOpen(false);
  });

  document.addEventListener("mouseup", () => {
    finishAreaOffsetDrag();
  });
  document.addEventListener("mousemove", (event) => {
    if (!state.areaOffsetDrag) {
      return;
    }
    updateAreaOffsetDrag(map.mouseEventToLatLng(event));
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typingTarget = target instanceof HTMLElement && (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    );
    if (typingTarget) {
      return;
    }
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "x") {
      event.preventDefault();
      state.areaOffsetMode = !state.areaOffsetMode;
      renderPanelBanner();
      syncVisibleMarkers();
    }
  });

  map.on("click", (event) => {
    if (state.calibrationMode) {
      recordCalibrationSample(event.latlng);
    }
  });
  map.on("mousemove", (event) => {
    updateAreaOffsetDrag(event.latlng);
  });
  map.on("mouseup", () => {
    finishAreaOffsetDrag();
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

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeImageLightbox();
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

  map.on("zoom", () => {
    updatePinScale();
    syncVisibleMarkers();
    renderCategoryFilters();
  });
  map.on("zoomend", () => {
    updatePinScale();
    syncVisibleMarkers();
    renderCategoryFilters();
  });
}

hydrateMarkerState();
state.cityTransform = USE_CITY_EDITS ? computeCityEditTransform() : null;
bindEvents();
setPanelCollapsed(state.panelCollapsed);
setPanelView("markers");
updateMapSelector();
renderPanelBanner();
updatePinScale();
renderCalibrationMarkers();
syncVisibleMarkers();
renderCategoryFilters();
renderDetailCard();
renderCityEditor();
renderCalibrationPanel();
