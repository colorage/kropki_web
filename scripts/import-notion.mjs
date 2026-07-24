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

/** Split cover CSV without breaking commas inside Notion folder names. */
function decodeCoverPath(cover) {
  if (!cover) return []
  return cover
    .split(/,(?=%|https?:\/\/|Будынкі)/)
    .map((p) => {
      try {
        return decodeURIComponent(p.trim())
      } catch {
        return p.trim()
      }
    })
    .filter(Boolean)
}

function normalizeTitle(input) {
  return String(input || '')
    .normalize('NFC')
    .replace(/[\"“”«»/()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const SHORT_ID_RE = /([0-9a-f]{4})-([0-9a-f]{4})/gi
const FULL_ID_RE = /([0-9a-f]{32})$/i

function extractShortIds(text) {
  const out = []
  const s = String(text || '')
  SHORT_ID_RE.lastIndex = 0
  let m
  while ((m = SHORT_ID_RE.exec(s))) {
    out.push(m[0].toLowerCase())
  }
  return out
}

function shortIdFromFull(fullId) {
  const id = String(fullId || '').toLowerCase()
  if (id.length !== 32) return null
  return `${id.slice(0, 4)}-${id.slice(-4)}`
}

function parseHtmlMeta(filename) {
  const stem = basename(filename, '.html').normalize('NFC')
  const m = stem.match(FULL_ID_RE)
  if (m) {
    const fullId = m[1].toLowerCase()
    const title = stem.slice(0, m.index).replace(/\s+$/, '')
    return {
      filename,
      title,
      norm: normalizeTitle(title),
      fullId,
      shortId: shortIdFromFull(fullId),
    }
  }
  return {
    filename,
    title: stem,
    norm: normalizeTitle(stem),
    fullId: null,
    shortId: null,
  }
}

function buildHtmlIndex(buildingsDir) {
  const files = existsSync(buildingsDir)
    ? readdirSync(buildingsDir).filter((f) => f.endsWith('.html'))
    : []
  const metas = files.map(parseHtmlMeta)
  const byShort = new Map()
  const byNorm = new Map()
  for (const meta of metas) {
    if (meta.shortId) byShort.set(meta.shortId, meta)
    if (!byNorm.has(meta.norm)) byNorm.set(meta.norm, [])
    byNorm.get(meta.norm).push(meta)
  }
  return { metas, byShort, byNorm }
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

function addressScore(htmlPath, address) {
  if (!htmlPath || !address || !existsSync(htmlPath)) return 0
  const text = readFileSync(htmlPath, 'utf8')
  const addr = address.normalize('NFC')
  let score = 0
  // Prefer longer street tokens from the address
  const tokens = addr
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t))
  for (const token of tokens) {
    if (text.includes(token)) score += token.length >= 6 ? 3 : 1
  }
  const num = addr.match(/(\d+)/g)
  if (num) {
    for (const n of num) {
      if (new RegExp(`(?:^|\\D)${n}(?:\\D|$)`).test(text)) score += 1
    }
  }
  return score
}

/**
 * Resolve Notion page HTML for a building.
 * Priority: cover short-id → cover folder sibling → unique title → unique prefix → address score.
 * Each HTML file may only be claimed once.
 */
function findBuildingHtml(buildingsDir, name, coverPaths, address, htmlIndex, claimed) {
  if (!existsSync(buildingsDir)) {
    return { path: null, method: 'missing-dir' }
  }

  const available = (meta) => meta && !claimed.has(meta.filename)

  // 1) Short Notion ids embedded anywhere in cover paths (folder or filename)
  for (const cover of coverPaths) {
    for (const shortId of extractShortIds(cover)) {
      const meta = htmlIndex.byShort.get(shortId)
      if (available(meta)) {
        return { path: join(buildingsDir, meta.filename), method: 'cover-short-id', meta }
      }
    }
  }

  // 2) Cover folder → sibling .html (exact stem, or stem without short-id suffix)
  for (const cover of coverPaths) {
    if (cover.startsWith('http')) continue
    const parts = cover.split('/')
    if (parts.length < 2 || parts[0] !== 'Будынкі') continue
    const folderOrFile = parts[1]
    const folderStem = folderOrFile.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    const exactName = `${folderStem}.html`
    if (existsSync(join(buildingsDir, exactName)) && !claimed.has(exactName)) {
      return {
        path: join(buildingsDir, exactName),
        method: 'cover-folder-exact',
        meta: parseHtmlMeta(exactName),
      }
    }
    const withoutShort = folderStem.replace(/\s+[0-9a-f]{4}-[0-9a-f]{4}$/i, '').trim()
    const titleKeys = [normalizeTitle(folderStem), normalizeTitle(withoutShort)].filter(Boolean)
    for (const key of titleKeys) {
      const cands = (htmlIndex.byNorm.get(key) || []).filter(available)
      if (cands.length === 1) {
        return { path: join(buildingsDir, cands[0].filename), method: 'cover-folder-title', meta: cands[0] }
      }
    }
  }

  // 3) Unique normalized title from building name
  const nameKeys = [
    normalizeTitle(name),
    normalizeTitle(name.split('/')[0]),
  ].filter(Boolean)
  for (const key of [...new Set(nameKeys)]) {
    const cands = (htmlIndex.byNorm.get(key) || []).filter(available)
    if (cands.length === 1) {
      return { path: join(buildingsDir, cands[0].filename), method: 'unique-title', meta: cands[0] }
    }
  }

  // 4) Unique prefix among remaining HTML (only when exactly one)
  const prefixCands = []
  const seen = new Set()
  for (const key of [...new Set(nameKeys)]) {
    if (!key) continue
    for (const meta of htmlIndex.metas) {
      if (!available(meta) || seen.has(meta.filename)) continue
      if (meta.norm === key || meta.norm.startsWith(`${key} `)) {
        seen.add(meta.filename)
        prefixCands.push(meta)
      }
    }
  }
  if (prefixCands.length === 1) {
    return { path: join(buildingsDir, prefixCands[0].filename), method: 'unique-prefix', meta: prefixCands[0] }
  }

  // 5) Disambiguate remaining exact-title candidates with address tokens
  const pool = []
  const poolSeen = new Set()
  for (const key of [...new Set(nameKeys)]) {
    for (const meta of htmlIndex.byNorm.get(key) || []) {
      if (!available(meta) || poolSeen.has(meta.filename)) continue
      poolSeen.add(meta.filename)
      pool.push(meta)
    }
  }
  if (pool.length === 1) {
    return { path: join(buildingsDir, pool[0].filename), method: 'unique-title-remaining', meta: pool[0] }
  }
  if (pool.length > 1 && address) {
    let best = null
    let bestScore = -1
    let tie = false
    for (const meta of pool) {
      const score = addressScore(join(buildingsDir, meta.filename), address)
      if (score > bestScore) {
        best = meta
        bestScore = score
        tie = false
      } else if (score === bestScore) {
        tie = true
      }
    }
    if (best && bestScore > 0 && !tie) {
      return { path: join(buildingsDir, best.filename), method: 'address-score', meta: best }
    }
    return { path: null, method: 'ambiguous', candidates: pool.map((m) => m.filename) }
  }

  if (pool.length > 1) {
    return { path: null, method: 'ambiguous', candidates: pool.map((m) => m.filename) }
  }

  return { path: null, method: 'unmatched' }
}

function findBuildingFolder(buildingsDir, name, coverPaths) {
  if (!existsSync(buildingsDir)) return null
  // Prefer folder referenced by cover path
  for (const cover of coverPaths) {
    if (cover.startsWith('http')) continue
    const parts = cover.split('/')
    if (parts.length >= 2 && parts[0] === 'Будынкі') {
      const folder = join(buildingsDir, parts[1])
      if (existsSync(folder) && statSync(folder).isDirectory()) return folder
      // Cover may be a file directly under Будынкі (…/Name short-id.jpg)
      if (parts.length === 2 && IMAGE_EXT.has(extname(parts[1]).toLowerCase())) {
        const shortIds = extractShortIds(parts[1])
        if (shortIds.length) {
          const dirs = readdirSync(buildingsDir).filter((f) => {
            const p = join(buildingsDir, f)
            return statSync(p).isDirectory() && extractShortIds(f).some((id) => shortIds.includes(id))
          })
          if (dirs.length === 1) return join(buildingsDir, dirs[0])
        }
      }
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

function buildImportReport(buildings, matchLog) {
  const byDesc = new Map()
  for (const b of buildings) {
    const d = (b.description || '').trim()
    if (!d) continue
    if (!byDesc.has(d)) byDesc.set(d, [])
    byDesc.get(d).push({ id: b.id, name: b.name })
  }
  const sharedDescriptions = [...byDesc.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([description, items]) => ({
      count: items.length,
      preview: description.slice(0, 120),
      buildings: items,
    }))
    .sort((a, b) => b.count - a.count)

  const unmatched = matchLog.filter((m) => !m.html)
  const emptyDescriptions = buildings
    .filter((b) => !(b.description || '').trim())
    .map((b) => ({ id: b.id, name: b.name, matchMethod: matchLog.find((m) => m.id === b.id)?.method }))

  const methodCounts = {}
  for (const m of matchLog) {
    methodCounts[m.method] = (methodCounts[m.method] || 0) + 1
  }

  return {
    total: buildings.length,
    withDescription: buildings.length - emptyDescriptions.length,
    emptyDescriptions,
    sharedDescriptions,
    unmatched,
    methodCounts,
    matches: matchLog,
  }
}

function rowHasCoverShortId(coverPaths) {
  return coverPaths.some((c) => extractShortIds(c).length > 0)
}

async function importBuildings(notionRoot) {
  const csvPath = findFile(notionRoot, 'Будынкі', '.csv')
  if (!csvPath) throw new Error(`Buildings CSV not found under ${notionRoot}`)
  const buildingsDir = join(notionRoot, 'Будынкі')
  const rows = readCsv(csvPath)
  console.log(`Buildings CSV: ${rows.length} rows from ${basename(csvPath)}`)

  const htmlIndex = buildHtmlIndex(buildingsDir)
  const claimed = new Set()
  const matchLog = []
  const buildings = []

  // Prepare valid rows; claim short-id HTML first so duplicate names resolve later.
  const prepared = []
  for (const row of rows) {
    const name = (row.name || '').trim()
    const code = String(row.code || '').trim()
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn(`  skip invalid row: ${name || '(no name)'}`)
      continue
    }
    const coverPaths = decodeCoverPath(row.cover)
    prepared.push({
      row,
      name,
      code,
      lat,
      lon,
      address: (row.address || '').trim(),
      coverPaths,
      hasShortId: rowHasCoverShortId(coverPaths),
    })
  }
  prepared.sort((a, b) => Number(b.hasShortId) - Number(a.hasShortId))

  for (const item of prepared) {
    const { row, name, code, lat, lon, address, coverPaths } = item
    const statusBe = (row.status || '').trim()
    const typeBe = (row.type || '').trim()
    const status = STATUS_MAP[statusBe] || 'preserved'
    const type = TYPE_MAP[typeBe] || 'building'
    const mediaKey = slugify(code || name)
    const folder = findBuildingFolder(buildingsDir, name, coverPaths)
    const match = findBuildingHtml(buildingsDir, name, coverPaths, address, htmlIndex, claimed)
    if (match.meta?.filename) claimed.add(match.meta.filename)
    else if (match.path) claimed.add(basename(match.path))

    const htmlPath = match.path
    const images = await collectImages(folder, mediaKey, coverPaths, notionRoot)
    const description = extractDescription(htmlPath)

    matchLog.push({
      id: code || mediaKey,
      name,
      method: match.method,
      html: htmlPath ? basename(htmlPath) : null,
      candidates: match.candidates || undefined,
      descriptionChars: description.length,
    })

    if (!htmlPath) {
      console.warn(`  unmatched HTML: ${code || '?'} ${name} (${match.method})`)
    }

    buildings.push({
      id: code || mediaKey,
      name,
      address,
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

  const report = buildImportReport(buildings, matchLog)
  writeFileSync(join(DATA_DIR, 'import-report.json'), JSON.stringify(report, null, 2))
  console.log(
    `HTML match: ${buildings.length - report.unmatched.length}/${buildings.length}` +
      ` | descriptions: ${report.withDescription}` +
      ` | shared descriptions: ${report.sharedDescriptions.length}` +
      ` | empty: ${report.emptyDescriptions.length}`,
  )
  if (report.sharedDescriptions.length) {
    console.warn('  WARNING: shared descriptions detected — check public/data/import-report.json')
  }
  console.log('Match methods:', report.methodCounts)

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
