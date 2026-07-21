# Кропкі (kropki_web)

Static interactive map of historic buildings in **Mahilioŭ (Магілёў)** for GitHub Pages.

- Leaflet + white Carto Positron (OSM) tiles — no Mapbox / no backend
- Data imported from a Notion HTML/CSV export
- Dot markers by building type and preservation status

**Live:** https://kropki.siaroza.com/

## GitHub Pages setup (important)

This repo currently publishes the **built site at the repository root** so it works with:

**Settings → Pages → Deploy from a branch → `main` / `/ (root)`**

Optional (cleaner): switch Pages source to **GitHub Actions** (workflow already exists). Then you can stop committing root `assets/` / built `index.html` and rely on `dist/` from CI only.

## Develop

```bash
npm install
NOTION_DIR=~/Downloads/notion npm run import   # preferred (full dataset + photos)
npm run dev
```

`npm run dev` restores `index.source.html` → `index.html` for Vite.

Open http://localhost:5173/

## Import from Notion

```bash
NOTION_DIR=~/Downloads/notion npm run import
# or:
NOTION_DIR=./notion-export/notion npm run import
```

Writes `public/data/*.json` and `public/media/**`. Raw Notion folders stay gitignored.

## Build / publish

```bash
npm run build   # vite build + sync dist → repo root for branch Pages
git add -A
git commit -m "Update published site"
git push origin main
```

Synced to root for Pages: `index.html`, `assets/`, `data/`, `media/`, `pins/`, `logo.svg`, …

## UI features

1. Mahilioŭ-centered map (not Minsk)
2. Dots by type + status
3. Search with suggestions
4. Detail panel with descriptions + photo gallery
5. Status / type filters, clear filters
6. Protection zones always shown on the map
7. Mobile-friendly header and bottom sheet
8. Fully static JSON + media (no API keys)
