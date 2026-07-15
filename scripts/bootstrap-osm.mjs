#!/usr/bin/env node
/**
 * Fallback dataset when Notion export is unavailable.
 * Pulls historic / tourism nodes from OSM around Mahilioŭ.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'public', 'data')

const QUERY = `
[out:json][timeout:60];
(
  node["historic"](53.86,30.28,53.95,30.40);
  way["historic"](53.86,30.28,53.95,30.40);
  node["tourism"~"museum|attraction|gallery"](53.86,30.28,53.95,30.40);
  node["building"~"church|cathedral|chapel|synagogue"](53.86,30.28,53.95,30.40);
  node["amenity"="place_of_worship"](53.86,30.28,53.95,30.40);
);
out center tags;
`

function mapReligion(tags) {
  const r = (tags.religion || '').toLowerCase()
  if (r.includes('catholic') || r.includes('roman_catholic')) return ['catholic', 'Каталіцызм']
  if (r.includes('orthodox') || r.includes('christian')) {
    if ((tags.denomination || '').includes('orthodox') || r.includes('orthodox')) {
      return ['orthodox', 'Праваслаўе']
    }
  }
  if (r.includes('jewish')) return ['jewish', 'Іудаізм']
  const b = tags.building || ''
  if (b === 'church' || b === 'cathedral' || b === 'chapel') return ['orthodox', 'Праваслаўе']
  if (b === 'synagogue') return ['jewish', 'Іудаізм']
  return ['building', 'Будынак']
}

function pickName(tags) {
  return (
    tags['name:be'] ||
    tags.name ||
    tags['name:ru'] ||
    tags['name:en'] ||
    tags['historic'] ||
    'Аб\'ект'
  )
}

async function main() {
  mkdirSync(DATA, { recursive: true })
  console.log('Querying Overpass for Mahilioŭ historic sites…')
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ]
  let res
  let lastErr
  for (const url of endpoints) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'kropki_web/1.0 (heritage map bootstrap)',
        },
        body: QUERY,
      })
      if (res.ok) break
      lastErr = new Error(`Overpass HTTP ${res.status} at ${url}`)
    } catch (e) {
      lastErr = e
    }
  }
  if (!res || !res.ok) throw lastErr || new Error('Overpass failed')
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()

  const seen = new Set()
  const buildings = []
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue
    const tags = el.tags || {}
    const name = pickName(tags)
    const key = `${name}|${lat.toFixed(5)}|${lon.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)

    const [type, typeLabel] = mapReligion(tags)
    const year = tags.start_date || tags.year || tags['building:year'] || ''
    buildings.push({
      id: String(el.id),
      name,
      address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', '),
      lat,
      lon,
      status: 'preserved',
      statusLabel: 'Захаваўся',
      type,
      typeLabel,
      year,
      style: '',
      image: 'default/building_default.svg',
      images: [],
      description: tags.description || tags.wikipedia || tags.wikidata
        ? [tags.description, tags.wikipedia ? `Wikipedia: ${tags.wikipedia}` : '', tags.wikidata ? `Wikidata: ${tags.wikidata}` : '']
            .filter(Boolean)
            .join('\n\n')
        : '',
      pin: `${type === 'catholic' ? 'catolic' : type === 'other' ? 'building' : type}_default`,
      source: 'osm-bootstrap',
    })
  }

  buildings.sort((a, b) => a.name.localeCompare(b.name, 'be'))
  writeFileSync(join(DATA, 'buildings.json'), JSON.stringify(buildings, null, 2))
  writeFileSync(join(DATA, 'tours.json'), '[]')
  writeFileSync(join(DATA, 'zones.json'), '[]')
  writeFileSync(join(DATA, 'icons.json'), '[]')
  writeFileSync(
    join(DATA, 'meta.json'),
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        source: 'openstreetmap-overpass-bootstrap',
        note: 'Replace by running npm run import with Notion export',
        count: buildings.length,
      },
      null,
      2,
    ),
  )
  console.log(`Bootstrap wrote ${buildings.length} buildings`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
