# Wynn Interactive

Interactive Wynncraft world map built as a static GitHub Pages site.

## What it includes

- Full Fruma-era world image
- Pan and zoom map controls
- Search, layer filters, and region jump buttons
- Marker details and found-state tracking in browser storage
- Custom pins for personal route planning

## Local files

- `index.html`: app shell
- `styles.css`: map and panel styling
- `app.js`: interactive behavior and map calibration
- `data/markers.js`: starter marker dataset
- `data/wiki-map-markers.js`: generated wiki-backed marker dataset used by the live map
- `assets/map/WynncraftMapFruma.png`: world map image

## Data builds

- `npm run build:wiki-map`: rebuild the live marker dataset from the persistent wiki scrape plus the coordinate backbone

## Deployment

This repository is configured to deploy automatically to GitHub Pages from the `main` branch using the workflow in `.github/workflows/deploy-pages.yml`.
