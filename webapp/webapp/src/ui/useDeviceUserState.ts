import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Serial, UserState } from '@travelframe/contracts'
import { emptyUserState } from '@travelframe/contracts'
import { ApiError, apiClient } from '../core/adapters/deviceApi'
import { countryMapService } from '../core/app'

export interface DeviceUserStateView {
  loaded: boolean
  syncStatus: SyncStatus
  visited: ReadonlySet<string>
  visitedStateIds: ReadonlySet<string>
  stateMode: boolean
  twoUserMode: boolean
  activeUser: 1 | 2
  visitedUser1: ReadonlySet<string>
  visitedStatesUser1: ReadonlySet<string>
  visitedUser2: ReadonlySet<string>
  visitedStatesUser2: ReadonlySet<string>
  temperatureUnit: 'celsius' | 'fahrenheit'
  nextDestination: { name: string; date: string; countryCode: string }
  setVisitedStateIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setStateMode: (mode: boolean, stateIdsByCountry?: ReadonlyMap<string, readonly string[]>) => void
  setTwoUserMode: (mode: boolean) => void
  setActiveUser: (user: 1 | 2) => void
  setTemperatureUnit: (unit: 'celsius' | 'fahrenheit') => void
  setNextDestination: React.Dispatch<
    React.SetStateAction<{ name: string; date: string; countryCode: string }>
  >
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

const DEBOUNCE_MS = 500

export const useDeviceUserState = (serial: Serial | undefined): DeviceUserStateView => {
  const [loaded, setLoaded] = useState(false)
  const [visitedStateIds, setVisitedStateIds] = useState<Set<string>>(new Set())
  const [stateMode, setStateModeRaw] = useState(false)
  const [twoUserMode, setTwoUserModeRaw] = useState(false)
  const [activeUser, setActiveUserRaw] = useState<1 | 2>(1)
  const [visitedUser1, setVisitedUser1] = useState<Set<string>>(new Set())
  const [visitedStatesUser1, setVisitedStatesUser1] = useState<Set<string>>(new Set())
  const [visitedUser2, setVisitedUser2] = useState<Set<string>>(new Set())
  const [visitedStatesUser2, setVisitedStatesUser2] = useState<Set<string>>(new Set())
  const [temperatureUnit, setTemperatureUnit] = useState<'celsius' | 'fahrenheit'>('celsius')
  const [nextDestination, setNextDestination] = useState<{ name: string; date: string; countryCode: string }>({
    name: '',
    date: '',
    countryCode: '',
  })
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' })

  //visited countries from the service
  const [visitedTick, setVisitedTick] = useState(0)
  useEffect(() => countryMapService.subscribe(() => setVisitedTick((n) => n + 1)), [])
  const visited = useMemo(
    () => countryMapService.getVisited(),
   [visitedTick],
  )

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<AbortController | null>(null)

  //fetch the user state from the service
  useEffect(() => {
    if (!serial) {
      setLoaded(false)
      return
    }
    let cancelled = false
    setLoaded(false)
    setSyncStatus({ kind: 'idle' })
    void (async () => {
      try {
        const state = await apiClient.getState(serial)
        if (cancelled) return
        countryMapService.replaceVisited(state.visited)
        setVisitedStateIds(new Set(state.visitedStates))
        setStateModeRaw(state.stateMode)
        const nextTwoUserMode = state.twoUserMode ?? false
        const nextActiveUser = state.activeUser === 2 ? 2 : 1
        const nextVisitedUser1 = new Set(state.visitedUser1 ?? state.visited)
        const nextVisitedStatesUser1 = new Set(state.visitedStatesUser1 ?? state.visitedStates)
        const nextVisitedUser2 = new Set(state.visitedUser2 ?? [])
        const nextVisitedStatesUser2 = new Set(state.visitedStatesUser2 ?? [])
        setTwoUserModeRaw(nextTwoUserMode)
        setActiveUserRaw(nextActiveUser)
        setVisitedUser1(nextVisitedUser1)
        setVisitedStatesUser1(nextVisitedStatesUser1)
        setVisitedUser2(nextVisitedUser2)
        setVisitedStatesUser2(nextVisitedStatesUser2)
        setTemperatureUnit(state.temperatureUnit ?? 'celsius')
        if (nextTwoUserMode) {
          countryMapService.replaceVisited(nextActiveUser === 1 ? nextVisitedUser1 : nextVisitedUser2)
          setVisitedStateIds(nextActiveUser === 1 ? nextVisitedStatesUser1 : nextVisitedStatesUser2)
        }
        setNextDestination({
          name: state.nextDestination?.name ?? '',
          date: state.nextDestination?.date ?? '',
          countryCode: state.nextDestination?.countryCode ?? '',
        })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'unknown error'
        setSyncStatus({ kind: 'error', message })
        const fallback = emptyUserState(new Date(0).toISOString())
        countryMapService.replaceVisited(fallback.visited)
        setVisitedStateIds(new Set(fallback.visitedStates))
        setStateModeRaw(fallback.stateMode)
        setTwoUserModeRaw(fallback.twoUserMode)
        setActiveUserRaw(fallback.activeUser)
        setVisitedUser1(new Set(fallback.visitedUser1))
        setVisitedStatesUser1(new Set(fallback.visitedStatesUser1))
        setVisitedUser2(new Set(fallback.visitedUser2))
        setVisitedStatesUser2(new Set(fallback.visitedStatesUser2))
        setTemperatureUnit(fallback.temperatureUnit)
        setNextDestination({
          name: fallback.nextDestination.name,
          date: fallback.nextDestination.date,
          countryCode: fallback.nextDestination.countryCode ?? '',
        })
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [serial])

  //debounced put
  useEffect(() => {
    if (!serial || !loaded) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      inflight.current?.abort()
      const controller = new AbortController()
      inflight.current = controller
      const effectiveVisitedUser1 = activeUser === 1 ? visited : visitedUser1
      const effectiveVisitedStatesUser1 = activeUser === 1 ? visitedStateIds : visitedStatesUser1
      const effectiveVisitedUser2 = activeUser === 2 ? visited : visitedUser2
      const effectiveVisitedStatesUser2 = activeUser === 2 ? visitedStateIds : visitedStatesUser2
      const combinedVisited = twoUserMode
        ? new Set([...effectiveVisitedUser1, ...effectiveVisitedUser2])
        : visited
      const combinedVisitedStates = twoUserMode
        ? new Set([...effectiveVisitedStatesUser1, ...effectiveVisitedStatesUser2])
        : visitedStateIds
      const payload: Omit<UserState, 'updatedAt'> = {
        visited: [...combinedVisited].sort(),
        visitedStates: [...combinedVisitedStates].sort(),
        stateMode,
        twoUserMode,
        activeUser,
        visitedUser1: [...effectiveVisitedUser1].sort(),
        visitedStatesUser1: [...effectiveVisitedStatesUser1].sort(),
        visitedUser2: [...effectiveVisitedUser2].sort(),
        visitedStatesUser2: [...effectiveVisitedStatesUser2].sort(),
        temperatureUnit,
        nextDestination: { ...nextDestination },
      }
      setSyncStatus({ kind: 'saving' })
      apiClient
        .putState(serial, payload)
        .then(() => {
          if (controller.signal.aborted) return
          setSyncStatus({ kind: 'saved', at: Date.now() })
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          if (err instanceof ApiError && err.status === 404) {
            setSyncStatus({ kind: 'error', message: 'serial no longer registered' })
            return
          }
          const message = err instanceof Error ? err.message : 'unknown error'
          setSyncStatus({ kind: 'error', message })
        })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [
    serial,
    loaded,
    visited,
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
  ])

  const setStateMode = useCallback(
    (mode: boolean, stateIdsByCountry?: ReadonlyMap<string, readonly string[]>) => {
      if (!mode || !stateIdsByCountry) {
        setStateModeRaw(mode)
        return
      }
      const seedStates = (countryCodes: ReadonlySet<string>, current: ReadonlySet<string>) => {
        const next = new Set(current)
        countryCodes.forEach((code) => stateIdsByCountry.get(code)?.forEach((id) => next.add(id)))
        return next
      }

      if (twoUserMode) {
        const nextUser1States = seedStates(
          activeUser === 1 ? visited : visitedUser1,
          activeUser === 1 ? visitedStateIds : visitedStatesUser1,
        )
        const nextUser2States = seedStates(
          activeUser === 2 ? visited : visitedUser2,
          activeUser === 2 ? visitedStateIds : visitedStatesUser2,
        )
        setVisitedStatesUser1(nextUser1States)
        setVisitedStatesUser2(nextUser2States)
        setVisitedStateIds(activeUser === 1 ? nextUser1States : nextUser2States)
      } else {
        setVisitedStateIds((current) => seedStates(visited, current))
      }
      setStateModeRaw(true)
    },
    [
      twoUserMode,
      activeUser,
      visited,
      visitedStateIds,
      visitedUser1,
      visitedStatesUser1,
      visitedUser2,
      visitedStatesUser2,
    ],
  )

  const setTwoUserMode = useCallback(
    (mode: boolean) => {
      if (mode === twoUserMode) return
      if (mode) {
        setVisitedUser1(new Set(visited))
        setVisitedStatesUser1(new Set(visitedStateIds))
        setVisitedUser2(new Set())
        setVisitedStatesUser2(new Set())
        setActiveUserRaw(1)
        setTwoUserModeRaw(true)
        return
      }

      const effectiveVisitedUser1 = activeUser === 1 ? visited : visitedUser1
      const effectiveVisitedStatesUser1 = activeUser === 1 ? visitedStateIds : visitedStatesUser1
      const effectiveVisitedUser2 = activeUser === 2 ? visited : visitedUser2
      const effectiveVisitedStatesUser2 = activeUser === 2 ? visitedStateIds : visitedStatesUser2
      const mergedVisited = new Set([...effectiveVisitedUser1, ...effectiveVisitedUser2])
      const mergedVisitedStates = new Set([...effectiveVisitedStatesUser1, ...effectiveVisitedStatesUser2])
      countryMapService.replaceVisited(mergedVisited)
      setVisitedStateIds(mergedVisitedStates)
      setActiveUserRaw(1)
      setTwoUserModeRaw(false)
    },
    [
      twoUserMode,
      activeUser,
      visited,
      visitedStateIds,
      visitedUser1,
      visitedStatesUser1,
      visitedUser2,
      visitedStatesUser2,
    ],
  )

  const setActiveUser = useCallback(
    (user: 1 | 2) => {
      if (!twoUserMode || user === activeUser) return
      if (activeUser === 1) {
        setVisitedUser1(new Set(visited))
        setVisitedStatesUser1(new Set(visitedStateIds))
      } else {
        setVisitedUser2(new Set(visited))
        setVisitedStatesUser2(new Set(visitedStateIds))
      }
      countryMapService.replaceVisited(user === 1 ? visitedUser1 : visitedUser2)
      setVisitedStateIds(new Set(user === 1 ? visitedStatesUser1 : visitedStatesUser2))
      setActiveUserRaw(user)
    },
    [
      twoUserMode,
      activeUser,
      visited,
      visitedStateIds,
      visitedUser1,
      visitedStatesUser1,
      visitedUser2,
      visitedStatesUser2,
    ],
  )

  const effectiveVisitedUser1 = activeUser === 1 && twoUserMode ? visited : visitedUser1
  const effectiveVisitedStatesUser1 =
    activeUser === 1 && twoUserMode ? visitedStateIds : visitedStatesUser1
  const effectiveVisitedUser2 = activeUser === 2 && twoUserMode ? visited : visitedUser2
  const effectiveVisitedStatesUser2 =
    activeUser === 2 && twoUserMode ? visitedStateIds : visitedStatesUser2

  return {
    loaded,
    syncStatus,
    visited,
    visitedStateIds,
    stateMode,
    twoUserMode,
    activeUser,
    visitedUser1: effectiveVisitedUser1,
    visitedStatesUser1: effectiveVisitedStatesUser1,
    visitedUser2: effectiveVisitedUser2,
    visitedStatesUser2: effectiveVisitedStatesUser2,
    temperatureUnit,
    nextDestination,
    setVisitedStateIds,
    setStateMode,
    setTwoUserMode,
    setActiveUser,
    setTemperatureUnit,
    setNextDestination,
  }
}
