import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Serial } from '@travelframe/contracts'
import { HUD_EMPH_FONT, HUD_LABEL_FONT, buildWeatherIconSvg } from '@travelframe/contracts'
import { ANTARCTICA_NUDGE_Y, MAP_TOP_MARGIN } from '../core/adapters/data'
import { ApiError, apiClient } from '../core/adapters/deviceApi'
import { countryMapService } from '../core/app'
import { resolveVisitShade, type VisitShade } from '../core/domain/visitShading'
import { useCountryMapViewModel } from './useCountryMapViewModel'
import { useDeviceUserState } from './useDeviceUserState'
import { SettingsPage } from './SettingsPage'
import logoUrl from '../assets/logo.png'

interface Props {
  serial: Serial
}

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'rendering' }
  | { kind: 'sending' }
  | { kind: 'sent'; at: number }
  | { kind: 'error'; message: string }

type WeatherState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; tempC: number; icon: string }
  | { kind: 'error' }

type CountryRow =
  | { code: string; name: string; isState: false }
  | { code: string; name: string; isState: true; parentCountry: string }

const MAP_WIDTH = 800
const MAP_HEIGHT = 480
const MAP_LAYER_PAN_L = 20
const MAP_LAYER_ZOOM = 1.08
const MAP_CENTER_X = MAP_WIDTH / 2
const MAP_CENTER_Y = MAP_TOP_MARGIN + (MAP_HEIGHT - MAP_TOP_MARGIN) * 0.52
const MAP_LAYER_TRANSFORM = `translate(${-MAP_LAYER_PAN_L},0) translate(${MAP_CENTER_X} ${MAP_CENTER_Y}) scale(${MAP_LAYER_ZOOM}) translate(${-MAP_CENTER_X} ${-MAP_CENTER_Y})`
const VISITED_HUD = {
  x: 14,
  yCount: 424,
  yLabel1: 452,
  yLabel2: 470,
} as const

const ETD_HUD_RIGHT_X = 786
const ETD_GAP_NUMBER_TO_DAYS = 10
const ETD_GAP_ETD_TO_NUMBER = 10

const measureSvgTextWidth = (el: SVGTextElement, fallbackPx: number): number => {
  if (typeof el.getComputedTextLength !== 'function') return fallbackPx
  const w = el.getComputedTextLength()
  return w > 0.5 ? w : fallbackPx
}

const EMPH_TEXT = { ...HUD_EMPH_FONT, fill: '#000000' } as const

const LABEL_TEXT = { ...HUD_LABEL_FONT, fill: '#000000' } as const

const DEST_MAX_WIDTH = 526
const DEST_BASE_FONT = 32
const DEST_CHAR_WIDTH_RATIO = 0.72
const DEST_MIN_FONT = 14

const computeDestinationFontSize = (text: string) => {
  const estimated = text.length * DEST_BASE_FONT * DEST_CHAR_WIDTH_RATIO
  if (estimated <= DEST_MAX_WIDTH) return DEST_BASE_FONT
  const scaled = Math.floor((DEST_MAX_WIDTH / estimated) * DEST_BASE_FONT)
  return Math.max(DEST_MIN_FONT, scaled)
}

const renderSendLabel = (status: SendStatus): string => {
  switch (status.kind) {
    case 'rendering':
      return 'Rendering…'
    case 'sending':
      return 'Sending…'
    case 'sent':
      return 'Sent ✓'
    case 'error':
      return 'Retry send'
    case 'idle':
    default:
      return 'Send to TravelFrame'
  }
}

const renderSyncLabel = (
  status: import('./useDeviceUserState').SyncStatus,
  loaded: boolean,
): string => {
  if (!loaded) return 'Loading state…'
  switch (status.kind) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved'
    case 'error':
      return `Sync error: ${status.message}`
    case 'idle':
    default:
      return 'Up to date'
  }
}

