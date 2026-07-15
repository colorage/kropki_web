# Кропкі (kropki_web)

Static interactive map of historic buildings in **Mahilioŭ (Магілёў)** for GitHub Pages.

- Leaflet + white Carto Positron (OSM) tiles — no Mapbox / no backend
- Data imported from a Notion HTML/CSV export
- Pin icons by building type and preservation status

**Live:** https://colorage.github.io/kropki_web/

## Setup

1. Enable **Settings → Pages → Source: GitHub Actions**
2. Push to `main` — the workflow builds with Vite `base: '/kropki_web/'` and deploys

## Develop

```bash
npm install
NOTION_DIR=~/Downloads/notion npm run import   # preferred (full dataset + photos)
# or, if Notion export is missing:
npm run bootstrap
npm run dev
```

Open http://localhost:5173/kropki_web/

## Import from Notion

Export the Notion workspace as **HTML** (including assets). Point the importer at the folder that contains `Кропкі/` (or the `Кропкі` folder itself):

```bash
NOTION_DIR=~/Downloads/notion npm run import
# or after unzipping into the repo:
NOTION_DIR=./notion-export/notion npm run import
```

This writes:

- `public/data/buildings.json`
- `public/data/tours.json`
- `public/data/zones.json`
- `public/data/icons.json`
- compressed images under `public/media/`

Raw Notion export folders (`notion-export/`) stay gitignored — only generated JSON + media are committed.

## Deploy

```bash
npm run build
git add public/data public/media src
git commit -m "Update map data and UI"
git push origin main
```

Site URL: `https://colorage.github.io/kropki_web/`

## UI features

1. Mahilioŭ-centered map (not Minsk)
2. Pins by type + status
3. Search with suggestions
4. Detail panel with descriptions + photo gallery
5. Status / type filters, clear filters, legend (incl. restored)
6. Tours and protection zones overlays
7. Mobile-friendly header and bottom sheet
8. Fully static JSON + media (no API keys)
