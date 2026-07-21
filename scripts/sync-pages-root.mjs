#!/usr/bin/env node
/**
 * Copy Vite dist/ to the repo root so GitHub Pages "Deploy from branch / root"
 * can serve the production site at https://kropki.siaroza.com/
 *
 * Prefer switching Settings → Pages → Source to "GitHub Actions" when possible;
 * this sync exists because the API token cannot change that setting.
 */
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

const PUBLISH_DIRS = ['assets', 'data', 'default', 'media', 'pins', 'icons']
const PUBLISH_FILES = ['index.html', 'logo.svg', 'robots.txt', 'meta-cover.png']

if (!existsSync(DIST) || !existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ missing — run vite build first')
  process.exit(1)
}

for (const dir of PUBLISH_DIRS) {
  const from = join(DIST, dir)
  const to = join(ROOT, dir)
  if (!existsSync(from)) continue
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`synced ${dir}/`)
}

for (const file of PUBLISH_FILES) {
  const from = join(DIST, file)
  if (!existsSync(from)) continue
  cpSync(from, join(ROOT, file))
  console.log(`synced ${file}`)
}

// Sanity: production index must not reference Vite source
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
if (html.includes('/src/main.ts') || html.includes('%BASE_URL%')) {
  console.error('Root index.html still looks like Vite source — aborting')
  process.exit(1)
}

const assetCount = existsSync(join(ROOT, 'assets'))
  ? readdirSync(join(ROOT, 'assets')).length
  : 0
const mediaCount = existsSync(join(ROOT, 'media'))
  ? countFiles(join(ROOT, 'media'))
  : 0

console.log(`Publish root ready (${assetCount} asset files, ${mediaCount} media files)`)

function countFiles(dir) {
  let n = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) n += countFiles(p)
    else n += 1
  }
  return n
}
