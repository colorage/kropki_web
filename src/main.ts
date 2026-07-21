import 'leaflet/dist/leaflet.css'
import './styles/main.css'

import type { Building, BuildingStatus, BuildingType, Tour, Zone } from './types'
import { STATUS_LABELS, TYPE_LABELS } from './types'
import { asset } from './asset'
import { createMap } from './map'

const DEFAULT_COVER = 'default/building_default.svg'
const LEGEND_STATUSES: BuildingStatus[] = ['preserved', 'restored', 'perspective', 'warning', 'lost']

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app missing')

app.innerHTML = `
  <div class="app-shell">
    <header class="header">
      <div class="brand">
        <img src="${asset('logo.svg')}" alt="Кропкі" />
        <div>
          <div class="brand-title">Кропкі</div>
          <div class="brand-sub">Гістарычныя будынкі Магілёва</div>
        </div>
      </div>
      <div class="search-wrap">
        <input id="search" type="search" placeholder="Пошук па назве або адрасе" autocomplete="off" />
        <button class="clear" id="clear-search" type="button" hidden aria-label="Ачысціць">✕</button>
        <div class="suggestions" id="suggestions" role="listbox"></div>
      </div>
      <div class="header-actions">
        <button class="chip-toggle" id="toggle-tours" type="button" aria-pressed="false" hidden>Туры <span>на карце</span></button>
        <button class="chip-toggle" id="toggle-zones" type="button" aria-pressed="false" hidden>Зоны <span>аховы</span></button>
      </div>
    </header>
    <main class="main" id="main">
      <div id="map"></div>
      <aside class="filter-panel" id="filter-panel">
        <div class="filter-panel-head">
          <button class="filter-toggle" id="filter-toggle" type="button" aria-expanded="true" aria-controls="filter-body">
            <span class="filter-toggle-label">Фільтры</span>
            <span class="count" id="count"></span>
          </button>
          <button class="text-btn" id="clear-filters" type="button" hidden>Скінуць</button>
        </div>
        <div class="filter-body" id="filter-body">
          <div class="filters">
            <div class="filter-row" id="status-filters"></div>
            <div class="filter-row" id="type-filters"></div>
          </div>
          <p class="filter-empty" id="filter-empty" hidden>Нічога не знойдзена. <button class="text-btn" id="clear-filters-empty" type="button">Скінуць фільтры</button></p>
        </div>
      </aside>
      <div class="legend-control" id="legend-control">
        <button class="legend-toggle" id="legend-toggle" type="button" aria-expanded="false" aria-controls="legend">Легенда</button>
        <div class="legend" id="legend" hidden></div>
      </div>
      <section class="detail-panel" id="detail" aria-hidden="true">
        <button class="close" id="close-detail" type="button">Закрыць</button>
        <img class="detail-cover" id="detail-cover" alt="" />
        <div class="gallery" id="detail-gallery" hidden></div>
        <h3 id="detail-title"></h3>
        <div class="detail-meta" id="detail-meta"></div>
        <p id="detail-address" hidden></p>
        <p id="detail-year" hidden></p>
        <p id="detail-description"></p>
      </section>
      <div class="loading" id="loading">Загрузка карты…</div>
    </main>
  </div>
`

