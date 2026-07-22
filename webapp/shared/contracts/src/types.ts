import type { Serial } from './serial.js'

export interface DeviceRecord {
  serial: Serial
  label?: string
  createdAt: string
}

//persistent storage for the user state (visited countriess, visited states, etc)
export interface UserState {
  visited: string[]
  visitedStates: string[]
  stateMode: boolean
  twoUserMode: boolean
  activeUser: 1 | 2
  visitedUser1: string[]
  visitedStatesUser1: string[]
  visitedUser2: string[]
  visitedStatesUser2: string[]
  temperatureUnit: 'celsius' | 'fahrenheit'
  nextDestination: {
    name: string
    date: string
    countryCode?: string
  }
  updatedAt: string
}

export interface ImageMeta {
  etag: string
  updatedAt: string
  bytes: number
}

export const emptyUserState = (now: string): UserState => ({
  visited: [],
  visitedStates: [],
  stateMode: false,
  twoUserMode: false,
  activeUser: 1,
  visitedUser1: [],
  visitedStatesUser1: [],
  visitedUser2: [],
  visitedStatesUser2: [],
  temperatureUnit: 'celsius',
  nextDestination: { name: '', date: '', countryCode: '' },
  updatedAt: now,
})

export interface DeviceLookupResponse {
  serial: Serial
  label?: string
  createdAt: string
}

export interface ImageUploadResponse {
  etag: string
  updatedAt: string
  bytes: number
}

export interface TemplateUploadResponse {
  updatedAt: string
  bytes: number
}
