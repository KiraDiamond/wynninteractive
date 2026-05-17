# Wynn Interactive

I built Wynn Atlas as a static GitHub Pages map for current Wynncraft routes, guides, discoveries, rewards, and profession spots.

## What I keep here

- Fruma-era world map with pan and zoom controls
- Search, layer filters, and found-state tracking in browser storage
- Marker notes for quests, mini quests, discoveries, caves, dungeons, raids, boss altars, world events, and profession spots
- Source links back to the original wiki pages and guide pages

## Main files

- `index.html`: live app shell
- `styles.css`: map and panel styling
- `app.js`: interaction logic, marker rendering, and panel behavior
- `data/markers.js`: local marker metadata and curated overlays
- `data/wiki-map-markers.js`: generated live marker dataset used by the map
- `data/marker-content.js`: merged marker note/content registry
- `assets/map/WynncraftMapFruma.png`: world map image

## Build commands

- `npm run build:wiki-map`: rebuild the live marker dataset from the current map/wiki information sources
- `npm run build:quest-content`: rebuild quest guide content
- `npm run build:supplemental-content`: rebuild world event, cave, dungeon, boss altar, and discovery content
- `npm run build:profession-spots`: rebuild profession markers and profession notes
- `npm run build:reference-images`: rebuild the local reference-image cache used by the marker panels

## Sources And Credits

- Wynncraft Wiki: [wiki.gg](https://wynncraft.wiki.gg/wiki/Main_Page)
- Legacy fallback pages where needed: [Wynncraft Fandom](https://wynncraft.fandom.com/wiki/Wynncraft_Wiki)
- Profession route guide: [Zy's updated profession guide](https://docs.google.com/document/d/1Wv5I296Cd5j7yWT2vgGFp1AFM_1R2Xw-M73TIoR56-M/edit?tab=t.0)
- Official API docs: [List map markers](https://docs.wynncraft.com/modules/map/list-map-markers)
- Official API endpoint: [https://api.wynncraft.com/v3/map/locations/markers](https://api.wynncraft.com/v3/map/locations/markers)
- Implementation help: OpenAI Codex

## Deployment

I deploy this repository to GitHub Pages from `main` with `.github/workflows/deploy-pages.yml`.