const mainEl = document.querySelector<HTMLElement>('#main')!
const mapEl = document.querySelector<HTMLElement>('#map')!
const loadingEl = document.querySelector<HTMLElement>('#loading')!
const countEl = document.querySelector<HTMLElement>('#count')!
const statusFiltersEl = document.querySelector<HTMLElement>('#status-filters')!
const typeFiltersEl = document.querySelector<HTMLElement>('#type-filters')!
const legendEl = document.querySelector<HTMLElement>('#legend')!
const legendToggleBtn = document.querySelector<HTMLButtonElement>('#legend-toggle')!
const filterToggleBtn = document.querySelector<HTMLButtonElement>('#filter-toggle')!
const filterBodyEl = document.querySelector<HTMLElement>('#filter-body')!
const filterEmptyEl = document.querySelector<HTMLElement>('#filter-empty')!
const detailEl = document.querySelector<HTMLElement>('#detail')!
const closeDetailBtn = document.querySelector<HTMLButtonElement>('#close-detail')!
const searchInput = document.querySelector<HTMLInputElement>('#search')!
const clearSearchBtn = document.querySelector<HTMLButtonElement>('#clear-search')!
const clearFiltersBtn = document.querySelector<HTMLButtonElement>('#clear-filters')!
const clearFiltersEmptyBtn = document.querySelector<HTMLButtonElement>('#clear-filters-empty')!
const suggestionsEl = document.querySelector<HTMLElement>('#suggestions')!
const toggleToursBtn = document.querySelector<HTMLButtonElement>('#toggle-tours')!
const toggleZonesBtn = document.querySelector<HTMLButtonElement>('#toggle-zones')!
const coverEl = document.querySelector<HTMLImageElement>('#detail-cover')!
const galleryEl = document.querySelector<HTMLElement>('#detail-gallery')!
const addressEl = document.querySelector<HTMLElement>('#detail-address')!
const yearEl = document.querySelector<HTMLElement>('#detail-year')!

const map = createMap(mapEl)

let allBuildings: Building[] = []
let tours: Tour[] = []
let zones: Zone[] = []
let activeStatuses = new Set<BuildingStatus>()
let activeTypes = new Set<BuildingType>()
let query = ''
let selectedId: string | null = null
let filtersExpanded = true

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(asset(path))
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

function uniqueStatuses(buildings: Building[]): BuildingStatus[] {
  return [...new Set(buildings.map((b) => b.status))]
}

function uniqueTypes(buildings: Building[]): BuildingType[] {
  return [...new Set(buildings.map((b) => b.type))]
}

function filtered(): Building[] {
  return allBuildings.filter((b) => {
    if (activeStatuses.size && !activeStatuses.has(b.status)) return false
    if (activeTypes.size && !activeTypes.has(b.type)) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      b.name.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q) ||
      b.year.toLowerCase().includes(q)
    )
  })
}

function pinStatusFile(status: BuildingStatus): string {
  if (status === 'preserved' || status === 'restored') return 'default'
  if (status === 'perspective') return 'new'
  return status
}

function activeFilterCount(): number {
  return activeStatuses.size + activeTypes.size
}

function syncClearFilters() {
  const hasFilters = activeFilterCount() > 0
  clearFiltersBtn.hidden = !hasFilters
}

function syncFilterToggleLabel(shown: number) {
  const n = activeFilterCount()
  if (n > 0) {
    countEl.textContent = `${shown} · ${n} фільтр${n === 1 ? '' : n < 5 ? 'ы' : 'аў'}`
  } else {
    countEl.textContent = `Паказана ${shown} з ${allBuildings.length}`
  }
}

function setFiltersExpanded(expanded: boolean) {
  filtersExpanded = expanded
  filterToggleBtn.setAttribute('aria-expanded', String(expanded))
  filterBodyEl.hidden = !expanded
  mainEl.classList.toggle('filters-collapsed', !expanded)
}

function renderFilters() {
  const statuses = uniqueStatuses(allBuildings)
  const types = uniqueTypes(allBuildings)

  statusFiltersEl.innerHTML = statuses
    .map(
      (s) => `
      <button type="button" class="filter-chip" data-status="${s}" aria-pressed="${activeStatuses.has(s)}">
        <img src="${asset(`pins/building_${pinStatusFile(s)}.svg`)}" alt="" width="14" height="14" />
        <span>${STATUS_LABELS[s] || s}</span>
      </button>`,
    )
    .join('')

  typeFiltersEl.innerHTML = types
    .map(
      (t) =>
        `<button type="button" class="filter-chip" data-type="${t}" aria-pressed="${activeTypes.has(t)}">${TYPE_LABELS[t] || t}</button>`,
    )
    .join('')

  legendEl.innerHTML = LEGEND_STATUSES.map(
    (s) => `
      <div class="legend-item">
        <img src="${asset(`pins/building_${pinStatusFile(s)}.svg`)}" alt="" />
        <span>${STATUS_LABELS[s]}</span>
      </div>`,
  ).join('')

  syncClearFilters()
}

