#!/usr/bin/env node
/** Restore Vite source index.html before dev/build. */
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(ROOT, 'index.source.html')
const target = join(ROOT, 'index.html')

if (!existsSync(source)) {
  console.error('index.source.html missing')
  process.exit(1)
}

copyFileSync(source, target)
console.log('Restored Vite index.html from index.source.html')
