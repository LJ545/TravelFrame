//weather and geocoding via Open-Meteo (change this to your liking)
//used by the normal webapp and the auto refresh cron job

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const REQUEST_TIMEOUT_MS = 8000

export interface WeatherResult {
  city: string
  tempC: number
  icon: string
}

export const fetchWeatherForCity = async (city: string): Promise<WeatherResult | null> => {
  const trimmed = city.trim()
  if (!trimmed) return null

  const geoUrl = new URL(GEOCODING_URL)
  geoUrl.searchParams.set('name', trimmed)
  geoUrl.searchParams.set('count', '1')
  geoUrl.searchParams.set('language', 'en')
  geoUrl.searchParams.set('format', 'json')

  const geoPayload = await fetchJsonUnknown(geoUrl.toString())
  const coords = readGeocodingResult(geoPayload)
  if (!coords) return null

  const forecastUrl = new URL(FORECAST_URL)
  forecastUrl.searchParams.set('latitude', String(coords.lat))
  forecastUrl.searchParams.set('longitude', String(coords.lon))
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code,is_day')
  forecastUrl.searchParams.set('timezone', 'auto')

  const weatherPayload = await fetchJsonUnknown(forecastUrl.toString())
  const parsed = readOpenMeteoCurrent(weatherPayload)
  if (!parsed) return null
  return { city: trimmed, tempC: parsed.tempC, icon: parsed.icon }
}

const fetchJsonUnknown = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`upstream_${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

const readGeocodingResult = (payload: unknown): { lat: number; lon: number } | null => {
  if (!payload || typeof payload !== 'object') return null
  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results) || results.length === 0) return null
  const first = results[0]
  if (!first || typeof first !== 'object') return null
  const lat = readNumber((first as { latitude?: unknown }).latitude)
  const lon = readNumber((first as { longitude?: unknown }).longitude)
  if (lat == null || lon == null) return null
  return { lat, lon }
}

const readOpenMeteoCurrent = (payload: unknown): { tempC: number; icon: string } | null => {
  if (!payload || typeof payload !== 'object') return null
  const current = (payload as { current?: unknown }).current
  if (!current || typeof current !== 'object') return null
  const obj = current as Record<string, unknown>

  const temp = readNumber(obj.temperature_2m)
  const weatherCode = readNumber(obj.weather_code)
  if (temp == null || weatherCode == null) return null

  const isDay = readNumber(obj.is_day) ?? 1
  return { tempC: temp, icon: iconFromWeatherCode(weatherCode, isDay) }
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

//WMO weather code to icon mapping
const iconFromWeatherCode = (weatherCode: number, isDay: number): string => {
  if (weatherCode >= 95) return '⚡'
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return '☂'
  if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) return '❄'
  if (weatherCode === 0) return isDay === 1 ? '☀' : '☾'
  return isDay === 1 ? '☁' : '☾'
}