function setCover(src: string, alt: string) {
  coverEl.onerror = () => {
    coverEl.onerror = null
    coverEl.src = asset(DEFAULT_COVER)
  }
  coverEl.src = asset(src || DEFAULT_COVER)
  coverEl.alt = alt
}

function renderGallery(b: Building) {
  const images = (b.images || []).filter(Boolean)
  if (images.length <= 1) {
    galleryEl.hidden = true
    galleryEl.innerHTML = ''
    return
  }

  galleryEl.hidden = false
  galleryEl.innerHTML = images
    .map(
      (src, i) => `
      <button type="button" class="gallery-thumb${i === 0 ? ' is-active' : ''}" data-src="${src}" aria-label="Фота ${i + 1}">
        <img src="${asset(src)}" alt="" loading="lazy" />
      </button>`,
    )
    .join('')
}

function showDetail(b: Building) {
  selectedId = b.id
  detailEl.classList.add('open')
  detailEl.setAttribute('aria-hidden', 'false')
  mainEl.classList.add('has-selection')
  mapEl.classList.add('has-selection')
  setFiltersExpanded(false)
  setCover(b.image || DEFAULT_COVER, b.name)
  renderGallery(b)

  document.querySelector('#detail-title')!.textContent = b.name
  document.querySelector('#detail-meta')!.innerHTML = `
    <span class="badge status-${b.status}">${b.statusLabel || STATUS_LABELS[b.status]}</span>
    <span class="badge">${b.typeLabel || TYPE_LABELS[b.type]}</span>
    ${b.style ? `<span class="badge">${b.style}</span>` : ''}
  `

  if (b.address) {
    addressEl.hidden = false
    addressEl.textContent = b.address
  } else {
    addressEl.hidden = true
    addressEl.textContent = ''
  }

  if (b.year) {
    yearEl.hidden = false
    yearEl.textContent = `Год: ${b.year}`
  } else {
    yearEl.hidden = true
    yearEl.textContent = ''
  }

  document.querySelector('#detail-description')!.textContent =
    b.description || 'Апісанне пакуль адсутнічае.'

  closeDetailBtn.focus()
}

function hideDetail() {
  selectedId = null
  detailEl.classList.remove('open')
  detailEl.setAttribute('aria-hidden', 'true')
  mainEl.classList.remove('has-selection')
  mapEl.classList.remove('has-selection')
  map.highlight(null)
  setFiltersExpanded(true)
}

function clearAllFilters() {
  activeStatuses.clear()
  activeTypes.clear()
  if (query) {
    query = ''
    searchInput.value = ''
    clearSearchBtn.hidden = true
    suggestionsEl.classList.remove('open')
  }
  renderFilters()
  refresh()
  renderSuggestions()
}

function refresh() {
  const items = filtered()
  syncFilterToggleLabel(items.length)
  filterEmptyEl.hidden = !(items.length === 0 && allBuildings.length > 0)
  map.setBuildings(items, (b) => {
    showDetail(b)
    map.focusBuilding(b)
  })
  if (selectedId && !items.some((b) => b.id === selectedId)) hideDetail()
  syncClearFilters()
}

function renderSuggestions() {
  const q = query.trim().toLowerCase()
  if (!q) {
    suggestionsEl.classList.remove('open')
    suggestionsEl.innerHTML = ''
    return
  }
  const hits = filtered().slice(0, 8)
  if (!hits.length) {
    suggestionsEl.classList.remove('open')
    suggestionsEl.innerHTML = ''
    return
  }
  suggestionsEl.innerHTML = hits
    .map(
      (b) => `
      <button type="button" role="option" data-id="${b.id}">
        <span class="name">${b.name}</span>
        <span class="meta">${b.address || b.statusLabel}</span>
      </button>`,
    )
    .join('')
  suggestionsEl.classList.add('open')
}

