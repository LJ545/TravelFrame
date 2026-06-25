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
  nextDestination: { name: string; date: string; countryCode: string }
  setVisitedStateIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setStateMode: (mode: boolean) => void
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
  const [nextDestination, setNextDestination] = useState<{ name: string; date: string; countryCode: string }>({
    name: '',
    date: '',
    countryCode: '',
  })
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' })

  /** Visited-country snapshot from the service. Re-rendered on each subscription tick. */
  const [visitedTick, setVisitedTick] = useState(0)
  useEffect(() => countryMapService.subscribe(() => setVisitedTick((n) => n + 1)), [])
  const visited = useMemo(
    () => countryMapService.getVisited(),
    /** `visitedTick` is the dependency, even though it's not read here — the store is
     *  mutable so the only signal that something changed is the tick. */
    [visitedTick],
  )

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Latest in-flight PUT controller — so a fresh change can cancel a slow request. */
  const inflight = useRef<AbortController | null>(null)

  /** Hydrate whenever the active serial changes. */
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

  /** Debounced PUT whenever any of the tracked state pieces change after hydration. */
  useEffect(() => {
    if (!serial || !loaded) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      inflight.current?.abort()
      const controller = new AbortController()
      inflight.current = controller
      const payload: Omit<UserState, 'updatedAt'> = {
        visited: [...visited].sort(),
        visitedStates: [...visitedStateIds].sort(),
        stateMode,
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
  }, [serial, loaded, visited, visitedStateIds, stateMode, nextDestination])

  /** Wrapping `setStateMode` so consumers that previously accepted `Dispatch<SetStateAction>`
   *  still work, but the stable identity helps the page's effect dependency lists. */
  const setStateMode = useCallback((mode: boolean) => setStateModeRaw(mode), [])

  return {
    loaded,
    syncStatus,
    visited,
    visitedStateIds,
    stateMode,
    nextDestination,
    setVisitedStateIds,
    setStateMode,
    setNextDestination,
  }
}
