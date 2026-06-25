import {
  apiPaths,
  type ImageUploadResponse,
  type Serial,
  type TemplateUploadResponse,
  type UserState,
} from '@travelframe/contracts'

//fetch wrapper for the TravelFrame device API
//base url is empty by default
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface ApiClient {
  getState(serial: Serial): Promise<UserState>
  putState(serial: Serial, state: Omit<UserState, 'updatedAt'>): Promise<UserState>
  putImage(serial: Serial, bytes: Uint8Array): Promise<ImageUploadResponse>
  putTemplate(serial: Serial, svgMarkup: string): Promise<TemplateUploadResponse>
}

const errorCodeFrom = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? 'request_failed'
  } catch {
    return 'request_failed'
  }
}

const throwIfNotOk = async (response: Response, action: string): Promise<void> => {
  if (response.ok) return
  const code = await errorCodeFrom(response)
  throw new ApiError(response.status, code, `${action} failed: ${response.status} ${code}`)
}

export const createApiClient = (baseUrl = ''): ApiClient => {
  const root = baseUrl.replace(/\/$/, '')
  const endpoint = (path: string) => `${root}${path}`

  const getJson = async <T>(path: string, action: string): Promise<T> => {
    const response = await fetch(endpoint(path))
    await throwIfNotOk(response, action)
    return (await response.json()) as T
  }

  const putJson = async <T>(path: string, action: string, init: RequestInit): Promise<T> => {
    const response = await fetch(endpoint(path), { method: 'PUT', ...init })
    await throwIfNotOk(response, action)
    return (await response.json()) as T
  }

  return {
    
    getState: (serial) => getJson<UserState>(apiPaths.deviceState(serial), 'getState'),

    putState: (serial, state) =>
      putJson<UserState>(apiPaths.deviceState(serial), 'putState', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }),

    putImage: (serial, bytes) =>
      putJson<ImageUploadResponse>(apiPaths.deviceImage(serial), 'putImage', {
        headers: { 'Content-Type': 'image/bmp' },
        body: bytes as BodyInit,
      }),

    putTemplate: (serial, svgMarkup) =>
      putJson<TemplateUploadResponse>(apiPaths.deviceTemplate(serial), 'putTemplate', {
        headers: { 'Content-Type': 'image/svg+xml' },
        body: svgMarkup,
      }),
  }
}

export const apiClient = createApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
