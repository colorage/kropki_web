export type BuildingStatus =
  | 'preserved'
  | 'perspective'
  | 'lost'
  | 'warning'
  | 'restored'

export type BuildingType =
  | 'building'
  | 'catholic'
  | 'orthodox'
  | 'jewish'
  | 'other'

export interface Building {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  status: BuildingStatus
  statusLabel: string
  type: BuildingType
  typeLabel: string
  year: string
  style: string
  image: string
  images: string[]
  description: string
  pin: string
  source?: string
}

export interface PathPoint {
  name?: string
  lat: number
  lon: number
  order: number
  connected?: boolean
}

export interface Tour {
  id: string
  name: string
  points: PathPoint[]
}

export interface Zone {
  id: string
  name: string
  points: PathPoint[]
}

export const STATUS_LABELS: Record<BuildingStatus, string> = {
  preserved: 'Захаваўся',
  perspective: 'Перспектыўны',
  lost: 'Страчаны',
  warning: 'Выклікае трывогу',
  restored: 'Адноўлены',
}

export const TYPE_LABELS: Record<BuildingType, string> = {
  building: 'Будынак',
  catholic: 'Каталіцызм',
  orthodox: 'Праваслаўе',
  jewish: 'Іудаізм',
  other: 'Рознае',
}