filterToggleBtn.addEventListener('click', () => {
  setFiltersExpanded(!filtersExpanded)
})

legendToggleBtn.addEventListener('click', () => {
  const open = legendToggleBtn.getAttribute('aria-expanded') !== 'true'
  legendToggleBtn.setAttribute('aria-expanded', String(open))
  legendEl.hidden = !open
})

statusFiltersEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-status]')
  if (!btn) return
  const status = btn.dataset.status as BuildingStatus
  if (activeStatuses.has(status)) activeStatuses.delete(status)
  else activeStatuses.add(status)
  btn.setAttribute('aria-pressed', String(activeStatuses.has(status)))
  refresh()
  renderSuggestions()
})

typeFiltersEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-type]')
  if (!btn) return
  const type = btn.dataset.type as BuildingType
  if (activeTypes.has(type)) activeTypes.delete(type)
  else activeTypes.add(type)
  btn.setAttribute('aria-pressed', String(activeTypes.has(type)))
  refresh()
  renderSuggestions()
})

clearFiltersBtn.addEventListener('click', clearAllFilters)
clearFiltersEmptyBtn.addEventListener('click', clearAllFilters)

searchInput.addEventListener('input', () => {
  query = searchInput.value
  clearSearchBtn.hidden = !query
  refresh()
  renderSuggestions()
})

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = ''
  query = ''
  clearSearchBtn.hidden = true
  suggestionsEl.classList.remove('open')
  refresh()
})

suggestionsEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]')
  if (!btn) return
  const b = allBuildings.find((x) => x.id === btn.dataset.id)
  if (!b) return
  searchInput.value = b.name
  query = b.name
  clearSearchBtn.hidden = false
  suggestionsEl.classList.remove('open')
  refresh()
  showDetail(b)
  map.focusBuilding(b)
})

galleryEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-src]')
  if (!btn) return
  const src = btn.dataset.src
  if (!src) return
  setCover(src, coverEl.alt)
  galleryEl.querySelectorAll('.gallery-thumb').forEach((el) => el.classList.remove('is-active'))
  btn.classList.add('is-active')
})

closeDetailBtn.addEventListener('click', hideDetail)

toggleToursBtn.addEventListener('click', () => {
  const next = toggleToursBtn.getAttribute('aria-pressed') !== 'true'
  toggleToursBtn.setAttribute('aria-pressed', String(next))
  map.setToursVisible(next, tours)
})

toggleZonesBtn.addEventListener('click', () => {
  const next = toggleZonesBtn.getAttribute('aria-pressed') !== 'true'
  toggleZonesBtn.setAttribute('aria-pressed', String(next))
  map.setZonesVisible(next, zones)
})

document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.search-wrap')) {
    suggestionsEl.classList.remove('open')
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    suggestionsEl.classList.remove('open')
    if (detailEl.classList.contains('open')) hideDetail()
  }
})

async function boot() {
  const [buildings, tourData, zoneData] = await Promise.all([
    loadJson<Building[]>('data/buildings.json', []),
    loadJson<Tour[]>('data/tours.json', []),
    loadJson<Zone[]>('data/zones.json', []),
  ])

  allBuildings = buildings
  tours = tourData
  zones = zoneData

  if (tours.length) {
    toggleToursBtn.hidden = false
    toggleToursBtn.innerHTML = `Туры <span>(${tours.length})</span>`
  }

  if (zones.length) {
    toggleZonesBtn.hidden = false
    toggleZonesBtn.innerHTML = `Зоны <span>(${zones.length})</span>`
  }

  renderFilters()
  refresh()
  loadingEl.remove()

  if (!buildings.length) {
    const err = document.createElement('div')
    err.className = 'error'
    err.textContent = 'Няма дадзеных. Запусціце npm run import з Notion-экспартам.'
    mainEl.appendChild(err)
  }
}

boot()
