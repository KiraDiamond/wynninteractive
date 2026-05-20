# Wynnteractive Map

![GitHub Pages](https://img.shields.io/badge/Live-GitHub%20Pages-blue?logo=github)
![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-green)
![JS](https://img.shields.io/badge/Built%20with-Vanilla%20JS-yellow?logo=javascript)

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
- `shared-map-ui.css`: shared map and panel styling
- `main-map-app.js`: live interaction logic, marker rendering, and panel behavior
- `beta/beta-map-app.js`: beta interaction logic
- `shared/app-utils.js`: shared escaping, lookup, embed, and asset helper logic
- `data/markers.js`: local marker metadata and curated overlays
- `data/wiki-map-markers.js`: generated live marker dataset used by the map
- `data/marker-content-loader.js`: lazy guide-content loader for marker categories

## Quick start (local)

Clone the repo and open `index.html` directly in a browser — no build step required. For live-reload during development, use:

```bash
npx serve .
```

## Contributing

Marker data lives in `data/markers.js` and `data/wiki-map-markers.js`. To add or correct a marker, edit the relevant file and open a pull request. Please include the in-game coordinates and a source link.

## Sources and Credits

- All core marker positions are from the official Wynncraft server marker data.
- Fast travel and Seaskipper locations are from the Wynntils project, and the Fast Travel / Seaskipper marker art is taken directly from the Wynntils resource pack.
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

## License

This project is licensed under the GNU AGPLv3. See [LICENSE](./LICENSE).
Third-party assets and source material remain credited to their original upstream projects and authors.

## Deployment

This repository deploys to GitHub Pages from `main` with `.github/workflows/deploy-pages.yml`.
