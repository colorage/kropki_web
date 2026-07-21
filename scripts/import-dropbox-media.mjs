#!/usr/bin/env node
/**
 * Import missing building photos + map icons from a Dropbox kropki backup zip.
 *
 * Usage:
 *   DROPBOX_ZIP=/tmp/kropki-dbx/kropki.zip node scripts/import-dropbox-media.mjs
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PUBLIC = join(ROOT, 'public')
const DATA_DIR = join(PUBLIC, 'data')
const MEDIA_DIR = join(PUBLIC, 'media')
const ICONS_DIR = join(PUBLIC, 'icons')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif'])

/** Explicit icon filename → building id (significant landmarks only). */
const ICON_BUILDING_IDS = {
  '3_svet.png': '60',
  'archiereysky.png': '45',
  'bank.png': '49',
  'bogoyavlensky.png': '64',
  'buynichy.png': '144',
  'dram.png': '135',
  'farny.png': '119',
  'kostel.png': '126',
  'krestovosdvizh.png': '122',
  'ksavery.png': '152',
  'lenina.png': '137',
  'muzey.png': '47',
  'nickolsky.png': '39',
  'pokrovskaya.png': '66',
  'pozemelny.png': '132',
  'ratusha.png': '1',
  'spasskaya.png': '65',
  'zamchyscha.png': '147',
  'zmeevka.png': '148',
  'zorka.png': '53',
}

function slugify(input) {
  return (
    String(input || 'item')
      .normalize('NFKD')
      .replace(/[^\w\u0400-\u04FF-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  )
}

async function optimizeImage(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  const jpgDest = dest.replace(/\.(png|webp|gif|jpeg|jfif)$/i, '.jpg')
  try {
    await sharp(src, { failOn: 'none' })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(jpgDest)
    return jpgDest
  } catch (err) {
    console.warn(`  sharp failed for ${src}: ${err.message}; copying raw`)
    copyFileSync(src, dest)
    return dest
  }
}

function unzip(zipPath, dest) {
  mkdirSync(dest, { recursive: true })
  // Dropbox zips sometimes include a leading "/" entry; unzip exits 2 on that warning.
  // Prefer Python zipfile which handles them cleanly.
  execFileSync(
    'python3',
    [
      '-c',
      `
import zipfile, sys
from pathlib import Path
z = zipfile.ZipFile(sys.argv[1])
dest = Path(sys.argv[2])
for info in z.infolist():
    name = info.filename.lstrip('/')
    if not name or name.endswith('/'):
        (dest / name).mkdir(parents=True, exist_ok=True)
        continue
    out = dest / name
    out.parent.mkdir(parents=True, exist_ok=True)
    with z.open(info) as src, open(out, 'wb') as dst:
        dst.write(src.read())
print('extracted', len(z.namelist()), 'entries')
`,
      zipPath,
      dest,
    ],
    { stdio: 'inherit' },
  )
}

async function importBuildingPhotos(backupRoot, buildings) {
  const imgRoot = join(backupRoot, 'img')
  const coversRoot = join(backupRoot, 'covers')
  let filled = 0
  const stillMissing = []

  for (const b of buildings) {
    if (b.images && b.images.length) continue

    const id = String(b.id)
    const folder = join(imgRoot, id)
    const sources = []

    if (existsSync(folder)) {
      for (const f of readdirSync(folder)) {
        const abs = join(folder, f)
        if (!IMAGE_EXT.has(extname(f).toLowerCase())) continue
        sources.push(abs)
      }
    }

    if (!sources.length && existsSync(coversRoot)) {
      for (const f of readdirSync(coversRoot)) {
        const stem = basename(f, extname(f))
        if (stem === id && IMAGE_EXT.has(extname(f).toLowerCase())) {
          sources.push(join(coversRoot, f))
        }
      }
    }

    if (!sources.length) {
      stillMissing.push({ id, name: b.name })
      continue
    }

    sources.sort((a, b) => basename(a).localeCompare(basename(b), 'en'))
    const outDir = join(MEDIA_DIR, id)
    mkdirSync(outDir, { recursive: true })
    const images = []
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]
      const base = `${String(i + 1).padStart(2, '0')}-${slugify(basename(src, extname(src)))}.jpg`
      const written = await optimizeImage(src, join(outDir, base))
      images.push(`media/${id}/${basename(written)}`)
    }
    b.images = images
    b.image = images[0]
    filled++
    console.log(`  + ${id} ${b.name} (${images.length} photos)`)
  }

  return { filled, stillMissing }
}

function importIcons(backupRoot, buildings) {
  const iconsSrc = join(backupRoot, 'icons')
  mkdirSync(ICONS_DIR, { recursive: true })
  const byId = new Map(buildings.map((b) => [String(b.id), b]))
  const icons = []

  const files = existsSync(iconsSrc)
    ? readdirSync(iconsSrc).filter((f) => f.toLowerCase().endsWith('.png'))
    : []

  for (const file of files.sort()) {
    const src = join(iconsSrc, file)
    const dest = join(ICONS_DIR, file)
    copyFileSync(src, dest)
    const id = ICON_BUILDING_IDS[file]
    const building = id ? byId.get(id) : null
    if (!building) {
      console.warn(`  icon ${file} has no building mapping`)
      continue
    }
    building.mapIcon = `icons/${file}`
    icons.push({
      id: building.id,
      name: building.name,
      lat: building.lat,
      lon: building.lon,
      img: `icons/${file}`,
    })
    console.log(`  icon ${file} → ${building.id} ${building.name}`)
  }

  writeFileSync(join(DATA_DIR, 'icons.json'), JSON.stringify(icons, null, 2) + '\n')
  return icons
}

async function main() {
  const zipPath = process.env.DROPBOX_ZIP || '/tmp/kropki-dbx/kropki.zip'
  if (!existsSync(zipPath)) {
    console.error(`Zip not found: ${zipPath}`)
    process.exit(1)
  }

  const buildingsPath = join(DATA_DIR, 'buildings.json')
  const buildings = JSON.parse(readFileSync(buildingsPath, 'utf8'))
  console.log(`Buildings: ${buildings.length}`)

  const extractDir = mkdtempSync(join(tmpdir(), 'kropki-backup-'))
  try {
    console.log(`Extracting ${zipPath} → ${extractDir}`)
    unzip(zipPath, extractDir)

    // Zip may extract flat or under a single root folder
    let backupRoot = extractDir
    const top = readdirSync(extractDir)
    if (!top.includes('img') && !top.includes('icons')) {
      const nested = top.map((t) => join(extractDir, t)).find((p) => existsSync(join(p, 'img')))
      if (nested) backupRoot = nested
    }
    console.log(`Backup root: ${backupRoot}`)

    console.log('Importing missing photos…')
    const { filled, stillMissing } = await importBuildingPhotos(backupRoot, buildings)
    console.log(`Filled ${filled} buildings; still missing ${stillMissing.length}`)
    for (const m of stillMissing) console.log(`  - ${m.id} ${m.name}`)

    console.log('Importing map icons…')
    const icons = importIcons(backupRoot, buildings)
    console.log(`Wrote ${icons.length} icons`)

    writeFileSync(buildingsPath, JSON.stringify(buildings, null, 2) + '\n')
    const meta = {
      importedAt: new Date().toISOString(),
      source: 'dropbox-kropki-backup',
      zip: zipPath,
      photosFilled: filled,
      stillMissingPhotos: stillMissing,
      mapIcons: icons.length,
    }
    writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
    console.log('Done.')
  } finally {
    rmSync(extractDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
