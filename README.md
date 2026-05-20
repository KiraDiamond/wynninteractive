# Wynnteractive Map

Wynnteractive Map is a static GitHub Pages map for current Wynncraft routes, guides, discoveries, rewards, professions, travel points, and mobs.

## What is here

- Fruma-era world map with pan and zoom controls
- Main and beta map surfaces
- Search, filters, found-state tracking, and theme persistence in browser storage
- Marker notes for quests, mini quests, discoveries, caves, dungeons, raids, boss altars, world events, lootrun camps, travel points, profession spots, and mobs
- Source links back to the related information pages and guides

## Main files

- `index.html`: live app shell
- `beta/index.html`: beta app shell
- `styles.css`: shared map and panel styling
- `app.js`: live interaction logic, marker rendering, and panel behavior
- `beta/beta-app.js`: beta interaction logic
- `data/markers.js`: local marker metadata and curated overlays
- `data/wiki-map-markers.js`: generated live marker dataset used by the map
- `data/marker-content.js`: merged marker note/content registry

## Sources and Credits

- All core marker positions are from the official Wynncraft server marker data.
- Fast travel and Seaskipper locations are from the Wynntils project, and their marker art is based on Wynntils-derived travel icon assets.
- Official API docs: [List map markers](https://docs.wynncraft.com/modules/map/list-map-markers)
- Official API endpoint: [https://api.wynncraft.com/v3/map/locations/markers](https://api.wynncraft.com/v3/map/locations/markers)
- Primary information source: [Wynncraft Wiki on wiki.gg](https://wynncraft.wiki.gg/wiki/Main_Page)
- Backup information source: [Wynncraft Fandom](https://wynncraft.fandom.com/wiki/Wynncraft_Wiki)
- Qira Hive guide credit: [An In-Depth Guide To Fighting Qira](https://forums.wynncraft.com/threads/an-in-depth-guide-to-fighting-qira.291617/)
- Lootrun guide credit: [Ultimate Wynncraft Lootrun Guide](https://docs.google.com/document/d/11aw2yFc2vi0yrKxPuWl6Uedctw4RnxmtkJbkvm7PB-M/edit?tab=t.0)
- Profession guide credit: [Zy's updated profession guide](https://docs.google.com/document/d/1Wv5I296Cd5j7yWT2vgGFp1AFM_1R2Xw-M73TIoR56-M/edit?tab=t.0)
- Code assistance: OpenAI Codex
- Special thanks to `gale_nasin` for answering rule-related questions for the project.
- Special thanks to `Xnova204` for making the site logo.

## Deployment

This repository deploys to GitHub Pages from `main` with `.github/workflows/deploy-pages.yml`.