const computeDaysUntil = (isoDate: string): number | null => {
  if (!isoDate) return null
  const target = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = target.getTime() - startOfToday.getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

const DEST_COUNTRY_SUGGEST_LIMIT = 8

const DEST_PIN_PATH =
  'M 0 0 C -6.5 -7.5 -9 -11.5 -9 -17 A 9 9 0 1 1 9 -17 C 9 -11.5 6.5 -7.5 0 0 Z'
const DEST_PIN_STAR_POINTS =
  '0,-22.4 1.26,-18.74 5.14,-18.67 2.04,-16.34 3.17,-12.63 0,-14.85 -3.17,-12.63 -2.04,-16.34 -5.14,-18.67 -1.26,-18.74'

const rankDestinationCountry = (name: string, code: string, q: string): number => {
  if (!q) return 1_000
  if (code === q) return 0
  if (name === q) return 1
  if (name.startsWith(q)) return 2
  if (code.startsWith(q)) return 3
  if (name.includes(q)) return 4
  if (code.includes(q)) return 5
  return 99
}

export const CountryMapPage = ({ serial }: Props) => {
  const [pageView, setPageView] = useState<'map' | 'settings'>('map')
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const destinationCountryInputRef = useRef<HTMLInputElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const etdHudEtdRef = useRef<SVGTextElement | null>(null)
  const etdHudNumberRef = useRef<SVGTextElement | null>(null)
  const etdHudDaysRef = useRef<SVGTextElement | null>(null)
  const [etdLineXs, setEtdLineXs] = useState({ xEtd: 630, xNum: 700 })
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: 'idle' })
  const [weather, setWeather] = useState<WeatherState>({ kind: 'idle' })

  const {
    loaded,
    syncStatus,
    visitedStateIds,
    stateMode,
    twoUserMode,
    activeUser,
    visitedUser1,
    visitedStatesUser1,
    visitedUser2,
    visitedStatesUser2,
    temperatureUnit,
    nextDestination,
    setVisitedStateIds,
    setStateMode,
    setTwoUserMode,
    setActiveUser,
    setTemperatureUnit,
    setNextDestination,
  } = useDeviceUserState(serial)

  const {
    countries,
    allCountries,
    totalCountries,
    mapShapes,
    stateShapes,
    landPath,
    antarcticLandPath,
    countryBorders,
    borderPath,
    visited,
    toggleVisited,
  } = useCountryMapViewModel(query)

  const nameByCode = useMemo(
    () => new Map(allCountries.map((c) => [c.code, c.name] as const)),
    [allCountries],
  )
  const countryByCode = useMemo(() => new Map(allCountries.map((c) => [c.code, c] as const)), [allCountries])
  const [destinationCountryQuery, setDestinationCountryQuery] = useState('')

  const statesByCountry = useMemo(() => {
    const grouped = new Map<string, typeof stateShapes>()
    stateShapes.forEach((shape) => {
      const current = grouped.get(shape.countryCode) ?? []
      current.push(shape)
      grouped.set(shape.countryCode, current)
    })
    grouped.forEach((entries) => entries.sort((a, b) => a.name.localeCompare(b.name)))
    return grouped
  }, [stateShapes])

  const topCountryCodes = useMemo(() => new Set(statesByCountry.keys()), [statesByCountry])
  const queryText = query.trim().toLowerCase()
  const destinationCountryCode = (nextDestination.countryCode ?? '').trim().toUpperCase()
  const destinationCountryQueryText = destinationCountryQuery.trim().toLowerCase()
  const destinationCountrySuggestions = useMemo(() => {
    if (!destinationCountryQueryText) return []
    const selectedCode = (nextDestination.countryCode ?? '').trim().toUpperCase()
    const selected = selectedCode ? countryByCode.get(selectedCode) : undefined
    if (
      selected &&
      (selected.name.toLowerCase() === destinationCountryQueryText ||
        selected.code.toLowerCase() === destinationCountryQueryText)
    ) {
      return []
    }
    return allCountries
      .map((country) => {
        const name = country.name.toLowerCase()
        const code = country.code.toLowerCase()
        return { country, rank: rankDestinationCountry(name, code, destinationCountryQueryText) }
      })
      .filter((item) => item.rank < 99)
      .sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name))
      .slice(0, DEST_COUNTRY_SUGGEST_LIMIT)
      .map((item) => item.country)
  }, [allCountries, countryByCode, destinationCountryQueryText, nextDestination.countryCode])

  const countryRows: CountryRow[] = useMemo(() => {
    if (!stateMode) {
      return countries.map((country) => ({ code: country.code, name: country.name, isState: false as const }))
    }

    return allCountries.flatMap((country) => {
      const states = statesByCountry.get(country.code) ?? []
      const countryMatch =
        queryText.length === 0 ||
        country.name.toLowerCase().includes(queryText) ||
        country.code.toLowerCase().includes(queryText)
      const matchedStates =
        queryText.length === 0
          ? states
          : states.filter(
              (state) =>
                state.name.toLowerCase().includes(queryText) || state.code.toLowerCase().includes(queryText),
            )

      if (!countryMatch && matchedStates.length === 0) return []

      return [
        { code: country.code, name: country.name, isState: false as const }, 
        ...matchedStates.map((state) => ({
          code: state.id,
          name: `  - ${state.name}`,
          parentCountry: country.code,
          isState: true as const,
        })),
      ]
    })
  }, [allCountries, countries, queryText, stateMode, statesByCountry])

  const visibleCodes = new Set(countryRows.filter((row) => !row.isState).map((row) => row.code))
  const visibleStateIds = useMemo(
    () => new Set(countryRows.filter((row) => row.isState).map((row) => row.code)),
    [countryRows],
  )
  const mapShapesForRender = useMemo(
    () => (stateMode ? mapShapes.filter((shape) => !topCountryCodes.has(shape.code)) : mapShapes),
    [mapShapes, stateMode, topCountryCodes],
  )
  const { pathMapShapes, dotMapShapes } = useMemo(() => {
    const pathMapShapes: typeof mapShapesForRender = []
    const dotMapShapes: typeof mapShapesForRender = []
    for (const s of mapShapesForRender) {
      if (s.dot) dotMapShapes.push(s)
      else pathMapShapes.push(s)
    }
    return { pathMapShapes, dotMapShapes }
  }, [mapShapesForRender])
  const countryShapeByCode = useMemo(
    () => new Map(mapShapes.map((shape) => [shape.code, shape.path])),
    [mapShapes],
  )
  const combinedVisited = useMemo(
    () => (twoUserMode ? new Set([...visitedUser1, ...visitedUser2]) : new Set(visited)),
    [twoUserMode, visited, visitedUser1, visitedUser2],
  )
  const combinedVisitedStateIds = useMemo(
    () =>
      twoUserMode
        ? new Set([...visitedStatesUser1, ...visitedStatesUser2])
        : new Set(visitedStateIds),
    [twoUserMode, visitedStateIds, visitedStatesUser1, visitedStatesUser2],
  )
  const getCountryShade = (countryCode: string): VisitShade =>
    twoUserMode
      ? resolveVisitShade(countryCode, visitedUser1, visitedUser2)
      : visited.has(countryCode)
        ? 'both'
        : 'none'
  const getStateShade = (stateId: string): VisitShade =>
    twoUserMode
      ? resolveVisitShade(stateId, visitedStatesUser1, visitedStatesUser2)
      : visitedStateIds.has(stateId)
        ? 'both'
        : 'none'
  const shadeClass = (shade: VisitShade) => {
    if (shade === 'none') return ''
    return twoUserMode ? `visited-${shade}` : 'visited'
  }
  const isCountryFilledForBorder = (countryCode: string) => {
    if (!stateMode || !topCountryCodes.has(countryCode)) return combinedVisited.has(countryCode)
    const states = statesByCountry.get(countryCode) ?? []
    return states.length > 0 && states.every((state) => combinedVisitedStateIds.has(state.id))
  }

  const visitedInternationalStateBorders = useMemo(() => {
    if (!stateMode) return []
    const out: Array<{ key: string; path: string; nudgeY?: number }> = []
    for (const st of stateShapes) {
      const borders = st.internationalBorders
      if (!borders?.length) continue
      if (!combinedVisitedStateIds.has(st.id)) continue
      if (!visibleStateIds.has(st.id)) continue
      borders.forEach((b, i) => {
        const neighborSubdivided = topCountryCodes.has(b.neighborCountryCode)
        const neighborOk = neighborSubdivided
          ? Boolean(b.neighborSubId && combinedVisitedStateIds.has(b.neighborSubId))
          : combinedVisited.has(b.neighborCountryCode)
        if (!neighborOk) return
        out.push({
          key: `${st.id}-${b.neighborCountryCode}-${i}`,
          path: b.path,
          ...(b.neighborCountryCode === 'ATA' || st.countryCode === 'ATA' ? { nudgeY: ANTARCTICA_NUDGE_Y } : {}),
        })
      })
    }
    return out
  }, [
    stateMode,
    stateShapes,
    topCountryCodes,
    combinedVisited,
    combinedVisitedStateIds,
    visibleStateIds,
  ])
  const visitedCountryBorders = useMemo(
    () =>
      countryBorders.filter((border) => {
        if (stateMode && (topCountryCodes.has(border.codeA) || topCountryCodes.has(border.codeB))) {
          return false
        }
        return isCountryFilledForBorder(border.codeA) && isCountryFilledForBorder(border.codeB)
      }),
    [
      countryBorders,
      stateMode,
      statesByCountry,
      topCountryCodes,
      combinedVisited,
      combinedVisitedStateIds,
    ],
  )
  const clipIdByCountry = useMemo(() => {
    const ids = new Map<string, string>()
    topCountryCodes.forEach((countryCode) => ids.set(countryCode, `state-clip-${countryCode.toLowerCase()}`))
    return ids
  }, [topCountryCodes])

  const destinationPin = useMemo(() => {
    if (!destinationCountryCode) return null
    const shape = mapShapes.find((entry) => entry.code === destinationCountryCode)
    if (!shape) return null
    const nudgeY = shape.nudgeY ?? 0
    if (shape.dot) return { x: shape.dot.cx, y: shape.dot.cy + nudgeY }
    if (shape.centroid) return { x: shape.centroid[0], y: shape.centroid[1] + nudgeY }
    return null
  }, [mapShapes, destinationCountryCode])

  const toggleCountryInStateMode = (countryCode: string) => {
    const states = statesByCountry.get(countryCode)
    if (!states?.length) {
      toggleVisited(countryCode)
      return
    }
    setVisitedStateIds((current) => {
      const next = new Set(current)
      const allVisited = states.every((state) => next.has(state.id))
      if (allVisited) {
        states.forEach((state) => next.delete(state.id))
      } else {
        states.forEach((state) => next.add(state.id))
      }
      return next
    })
  }

  const isCountryVisited = (countryCode: string) => {
    if (!stateMode) return combinedVisited.has(countryCode)
    if (!topCountryCodes.has(countryCode)) return combinedVisited.has(countryCode)
    return false
  }

  const visitedCountryTotal = useMemo(() => {
    if (!stateMode) return combinedVisited.size
    let n = 0
    for (const { code } of allCountries) {
      const states = statesByCountry.get(code)
      if (states && states.length > 0) {
        if (states.some((s) => combinedVisitedStateIds.has(s.id))) n += 1
      } else if (combinedVisited.has(code)) {
        n += 1
      }
    }
    return n
  }, [stateMode, allCountries, combinedVisited, combinedVisitedStateIds, statesByCountry])
  const daysUntil = computeDaysUntil(nextDestination.date)
  const etdDayCountText = daysUntil !== null ? String(daysUntil) : '---'
  const destinationText = (nextDestination.name || '—').toUpperCase()
  const destinationCountry = destinationCountryCode ? countryByCode.get(destinationCountryCode) : undefined

  useEffect(() => {
    if (destinationCountry) {
      setDestinationCountryQuery(destinationCountry.name)
      return
    }
    if (!destinationCountryCode) setDestinationCountryQuery('')
  }, [destinationCountry, destinationCountryCode])

  const applyDestinationCountry = (countryCode: string) => {
    const normalized = countryCode.toUpperCase()
    const selected = countryByCode.get(normalized)
    if (!selected) return
    setDestinationCountryQuery(selected.name)
    setNextDestination((current) => ({ ...current, countryCode: normalized }))
  }

  useLayoutEffect(() => {
    const daysEl = etdHudDaysRef.current
    const numEl = etdHudNumberRef.current
    const etdEl = etdHudEtdRef.current
    if (!daysEl || !numEl || !etdEl) return

    const apply = () => {
      const wDays = measureSvgTextWidth(daysEl, 44)
      const wNum = measureSvgTextWidth(numEl, Math.max(1, etdDayCountText.length) * 19)
      const xNumEnd = ETD_HUD_RIGHT_X - wDays - ETD_GAP_NUMBER_TO_DAYS
      const xEtdEnd = xNumEnd - wNum - ETD_GAP_ETD_TO_NUMBER
      setEtdLineXs({ xEtd: xEtdEnd, xNum: xNumEnd })
    }

    apply()
    const fontsReady = typeof document !== 'undefined' ? document.fonts?.ready : undefined
    if (fontsReady) void fontsReady.then(apply)
  }, [etdDayCountText])
  const destinationFontSize = computeDestinationFontSize(destinationText)
  const worldSeenPercent = totalCountries > 0 ? Math.round((visitedCountryTotal / totalCountries) * 100) : 0

  useEffect(() => {
    if (sendStatus.kind !== 'sent') return
    const timer = window.setTimeout(() => {
      setSendStatus({ kind: 'idle' })
    }, 30000)
    return () => window.clearTimeout(timer)
  }, [sendStatus.kind])

  useEffect(() => {
    const city = nextDestination.name.trim()
    if (!city) {
      setWeather({ kind: 'idle' })
      return
    }

    const controller = new AbortController()
    setWeather({ kind: 'loading' })

    void (async () => {
      try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`weather_${res.status}`)
        const data = (await res.json()) as { tempC?: unknown; icon?: unknown }
        const tempC = typeof data.tempC === 'number' ? data.tempC : Number(data.tempC)
        const icon = typeof data.icon === 'string' ? data.icon : ''
        if (!Number.isFinite(tempC) || icon.trim().length === 0) throw new Error('weather_parse')
        if (!controller.signal.aborted) setWeather({ kind: 'ready', tempC, icon })
      } catch {
        if (!controller.signal.aborted) setWeather({ kind: 'error' })
      }
    })()

    return () => controller.abort()
  }, [nextDestination.name])

  const temperatureSuffix = temperatureUnit === 'fahrenheit' ? '°F' : '°C'
  const weatherTempLabel =
    weather.kind === 'ready'
      ? `${Math.round(
          temperatureUnit === 'fahrenheit' ? weather.tempC * (9 / 5) + 32 : weather.tempC,
        )}${temperatureSuffix}`
      : weather.kind === 'loading'
        ? `…${temperatureSuffix}`
        : `--${temperatureSuffix}`
  const weatherIconLabel = weather.kind === 'ready' ? weather.icon : '○'

  const handleStateModeChange = (nextMode: boolean) => {
    const stateIdsByCountry = new Map(
      [...statesByCountry].map(([code, states]) => [code, states.map((state) => state.id)]),
    )
    setStateMode(nextMode, stateIdsByCountry)
  }

  if (pageView === 'settings') {
    return (
      <SettingsPage
        stateMode={stateMode}
        twoUserMode={twoUserMode}
        temperatureUnit={temperatureUnit}
        onStateModeChange={handleStateModeChange}
        onTwoUserModeChange={setTwoUserMode}
        onTemperatureUnitChange={setTemperatureUnit}
        onBack={() => setPageView('map')}
      />
    )
  }

  return (
    <main className="app-shell">
      <section className="panel list-panel">
        <div className="sidebar-header">
          <img src={logoUrl} alt="TravelFrame" className="app-logo" />
        </div>
        <label htmlFor="search" className="label">
          Search destinations
        </label>
        <div className="search-field">
          <input
            ref={searchInputRef}
            id="search"
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a destination name…"
          />
          {query.length > 0 ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                searchInputRef.current?.focus()
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        <p className="meta">
          {visitedCountryTotal} visited / {countryRows.length} shown / {totalCountries} total (ISO 3166-1)
        </p>
        <ul className="country-list" aria-label="Destination list">
          {countryRows.map((country) => {
            const selected = Boolean(
              country.isState
                ? visitedStateIds.has(country.code)
                : stateMode
                  ? (statesByCountry.get(country.code)?.every((state) => visitedStateIds.has(state.id)) ??
                    visited.has(country.code))
                  : visited.has(country.code),
            )
            return (
              <li key={country.code}>
                <button
                  type="button"
                  className={`country-item ${selected ? 'selected' : ''} ${
                    country.isState ? 'state-item' : ''
                  }`}
                  onClick={() => {
                    if (country.isState) {
                      setVisitedStateIds((current) => {
                        const next = new Set(current)
                        if (next.has(country.code)) next.delete(country.code)
                        else next.add(country.code)
                        return next
                      })
                      return
                    }
                    if (stateMode) {
                      toggleCountryInStateMode(country.code)
                    } else {
                      toggleVisited(country.code)
                    }
                  }}
                >
                  <span>{country.name}</span>
                  <span className="code">{country.isState ? country.parentCountry : country.code}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel map-panel">
        <div className="map-toolbar">
          <div className="map-toolbar-title">
            <h2>World Map</h2>
            {twoUserMode ? (
              <div className="segmented-control user-switcher" role="group" aria-label="Active user">
                <button
                  type="button"
                  className={activeUser === 1 ? 'active' : ''}
                  aria-pressed={activeUser === 1}
                  onClick={() => setActiveUser(1)}
                >
                  User 1
                </button>
                <button
                  type="button"
                  className={activeUser === 2 ? 'active' : ''}
                  aria-pressed={activeUser === 2}
                  onClick={() => setActiveUser(2)}
                >
                  User 2
                </button>
              </div>
            ) : null}
          </div>
          <div className="map-toolbar-actions">
            <span className={`sync-pill sync-${syncStatus.kind}`} aria-live="polite">
              {renderSyncLabel(syncStatus, loaded)}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Settings"
              onClick={() => setPageView('settings')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3.5h-4L10.7 6A8 8 0 0 0 9 7L6.6 6l-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4L9 17a8 8 0 0 0 1.7 1l.3 2.5h4l.3-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!loaded || sendStatus.kind === 'rendering' || sendStatus.kind === 'sending'}
              onClick={async () => {
                if (!svgRef.current) return
                setSendStatus({ kind: 'rendering' })
                try {
                  const hudInputs = {
                    destinationName: destinationText,
                    etdDays: etdDayCountText,
                    weatherTemp: weatherTempLabel,
                    weatherIcon: weatherIconLabel,
                    visitedCount: visitedCountryTotal,
                    totalCountries,
                  }
                  const hudSnapshot = {
                    destinationName: destinationText,
                    visitedCount: visitedCountryTotal,
                    totalCountries,
                  }
                  const bytes = await countryMapService.renderBmp(svgRef.current, hudInputs)
                  const templateMarkup = countryMapService.buildTemplate(svgRef.current, hudSnapshot)
                  setSendStatus({ kind: 'sending' })
                  await apiClient.putImage(serial, bytes)
                  await apiClient.putTemplate(serial, templateMarkup)
                  setSendStatus({ kind: 'sent', at: Date.now() })
                } catch (err) {
                  const message =
                    err instanceof ApiError
                      ? `${err.status}: ${err.code}`
                      : err instanceof Error
                        ? err.message
                        : 'send failed'
                  setSendStatus({ kind: 'error', message })
                }
              }}
            >
              {renderSendLabel(sendStatus)}
            </button>
          </div>
        </div>
        {sendStatus.kind === 'error' && (
          <p className="send-error" role="alert">
            Send failed — {sendStatus.message}
          </p>
        )}
        {sendStatus.kind === 'sent' && (
          <p className="send-success" aria-live="polite">
            Sent — your TravelFrame will pick it up on the next refresh (within ~30 s).
          </p>
        )}
        <div className="map-stage">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            role="img"
            aria-label="World map"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              x={0}
              y={0}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              fill="#ffffff"
              stroke="none"
              pointerEvents="none"
            />
            <defs>
              <clipPath id="map-view-clip">
                <rect
                  x={0}
                  y={MAP_TOP_MARGIN}
                  width={MAP_WIDTH}
                  height={MAP_HEIGHT - MAP_TOP_MARGIN}
                />
              </clipPath>
            </defs>
            <g clipPath="url(#map-view-clip)">
              {stateMode && (
                <defs>
                  {[...clipIdByCountry.entries()].map(([countryCode, clipId]) => {
                    const countryPath = countryShapeByCode.get(countryCode)
                    if (!countryPath) return null
                    return (
                      <clipPath id={clipId} key={clipId}>
                        <path d={countryPath} />
                      </clipPath>
                    )
                  })}
                </defs>
              )}
              <g transform={MAP_LAYER_TRANSFORM} data-map-layer>
                <path
                  d={landPath}
                  className="land-shape"
                  fill="none"
                  stroke="#000000"
                  strokeWidth="0.7"
                />
                {antarcticLandPath ? (
                  <g transform={`translate(0, ${ANTARCTICA_NUDGE_Y})`}>
                    <path
                      d={antarcticLandPath}
                      className="land-shape"
                      fill="none"
                      stroke="#000000"
                      strokeWidth="0.7"
                    />
                  </g>
                ) : null}
                {pathMapShapes.map((shape) =>
                  shape.nudgeY != null ? (
                    <g key={shape.code} transform={`translate(0, ${shape.nudgeY})`}>
                      <path
                        d={shape.path}
                        data-country-code={shape.code}
                        data-visited={isCountryVisited(shape.code)}
                        data-visit-shade={getCountryShade(shape.code)}
                        className={`country-shape ${shadeClass(getCountryShade(shape.code))} ${
                          visibleCodes.has(shape.code) ? '' : 'dimmed'
                        }`}
                        onClick={() => {
                          if (stateMode) {
                            toggleCountryInStateMode(shape.code)
                          } else {
                            toggleVisited(shape.code)
                          }
                        }}
                      />
                    </g>
                  ) : (
                    <path
                      key={shape.code}
                      d={shape.path}
                      data-country-code={shape.code}
                      data-visited={isCountryVisited(shape.code)}
                      data-visit-shade={getCountryShade(shape.code)}
                      className={`country-shape ${shadeClass(getCountryShade(shape.code))} ${
                        visibleCodes.has(shape.code) ? '' : 'dimmed'
                      }`}
                      onClick={() => {
                        if (stateMode) {
                          toggleCountryInStateMode(shape.code)
                        } else {
                          toggleVisited(shape.code)
                        }
                      }}
                    />
                  ),
                )}
                {stateMode &&
                  stateShapes.map((state) => (
                    <path
                      key={state.id}
                      d={state.path}
                      data-state-id={state.id}
                      data-visited={combinedVisitedStateIds.has(state.id)}
                      data-visit-shade={getStateShade(state.id)}
                      className={`state-shape ${shadeClass(getStateShade(state.id))} ${
                        visibleStateIds.has(state.id) ? '' : 'dimmed'
                      }`}
                      fillRule="evenodd"
                      clipRule="evenodd"
                      clipPath={
                        clipIdByCountry.get(state.countryCode)
                          ? `url(#${clipIdByCountry.get(state.countryCode)})`
                          : undefined
                      }
                      onClick={() =>
                        setVisitedStateIds((current) => {
                          const next = new Set(current)
                          if (next.has(state.id)) next.delete(state.id)
                          else next.add(state.id)
                          return next
                        })
                      }
                    />
                  ))}
                <path
                  d={borderPath}
                  className="border-mesh"
                  fill="none"
                  stroke="#000000"
                  strokeWidth="0.7"
                  pointerEvents="none"
                />
                {dotMapShapes.map((shape) => {
                  const d = shape.dot
                  if (!d) return null
                  const { cx, cy, r } = d
                  const nudgeY = shape.nudgeY ?? 0
                  const pcy = cy + nudgeY
                  const onCountryClick = () => {
                    if (stateMode) {
                      toggleCountryInStateMode(shape.code)
                    } else {
                      toggleVisited(shape.code)
                    }
                  }
                  return (
                    <g
                      key={shape.code}
                      className={`country-dot-group ${visibleCodes.has(shape.code) ? '' : 'search-dimmed'}`}
                      onClick={onCountryClick}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{nameByCode.get(shape.code) ?? shape.code}</title>
                      <circle className="country-dot-hit" cx={cx} cy={pcy} r={5.3} fill="transparent" />
                      <circle
                        data-country-code={shape.code}
                        data-visited={isCountryVisited(shape.code)}
                        data-visit-shade={getCountryShade(shape.code)}
                        className={`country-dot ${shadeClass(getCountryShade(shape.code))}`}
                        cx={cx}
                        cy={pcy}
                        r={r}
                        pointerEvents="none"
                      />
                    </g>
                  )
                })}
                {visitedInternationalStateBorders.map((seg) =>
                  seg.nudgeY != null ? (
                    <g key={seg.key} transform={`translate(0, ${seg.nudgeY})`}>
                      <path
                        d={seg.path}
                        data-state-intl-border="true"
                        className="visited-border-mesh"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="0.9"
                        pointerEvents="none"
                      />
                    </g>
                  ) : (
                    <path
                      key={seg.key}
                      d={seg.path}
                      data-state-intl-border="true"
                      className="visited-border-mesh"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      pointerEvents="none"
                    />
                  ),
                )}
                {visitedCountryBorders.map((border) =>
                  border.nudgeY != null ? (
                    <g
                      key={`${border.codeA}-${border.codeB}`}
                      transform={`translate(0, ${border.nudgeY})`}
                    >
                      <path
                        d={border.path}
                        className="visited-border-mesh"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="0.9"
                        pointerEvents="none"
                      />
                    </g>
                  ) : (
                    <path
                      key={`${border.codeA}-${border.codeB}`}
                      d={border.path}
                      className="visited-border-mesh"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      pointerEvents="none"
                    />
                  ),
                )}
                {destinationPin ? (
                  <g
                    transform={`translate(${destinationPin.x}, ${destinationPin.y})`}
                    pointerEvents="none"
                  >
                    <path
                      d={DEST_PIN_PATH}
                      fill="#ffffff"
                      stroke="#000000"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <polygon points={DEST_PIN_STAR_POINTS} fill="#000000" stroke="none" />
                  </g>
                ) : null}
              </g>
            </g>

            <g className="map-hud-overlay" pointerEvents="none">
              <text x={14} y={18} fontSize={15} {...LABEL_TEXT}>
                next destination
              </text>
              <text x={14} y={46} fontSize={destinationFontSize} {...EMPH_TEXT}>
                {destinationText}
              </text>

              <text ref={etdHudEtdRef} x={etdLineXs.xEtd} y={38} fontSize={22} textAnchor="end" {...EMPH_TEXT}>
                ETD
              </text>
              <text
                ref={etdHudNumberRef}
                x={etdLineXs.xNum}
                y={38}
                fontSize={30}
                textAnchor="end"
                {...EMPH_TEXT}
              >
                {etdDayCountText}
              </text>
              <text ref={etdHudDaysRef} x={ETD_HUD_RIGHT_X} y={38} fontSize={22} textAnchor="end" {...EMPH_TEXT}>
                days
              </text>
              <text
                x={744}
                y={61}
                fontSize={19.2}
                textAnchor="end"
                {...LABEL_TEXT}
              >
                {weatherTempLabel}
              </text>
              <g dangerouslySetInnerHTML={{ __html: buildWeatherIconSvg(weatherIconLabel) }} />

              <text x={VISITED_HUD.x} y={VISITED_HUD.yCount} fontSize={34} {...EMPH_TEXT}>
                {visitedCountryTotal}/{totalCountries}
              </text>
              <text x={VISITED_HUD.x} y={388} fontSize={19.2} {...LABEL_TEXT}>
                {worldSeenPercent}%
              </text>
              <text x={VISITED_HUD.x} y={VISITED_HUD.yLabel1} fontSize={16} {...LABEL_TEXT}>
                destinations
              </text>
              <text x={VISITED_HUD.x} y={VISITED_HUD.yLabel2} fontSize={16} {...LABEL_TEXT}>
                visited
              </text>
            </g>
          </svg>
        </div>

        <form
          className="next-destination-form"
          onSubmit={(event) => event.preventDefault()}
          aria-label="Next destination settings"
        >
          <div className="form-field">
            <label htmlFor="next-name">Next destination</label>
            <input
              id="next-name"
              type="text"
              value={nextDestination.name}
              maxLength={32}
              onChange={(event) =>
                setNextDestination((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Place or city"
            />
          </div>
          <div className="form-field destination-country-field">
            <label htmlFor="next-country">Destination country</label>
            <div className="destination-country-input-wrap">
              <input
                ref={destinationCountryInputRef}
                id="next-country"
                type="text"
                value={destinationCountryQuery}
                autoComplete="off"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setDestinationCountryQuery(nextValue)
                  setNextDestination((current) =>
                    current.countryCode
                      ? {
                          ...current,
                          countryCode: '',
                        }
                      : current,
                  )
                }}
                onBlur={() => {
                  const exact = allCountries.find((country) => {
                    const q = destinationCountryQuery.trim().toLowerCase()
                    if (!q) return false
                    return country.name.toLowerCase() === q || country.code.toLowerCase() === q
                  })
                  if (exact) applyDestinationCountry(exact.code)
                }}
                placeholder="Start typing a country name…"
              />
              {destinationCountrySuggestions.length > 0 && (
                <ul
                  className="destination-country-suggestions"
                  role="listbox"
                  aria-label="Destination country suggestions"
                >
                  {destinationCountrySuggestions.map((country) => (
                    <li key={country.code}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          applyDestinationCountry(country.code)
                          destinationCountryInputRef.current?.focus()
                        }}
                      >
                        {country.name} <span>{country.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="next-date">Date of visit</label>
            <input
              id="next-date"
              type="date"
              value={nextDestination.date}
              onChange={(event) =>
                setNextDestination((current) => ({ ...current, date: event.target.value }))
              }
            />
          </div>
        </form>
      </section>
    </main>
  )
}
