import { html } from "./app-utils.js";

const DEFAULT_REPOSITORY_URL = "https://github.com/KiraDiamond/wynninteractive";

export function routeShareUrl(currentUrl, markerIds) {
  const url = new URL(currentUrl);
  url.searchParams.delete("marker");
  const route = [...new Set(markerIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (route.length) {
    url.searchParams.set("route", route.join(","));
  } else {
    url.searchParams.delete("route");
  }
  return url.toString();
}

export function markerIssueUrl(marker, currentUrl, repositoryUrl = DEFAULT_REPOSITORY_URL) {
  const world = marker?.position?.world || {};
  const title = `Marker correction: ${marker?.title || "Unknown marker"}`;
  const body = [
    "## Marker",
    `- Name: ${marker?.title || "Unknown"}`,
    `- Category: ${marker?.category || "Unknown"}`,
    `- Region: ${marker?.region || "Unknown"}`,
    `- Coordinates: ${Number.isFinite(world.x) && Number.isFinite(world.z) ? `${world.x}, ${world.z}` : "Unknown"}`,
    `- Marker ID: ${marker?.id || "Unknown"}`,
    `- Map link: ${currentUrl}`,
    "",
    "## What is incorrect?",
    "Describe the problem and include the correct coordinates or source if possible.",
  ].join("\n");
  const url = new URL(`${repositoryUrl.replace(/\/$/, "")}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}

export function completionExport(foundIds) {
  return {
    app: "wynninteractive",
    version: 1,
    exportedAt: new Date().toISOString(),
    foundIds: [...new Set([...foundIds].map((id) => String(id || "").trim()).filter(Boolean))].sort(),
  };
}

export function completionIdsFromImport(payload) {
  const ids = Array.isArray(payload) ? payload : payload?.foundIds;
  if (!Array.isArray(ids)) {
    throw new Error("This file does not contain a foundIds list.");
  }
  if (ids.length > 10000) {
    throw new Error("This progress file is unexpectedly large.");
  }
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function safeLoadRoute(storageKey) {
  const routeParam = new URLSearchParams(window.location.search).get("route");
  if (routeParam) {
    return [...new Set(routeParam.split(",").map((id) => id.trim()).filter(Boolean))];
  }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? [...new Set(stored.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function routeDistance(markers) {
  return markers.slice(1).reduce((total, marker, index) => {
    const previous = markers[index];
    const left = previous?.position?.world;
    const right = marker?.position?.world;
    if (!left || !right) return total;
    return total + Math.hypot(right.x - left.x, right.z - left.z);
  }, 0);
}

function downloadProgress(payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wynninteractive-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function createMapTools({
  root,
  map,
  leaflet,
  storageKey = "wynninteractive-route-v1",
  getMarkers,
  getFoundIds,
  setFoundIds,
  getCurrentArea,
  markerArea,
  markerLatLng,
  markerSupportsFound,
  focusMarker,
}) {
  let routeIds = safeLoadRoute(storageKey);
  let routeLayer = null;
  let statusMessage = "";

  function persistRoute() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(routeIds));
    } catch {}
  }

  function routeMarkers() {
    const markerById = new Map(getMarkers().map((marker) => [marker.id, marker]));
    return routeIds.map((id) => markerById.get(id)).filter(Boolean);
  }

  function refreshLayer() {
    if (routeLayer && map.hasLayer(routeLayer)) {
      map.removeLayer(routeLayer);
    }
    routeLayer = null;
    const currentArea = getCurrentArea();
    const points = routeMarkers()
      .filter((marker) => markerArea(marker) === currentArea)
      .map(markerLatLng);
    if (points.length < 2) return;
    routeLayer = leaflet.polyline(points, {
      className: "route-plan-line",
      color: "#d06df7",
      weight: 5,
      opacity: 0.9,
      dashArray: "10 9",
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(map);
  }

  function regionalProgress() {
    const foundIds = getFoundIds();
    const regions = new Map();
    getMarkers()
      .filter((marker) => markerSupportsFound(marker) && !marker.contextOnly)
      .forEach((marker) => {
        const label = marker.region || "World";
        const entry = regions.get(label) || { label, found: 0, total: 0 };
        entry.total += 1;
        if (foundIds.has(marker.id)) entry.found += 1;
        regions.set(label, entry);
      });
    return [...regions.values()].sort((left, right) =>
      right.found / right.total - left.found / left.total || left.label.localeCompare(right.label),
    );
  }

  function routeRows(markers) {
    if (!markers.length) {
      return html`<div class="tools-empty">Select any marker and use <strong>Add stop</strong> to begin a route.</div>`;
    }
    return markers.map((marker, index) => html`
      <div class="route-stop-row" data-route-id="${marker.id}">
        <span class="route-stop-index">${index + 1}</span>
        <button type="button" class="route-stop-main" data-tools-action="focus-route" data-marker-id="${marker.id}">
          <strong>${marker.title}</strong>
          <span>${marker.region || "World"}</span>
        </button>
        <span class="route-stop-controls">
          <button type="button" data-tools-action="move-up" data-marker-id="${marker.id}" aria-label="Move ${marker.title} earlier" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-tools-action="move-down" data-marker-id="${marker.id}" aria-label="Move ${marker.title} later" ${index === markers.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-tools-action="remove-route" data-marker-id="${marker.id}" aria-label="Remove ${marker.title}">×</button>
        </span>
      </div>
    `).join("");
  }

  function progressRows(entries) {
    if (!entries.length) return html`<div class="tools-empty">No trackable markers are loaded.</div>`;
    return entries.map((entry) => {
      const percent = Math.round((entry.found / entry.total) * 100);
      return html`
        <div class="region-progress-row">
          <div class="region-progress-copy">
            <strong>${entry.label}</strong>
            <span>${entry.found} / ${entry.total}</span>
          </div>
          <div class="region-progress-track" role="progressbar" aria-label="${entry.label} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
            <span style="--region-progress:${percent}%"></span>
          </div>
          <span class="region-progress-value">${percent}%</span>
        </div>
      `;
    }).join("");
  }

  function render() {
    if (!root) return;
    const markers = routeMarkers();
    const regions = regionalProgress();
    const foundCount = getFoundIds().size;
    const trackableCount = regions.reduce((total, entry) => total + entry.total, 0);
    const distance = Math.round(routeDistance(markers));
    root.className = "detail-card map-tools-card";
    root.innerHTML = html`
      <div class="tools-hero">
        <span class="tools-kicker">Field kit</span>
        <h2>Plan. Track. Transfer.</h2>
        <p>Build a stop list, monitor each region, and carry your completion data to another device.</p>
      </div>

      <section class="tools-section route-planner-section">
        <div class="tools-section-head">
          <div><span>Route planner</span><strong>${markers.length} stops · ${distance.toLocaleString()} blocks</strong></div>
          <div class="tools-inline-actions">
            <button type="button" data-tools-action="copy-route" ${markers.length ? "" : "disabled"}>Copy link</button>
            <button type="button" data-tools-action="clear-route" ${markers.length ? "" : "disabled"}>Clear</button>
          </div>
        </div>
        <div class="route-stop-list">${html.raw(routeRows(markers))}</div>
      </section>

      <section class="tools-section">
        <div class="tools-section-head">
          <div><span>Regional completion</span><strong>${foundCount} found · ${trackableCount} loaded</strong></div>
        </div>
        <div class="region-progress-list">${html.raw(progressRows(regions))}</div>
      </section>

      <section class="tools-section progress-transfer-section">
        <div class="tools-section-head">
          <div><span>Progress transfer</span><strong>Portable JSON backup</strong></div>
        </div>
        <p>Imports merge with this device, so existing completion is never removed.</p>
        <div class="progress-transfer-actions">
          <button type="button" class="detail-button" data-tools-action="export-progress">Export progress</button>
          <button type="button" class="detail-button secondary" data-tools-action="copy-progress">Copy JSON</button>
          <label class="detail-button secondary progress-import-label">
            Import progress
            <input class="sr-only" type="file" accept="application/json,.json" data-progress-import>
          </label>
        </div>
        <div class="tools-status" aria-live="polite">${statusMessage}</div>
      </section>
    `;

    root.querySelectorAll("[data-tools-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.toolsAction;
        const markerId = button.dataset.markerId;
        const index = routeIds.indexOf(markerId);
        if (action === "focus-route") {
          const marker = getMarkers().find((entry) => entry.id === markerId);
          if (marker) focusMarker(marker);
          return;
        }
        if (action === "move-up" && index > 0) {
          [routeIds[index - 1], routeIds[index]] = [routeIds[index], routeIds[index - 1]];
        } else if (action === "move-down" && index >= 0 && index < routeIds.length - 1) {
          [routeIds[index + 1], routeIds[index]] = [routeIds[index], routeIds[index + 1]];
        } else if (action === "remove-route" && index >= 0) {
          routeIds.splice(index, 1);
        } else if (action === "clear-route") {
          routeIds = [];
        } else if (action === "copy-route") {
          const copied = await navigator.clipboard.writeText(routeShareUrl(window.location.href, routeIds)).then(() => true).catch(() => false);
          statusMessage = copied ? "Route link copied." : "Route link could not be copied.";
          render();
          return;
        } else if (action === "export-progress") {
          downloadProgress(completionExport(getFoundIds()));
          statusMessage = "Progress file downloaded.";
          render();
          return;
        } else if (action === "copy-progress") {
          const copied = await navigator.clipboard.writeText(JSON.stringify(completionExport(getFoundIds()), null, 2)).then(() => true).catch(() => false);
          statusMessage = copied ? "Progress JSON copied." : "Progress JSON could not be copied.";
          render();
          return;
        } else {
          return;
        }
        persistRoute();
        refreshLayer();
        render();
      });
    });

    root.querySelector("[data-progress-import]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const importedIds = completionIdsFromImport(JSON.parse(await file.text()));
        const merged = new Set([...getFoundIds(), ...importedIds]);
        setFoundIds(merged);
        statusMessage = `Imported ${importedIds.length} completion records; ${merged.size} are now stored.`;
      } catch (error) {
        statusMessage = error instanceof Error ? error.message : "Progress import failed.";
      }
      render();
    });
    refreshLayer();
  }

  function addRouteStop(marker) {
    if (!marker?.id || routeIds.includes(marker.id)) return false;
    routeIds.push(marker.id);
    persistRoute();
    refreshLayer();
    render();
    return true;
  }

  function removeRouteStop(markerId) {
    const index = routeIds.indexOf(markerId);
    if (index < 0) return false;
    routeIds.splice(index, 1);
    persistRoute();
    refreshLayer();
    render();
    return true;
  }

  return {
    addRouteStop,
    hasRouteStop: (markerId) => routeIds.includes(markerId),
    refreshLayer,
    removeRouteStop,
    render,
    unresolvedRouteIds: () => {
      const loadedIds = new Set(getMarkers().map((marker) => marker.id));
      return routeIds.filter((id) => !loadedIds.has(id));
    },
  };
}
