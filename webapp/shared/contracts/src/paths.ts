import type { Serial } from './serial.js'

//canonical url path builders

export const apiPaths = {
  device: (serial: Serial) => `/api/devices/${serial}` as const,
  deviceState: (serial: Serial) => `/api/devices/${serial}/state` as const,
  deviceImage: (serial: Serial) => `/api/devices/${serial}/image` as const,
  //svg template uploaded alongside the bmp for auto refresh
  deviceTemplate: (serial: Serial) => `/api/devices/${serial}/template` as const,
} as const

export const devicePaths = {
  //image version check endpoint
  version: (serial: Serial) => `/device/${serial}/version` as const,
  image: (serial: Serial) => `/device/${serial}/image.bmp` as const,
} as const
