import L from 'leaflet'
import type { Building } from './types'
import { asset } from './asset'

const MAHILIOU: L.LatLngExpression = [53.9006, 30.3314]

type MarkerState = L.Marker & { __pin: string; __mapIcon?: string }

export interface MapController {
  map: L.Map
  setBuildings: (buildings: Building[], onSelect: (b: Building) => void) => void
  focusBuilding: (b: Building) => void
  highlight: (id: string | null) => void
}

function buildingIcon(pin: string, mapIcon: string | undefined, focused = false): L.DivIcon {
  if (mapIcon) {
    return L.divIcon({
      className: `kropki-marker kropki-marker--custom${focused ? ' is-focused' : ''}`,
      iconSize: [52, 56],
      iconAnchor: [26, 54],
      popupAnchor: [0, -48],
      html: `<img src="${asset(mapIcon)}" width="52" height="56" alt="" draggable="false" />`,
    })
  }
  const file = focused ? `${pin}_focus.svg` : `${pin}.svg`
  return L.divIcon({
    className: `kropki-marker${focused ? ' is-focused' : ''}`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<img src="${asset(`pins/${file}`)}" width="28" height="28" alt="" draggable="false" />`,
  })
}

export function createMap(container: HTMLElement): MapController {
  const map = L.map(container, {
    center: MAHILIOU,
    zoom: 13,
    minZoom: 11,
    maxZoom: 18,
    zoomControl: false,
  })

  L.control.zoom({ position: 'bottomright' }).addTo(map)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map)

  const buildingsLayer = L.layerGroup().addTo(map)
  const markers = new Map<string, MarkerState>()

  function highlight(id: string | null) {
    markers.forEach((marker, mid) => {
      marker.setIcon(buildingIcon(marker.__pin, marker.__mapIcon, mid === id))
      if (mid === id) marker.setZIndexOffset(1000)
      else marker.setZIndexOffset(marker.__mapIcon ? 200 : 0)
    })
  }

  function setBuildings(buildings: Building[], onSelect: (b: Building) => void) {
    buildingsLayer.clearLayers()
    markers.clear()
    for (const b of buildings) {
      const marker = L.marker([b.lat, b.lon], {
        icon: buildingIcon(b.pin, b.mapIcon),
        title: b.name,
        zIndexOffset: b.mapIcon ? 200 : 0,
      }) as MarkerState
      marker.__pin = b.pin
      marker.__mapIcon = b.mapIcon
      marker.on('click', () => {
        highlight(b.id)
        onSelect(b)
      })
      marker.addTo(buildingsLayer)
      markers.set(b.id, marker)
    }
  }

  function focusBuilding(b: Building) {
    map.setView([b.lat, b.lon], Math.max(map.getZoom(), 16), { animate: true })
    highlight(b.id)
  }

  return {
    map,
    setBuildings,
    focusBuilding,
    highlight,
  }
}
