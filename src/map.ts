import L from 'leaflet'
import type { Building, Tour, Zone } from './types'
import { asset } from './asset'

const MAHILIOU: L.LatLngExpression = [53.9006, 30.3314]

type MarkerWithPin = L.Marker & { __pin: string }

export interface MapController {
  map: L.Map
  setBuildings: (buildings: Building[], onSelect: (b: Building) => void) => void
  focusBuilding: (b: Building) => void
  setToursVisible: (visible: boolean, tours: Tour[]) => void
  setZonesVisible: (visible: boolean, zones: Zone[]) => void
  highlight: (id: string | null) => void
}

function pinIcon(pin: string, focused = false): L.DivIcon {
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
  const toursLayer = L.layerGroup()
  const zonesLayer = L.layerGroup()
  const markers = new Map<string, MarkerWithPin>()

  function highlight(id: string | null) {
    markers.forEach((marker, mid) => {
      marker.setIcon(pinIcon(marker.__pin, mid === id))
    })
  }

  function setBuildings(buildings: Building[], onSelect: (b: Building) => void) {
    buildingsLayer.clearLayers()
    markers.clear()
    for (const b of buildings) {
      const marker = L.marker([b.lat, b.lon], {
        icon: pinIcon(b.pin),
        title: b.name,
      }) as MarkerWithPin
      marker.__pin = b.pin
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

  function setToursVisible(visible: boolean, tours: Tour[]) {
    toursLayer.clearLayers()
    map.removeLayer(toursLayer)
    if (!visible) return
    for (const tour of tours) {
      const latlngs = tour.points.map((p) => [p.lat, p.lon] as L.LatLngExpression)
      if (latlngs.length < 2) continue
      L.polyline(latlngs, {
        color: '#2F6F8F',
        weight: 3,
        opacity: 0.75,
      })
        .bindTooltip(tour.name)
        .addTo(toursLayer)
    }
    toursLayer.addTo(map)
  }

  function setZonesVisible(visible: boolean, zones: Zone[]) {
    zonesLayer.clearLayers()
    map.removeLayer(zonesLayer)
    if (!visible) return
    for (const zone of zones) {
      const latlngs = zone.points.map((p) => [p.lat, p.lon] as L.LatLngExpression)
      if (latlngs.length < 3) continue
      L.polygon(latlngs, {
        color: '#C45C26',
        weight: 1,
        fillColor: '#C45C26',
        fillOpacity: 0.12,
      })
        .bindTooltip(zone.name)
        .addTo(zonesLayer)
    }
    zonesLayer.addTo(map)
  }

  return {
    map,
    setBuildings,
    focusBuilding,
    setToursVisible,
    setZonesVisible,
    highlight,
  }
}
