# Changelog

All notable changes to Wynnteractive Map are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- Added a non-destructive official API/wiki marker refresh pipeline and weekly workflow
- Added 22 cave supplements and the missing Slay Angels mini-quest marker
- Added generated mob category counts and refresh consistency tests
- Added a multi-stop route planner with reordering, map overlays, persistence, and shareable URLs
- Added a regional completion dashboard for trackable markers
- Added prefilled GitHub issue reports from marker details
- Added JSON export, clipboard copy, and merge-safe import for completion progress

### Fixed
- Removed unresolved wiki reward templates from imported marker descriptions
- Prevented scraped cave article prose from appearing as a map region label
- Kept duplicate generated marker IDs from overwriting Leaflet layer references

### Changed
- Refreshed 926 ingredient-dropping mob records from 4,628 current spawn points while preserving 16 upstream-absent records
- Aligned 22 existing fast-travel markers with the current official map coordinates
- Aligned 20 named cave markers with their current official map coordinates
- Aligned two ultimate discoveries with their current official map coordinates
- Reworked the desktop shell into a denser atlas layout with a dark header, flat controls, compact category rows, and map-side zoom controls
- Removed the decorative field-kit hero from the planner and progress panel
- Debounced marker search updates to reduce per-keystroke map refresh work
- Bucketed marker state by category and area to avoid repeated full-array scans
- Split large detail and category renderers into smaller helper functions
- Added an auto-escaping HTML template helper for shared renderer safety
- Replaced matching hardcoded UI colors with existing CSS variables
- Added zero-dependency project checks and a pull-request CI workflow

## [1.0.0] — 2026-05-20
### Added
- Fruma-era world map with pan and zoom
- Marker categories: quests, mini-quests, discoveries, caves, dungeons,
  raids, boss altars, world events, lootrun camps, travel points,
  profession spots, mobs
- Search, filters, found-state tracking, theme persistence
- Beta map surface
- GitHub Pages deployment workflow
