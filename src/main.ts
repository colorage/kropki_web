import 'leaflet/dist/leaflet.css'
import './styles/main.css'

import type { Building, BuildingStatus, BuildingType, Tour, Zone } from './types'
import { STATUS_LABELS, TYPE_LABELS } from './types'
import { asset } from './asset'
import { createMap } from './map'

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
        <button class="chip-toggle" id="toggle-tours" type="button" aria-pressed="false">Туры <span>на карце</span></button>
        <button class="chip-toggle" id="toggle-zones" type="button" aria-pressed="false">Зоны <span>аховы</span></button>
      </div>
    </header>
    <main class="main">
      <div id="map"></div>
      <aside class="sidebar" id="sidebar">
        <div>
          <h2>Фільтры</h2>
          <p class="count" id="count"></p>
        </div>
        <div class="filters">
          <div class="filter-row" id="status-filters"></div>
          <div class="filter-row" id="type-filters"></div>
        </div>
        <div class="legend" id="legend"></div>
        <section class="detail" id="detail">
          <button class="close" id="close-detail" type="button">Закрыць</button>
          <img class="detail-cover" id="detail-cover" alt="" />
          <h3 id="detail-title"></h3>
          <div class="detail-meta" id="detail-meta"></div>
          <p id="detail-address"></p>
          <p id="detail-year"></p>
          <p id="detail-description"></p>
        </section>
      </aside>
      <div class="loading" id="loading">Загрузка карты…</div>
    </main>
  </div>
`

const mapEl = document.querySelector<HTMLElement>('#map')!
const loadingEl = document.querySelector<HTMLElement>('#loading')!
const countEl = document.querySelector<HTMLElement>('#count')!
const statusFiltersEl = document.querySelector<HTMLElement>('#status-filters')!
const typeFiltersEl = document.querySelector<HTMLElement>('#type-filters')!
const legendEl = document.querySelector<HTMLElement>('#legend')!
const detailEl = document.querySelector<HTMLElement>('#detail')!
const searchInput = document.querySelector<HTMLInputElement>('#search')!
const clearSearchBtn = document.querySelector<HTMLButtonElement>('#clear-search')!
const suggestionsEl = document.querySelector<HTMLElement>('#suggestions')!
const toggleToursBtn = document.querySelector<HTMLButtonElement>('#toggle-tours')!
const toggleZonesBtn = document.querySelector<HTMLButtonElement>('#toggle-zones')!

const map = createMap(mapEl)

let allBuildings: Building[] = []
let tours: Tour[] = []
let zones: Zone[] = []
let activeStatuses = new Set<BuildingStatus>()
let activeTypes = new Set<BuildingType>()
let query = ''
let selectedId: string | null = null

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

function renderFilters() {
  const statuses = uniqueStatuses(allBuildings)
  const types = uniqueTypes(allBuildings)

  statusFiltersEl.innerHTML = statuses
    .map(
      (s) =>
        `<button type="button" data-status="${s}" aria-pressed="${activeStatuses.has(s)}">${STATUS_LABELS[s] || s}</button>`,
    )
    .join('')

  typeFiltersEl.innerHTML = types
    .map(
      (t) =>
        `<button type="button" data-type="${t}" aria-pressed="${activeTypes.has(t)}">${TYPE_LABELS[t] || t}</button>`,
    )
    .join('')

  legendEl.innerHTML = `
    <strong>Легенда статусаў</strong>
    ${['preserved', 'perspective', 'warning', 'lost']
      .map(
        (s) => `
      <div class="legend-item">
        <img src="${asset(`pins/building_${s === 'preserved' ? 'default' : s === 'perspective' ? 'new' : s}.svg`)}" alt="" />
        <span>${STATUS_LABELS[s as BuildingStatus]}</span>
      </div>`,
      )
      .join('')}
  `
}

function showDetail(b: Building) {
  selectedId = b.id
  detailEl.classList.add('open')
  const cover = document.querySelector<HTMLImageElement>('#detail-cover')!
  cover.src = asset(b.image || 'default/building_default.svg')
  cover.alt = b.name
  document.querySelector('#detail-title')!.textContent = b.name
  document.querySelector('#detail-meta')!.innerHTML = `
    <span class="badge status-${b.status}">${b.statusLabel || STATUS_LABELS[b.status]}</span>
    <span class="badge">${b.typeLabel || TYPE_LABELS[b.type]}</span>
    ${b.style ? `<span class="badge">${b.style}</span>` : ''}
  `
  document.querySelector('#detail-address')!.textContent = b.address || ''
  document.querySelector('#detail-year')!.textContent = b.year ? `Год: ${b.year}` : ''
  document.querySelector('#detail-description')!.textContent =
    b.description || 'Апісанне пакуль адсутнічае.'
}

function hideDetail() {
  selectedId = null
  detailEl.classList.remove('open')
  map.highlight(null)
}

function refresh() {
  const items = filtered()
  countEl.textContent = `Паказана ${items.length} з ${allBuildings.length}`
  map.setBuildings(items, (b) => {
    showDetail(b)
    map.focusBuilding(b)
  })
  if (selectedId && !items.some((b) => b.id === selectedId)) hideDetail()
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

document.querySelector('#close-detail')!.addEventListener('click', hideDetail)

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

async function boot() {
  const [buildings, tourData, zoneData] = await Promise.all([
    loadJson<Building[]>('data/buildings.json', []),
    loadJson<Tour[]>('data/tours.json', []),
    loadJson<Zone[]>('data/zones.json', []),
  ])

  allBuildings = buildings
  tours = tourData
  zones = zoneData

  renderFilters()
  refresh()
  loadingEl.remove()

  if (!buildings.length) {
    const err = document.createElement('div')
    err.className = 'error'
    err.textContent = 'Няма дадзеных. Запусціце npm run import з Notion-экспартам.'
    document.querySelector('.main')!.appendChild(err)
  }
}

boot()
