#!/usr/bin/env node
/**
 * Import buildings, tours, and protection zones from a Notion HTML/CSV export.
 *
 * Usage:
 *   NOTION_DIR=/path/to/notion npm run import
 *
 * Looks for (in order):
 *   1. process.env.NOTION_DIR
 *   2. ./notion-export
 *   3. /Users/siaroza/Downloads/notion
 *   4. ~/Downloads/notion
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { parse as parseHtml } from 'node-html-parser'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PUBLIC = join(ROOT, 'public')
const DATA_DIR = join(PUBLIC, 'data')
const MEDIA_DIR = join(PUBLIC, 'media')

const STATUS_MAP = {
  Захаваўся: 'preserved',
  Перспектыўны: 'perspective',
  Страчаны: 'lost',
  'Выклікае трывогу': 'warning',
  Адноўлены: 'restored',
}

const TYPE_MAP = {
  Будынак: 'building',
  Каталіцызм: 'catholic',
  Праваслаўе: 'orthodox',
  Іудаізм: 'jewish',
  Рознае: 'other',
}

const PIN_TYPE = {
  building: 'building',
  catholic: 'catolic',
  orthodox: 'orthodox',
  jewish: 'jewish',
  other: 'building',
}

const PIN_STATUS = {
  preserved: 'default',
  restored: 'default',
  perspective: 'new',
  lost: 'lost',
  warning: 'warning',
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function candidateRoots() {
  const home = process.env.HOME || ''
  return [
    process.env.NOTION_DIR,
    join(ROOT, 'notion-export'),
    '/Users/siaroza/Downloads/notion',
    join(home, 'Downloads/notion'),
    '/workspace/notion',
    join(ROOT, '..', 'notion'),
  ].filter(Boolean)
}

function findNotionRoot() {
  for (const root of candidateRoots()) {
    if (!existsSync(root)) continue
    // Export may be notion/ or notion/Кропкі/
    if (existsSync(join(root, 'Кропкі'))) return join(root, 'Кропкі')
    const entries = readdirSync(root)
    if (entries.some((e) => e.startsWith('Будынкі') && e.endsWith('.csv'))) return root
    const nested = entries.map((e) => join(root, e)).find((p) => existsSync(join(p, 'Будынкі')) || readdirSync(p).some((e) => e.startsWith('Будынкі') && e.endsWith('.csv')))
    if (nested) return nested
  }
  return null
}

function findFile(dir, prefix, suffix) {
  if (!existsSync(dir)) return null
  const hit = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(suffix))
  return hit ? join(dir, hit) : null
}

function slugify(input) {
  return String(input || 'item')
    .normalize('NFKD')
    .replace(/[^\w\u0400-\u04FF-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function readCsv(path) {
  const raw = readFileSync(path, 'utf8')
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  })
}

function decodeCoverPath(cover) {
  if (!cover) return []
  return cover
    .split(',')
    .map((p) => decodeURIComponent(p.trim()))
    .filter(Boolean)
}

function extractDescription(htmlPath) {
  if (!htmlPath || !existsSync(htmlPath)) return ''
  const html = readFileSync(htmlPath, 'utf8')
  const root = parseHtml(html)
  const paras = root
    .querySelectorAll('p')
    .map((p) => p.text.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 40 && !t.startsWith('http') && !/^[\d\s.,]+$/.test(t))
  // Deduplicate while preserving order
  const seen = new Set()
  const unique = []
  for (const p of paras) {
    if (seen.has(p)) continue
    seen.add(p)
    unique.push(p)
  }
  return unique.slice(0, 12).join('\n\n')
}

function findBuildingHtml(buildingsDir, name, code) {
  if (!existsSync(buildingsDir)) return null
  const files = readdirSync(buildingsDir).filter((f) => f.endsWith('.html'))
  const exact = files.find((f) => f.startsWith(`${name} `) || f === `${name}.html`)
  if (exact) return join(buildingsDir, exact)
  if (code) {
    const byCode = files.find((f) => f.includes(code))
    if (byCode) return join(buildingsDir, byCode)
  }
  return null
}

function findBuildingFolder(buildingsDir, name, coverPaths) {
  if (!existsSync(buildingsDir)) return null
  // Prefer folder referenced by cover path
  for (const cover of coverPaths) {
    const parts = cover.split('/')
    if (parts.length >= 2 && parts[0] === 'Будынкі') {
      const folder = join(buildingsDir, parts[1])
      if (existsSync(folder) && statSync(folder).isDirectory()) return folder
    }
  }
  const dirs = readdirSync(buildingsDir).filter((f) => {
    const p = join(buildingsDir, f)
    return statSync(p).isDirectory()
  })
  const exact = dirs.find((d) => d === name || d.startsWith(`${name} `) || d.startsWith(`${name}-`))
  return exact ? join(buildingsDir, exact) : null
}

async function optimizeImage(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  const ext = extname(dest).toLowerCase()
  try {
    let pipeline = sharp(src, { failOn: 'none' }).rotate().resize({
      width: 1200,
      height: 1200,
      fit: 'inside',
      withoutEnlargement: true,
    })
    if (ext === '.png') {
      await pipeline.png({ quality: 80, compressionLevel: 9 }).toFile(dest)
    } else if (ext === '.webp') {
      await pipeline.webp({ quality: 78 }).toFile(dest)
    } else {
      // normalize to jpg for photos
      const jpgDest = dest.replace(/\.(png|webp|gif|jpeg)$/i, '.jpg')
      await sharp(src, { failOn: 'none' })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toFile(jpgDest)
      return jpgDest
    }
    return dest
  } catch (err) {
    console.warn(`  sharp failed for ${src}: ${err.message}; copying raw`)
    copyFileSync(src, dest)
    return dest
  }
}

async function collectImages(folder, mediaKey, coverPaths, notionRoot) {
  const outDir = join(MEDIA_DIR, mediaKey)
  mkdirSync(outDir, { recursive: true })
  const sources = []

  for (const cover of coverPaths) {
    if (cover.startsWith('http')) continue
    const abs = join(notionRoot, cover)
    if (existsSync(abs) && IMAGE_EXT.has(extname(abs).toLowerCase())) sources.push(abs)
  }

  if (folder && existsSync(folder)) {
    for (const f of readdirSync(folder)) {
      const abs = join(folder, f)
      if (!statSync(abs).isFile()) continue
      if (!IMAGE_EXT.has(extname(f).toLowerCase())) continue
      sources.push(abs)
    }
  }

  // unique by basename
  const seen = new Set()
  const unique = []
  for (const s of sources) {
    const key = basename(s).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(s)
  }

  const images = []
  for (let i = 0; i < unique.length; i++) {
    const src = unique[i]
    const base = `${String(i + 1).padStart(2, '0')}-${slugify(basename(src, extname(src)))}.jpg`
    const dest = join(outDir, base)
    const written = await optimizeImage(src, dest)
    images.push(`media/${mediaKey}/${basename(written)}`)
  }
  return images
}

function parseTourCsv(path, name) {
  const rows = readCsv(path)
  const points = rows
    .map((r) => ({
      name: r.name || r.Name || '',
      lat: Number(r.lat),
      lon: Number(r.lon),
      order: Number(r.order || 0),
      connected: String(r.connected || '').toLowerCase() === 'yes',
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => a.order - b.order)

  return {
    id: slugify(name),
    name,
    points,
  }
}

async function importBuildings(notionRoot) {
  const csvPath = findFile(notionRoot, 'Будынкі', '.csv')
  if (!csvPath) throw new Error(`Buildings CSV not found under ${notionRoot}`)
  const buildingsDir = join(notionRoot, 'Будынкі')
  const rows = readCsv(csvPath)
  console.log(`Buildings CSV: ${rows.length} rows from ${basename(csvPath)}`)

  const buildings = []
  for (const row of rows) {
    const name = (row.name || '').trim()
    const code = String(row.code || '').trim()
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn(`  skip invalid row: ${name || '(no name)'}`)
      continue
    }

    const statusBe = (row.status || '').trim()
    const typeBe = (row.type || '').trim()
    const status = STATUS_MAP[statusBe] || 'preserved'
    const type = TYPE_MAP[typeBe] || 'building'
    const mediaKey = slugify(code || name)
    const coverPaths = decodeCoverPath(row.cover)
    const folder = findBuildingFolder(buildingsDir, name, coverPaths)
    const htmlPath = findBuildingHtml(buildingsDir, name, code)
    const images = await collectImages(folder, mediaKey, coverPaths, notionRoot)
    const description = extractDescription(htmlPath)

    buildings.push({
      id: code || mediaKey,
      name,
      address: (row.address || '').trim(),
      lat,
      lon,
      status,
      statusLabel: statusBe,
      type,
      typeLabel: typeBe,
      year: (row.year || '').trim(),
      style: (row.Style || row.style || '').trim(),
      image: images[0] || 'default/building_default.svg',
      images,
      description,
      pin: `${PIN_TYPE[type]}_${PIN_STATUS[status]}`,
    })
  }

  buildings.sort((a, b) => a.name.localeCompare(b.name, 'be'))
  writeFileSync(join(DATA_DIR, 'buildings.json'), JSON.stringify(buildings, null, 2))
  console.log(`Wrote ${buildings.length} buildings → public/data/buildings.json`)
  return buildings
}

function importTours(notionRoot) {
  const toursDir = join(notionRoot, 'Туры')
  const tours = []
  if (!existsSync(toursDir)) {
    writeFileSync(join(DATA_DIR, 'tours.json'), '[]')
    return tours
  }

  for (const f of readdirSync(toursDir)) {
    if (!f.endsWith('.csv')) continue
    const name = f.replace(/ [a-f0-9]{32}\.csv$/i, '').replace(/\.csv$/i, '')
    const tour = parseTourCsv(join(toursDir, f), name)
    if (tour.points.length) tours.push(tour)
  }

  writeFileSync(join(DATA_DIR, 'tours.json'), JSON.stringify(tours, null, 2))
  console.log(`Wrote ${tours.length} tours → public/data/tours.json`)
  return tours
}

function importZones(notionRoot) {
  const csvPath = findFile(notionRoot, 'Зоны аховы', '.csv')
  if (!csvPath) {
    writeFileSync(join(DATA_DIR, 'zones.json'), '[]')
    return []
  }
  const rows = readCsv(csvPath)
  const byName = new Map()
  for (const r of rows) {
    const name = (r.Name || r.name || '').trim() || 'zone'
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push({
      lat,
      lon,
      order: Number(r.order || 0),
      connected: String(r.connected || '').toLowerCase() === 'yes',
    })
  }

  const zones = [...byName.entries()].map(([name, points]) => ({
    id: slugify(name),
    name,
    points: points.sort((a, b) => a.order - b.order),
  }))

  writeFileSync(join(DATA_DIR, 'zones.json'), JSON.stringify(zones, null, 2))
  console.log(`Wrote ${zones.length} zones → public/data/zones.json`)
  return zones
}

function importIcons(notionRoot) {
  const csvPath = findFile(notionRoot, 'Иконки', '.csv') || findFile(notionRoot, 'Іконкі', '.csv')
  if (!csvPath) {
    writeFileSync(join(DATA_DIR, 'icons.json'), '[]')
    return []
  }
  const rows = readCsv(csvPath)
  const icons = rows
    .map((r) => ({
      name: (r.Name || r.name || '').trim(),
      lat: Number(r.lat),
      lon: Number(r.lon),
      img: (r.img || '').trim(),
    }))
    .filter((i) => i.name && Number.isFinite(i.lat) && Number.isFinite(i.lon))

  writeFileSync(join(DATA_DIR, 'icons.json'), JSON.stringify(icons, null, 2))
  console.log(`Wrote ${icons.length} icons → public/data/icons.json`)
  return icons
}

async function main() {
  const notionRoot = findNotionRoot()
  if (!notionRoot) {
    console.error('Notion export not found. Set NOTION_DIR or place export at ./notion-export')
    console.error('Tried:', candidateRoots().join('\n  '))
    process.exit(1)
  }

  console.log(`Using Notion export: ${notionRoot}`)
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(MEDIA_DIR, { recursive: true })

  await importBuildings(notionRoot)
  importTours(notionRoot)
  importZones(notionRoot)
  importIcons(notionRoot)

  const meta = {
    importedAt: new Date().toISOString(),
    source: notionRoot,
  }
  writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
  console.log('Import complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
