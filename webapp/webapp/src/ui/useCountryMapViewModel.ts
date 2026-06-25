import { useMemo, useSyncExternalStore } from 'react'
import { countryMapService } from '../core/app'

export const useCountryMapViewModel = (query: string) => {
  const visited = useSyncExternalStore(
    (onStoreChange) => countryMapService.subscribe(onStoreChange),
    () => countryMapService.getVisited(),
  )

  const countries = useMemo(() => countryMapService.getCountries(query), [query])
  const allCountries = useMemo(() => countryMapService.getCountries(''), [])
  const totalCountries = allCountries.length
  const mapShapes = useMemo(() => countryMapService.getMapShapes(), [])
  const stateShapes = useMemo(() => countryMapService.getStateShapes(), [])
  const landPath = useMemo(() => countryMapService.getLandPath(), [])
  const antarcticLandPath = useMemo(() => countryMapService.getAntarcticLandPath(), [])
  const countryBorders = useMemo(() => countryMapService.getCountryBorders(), [])
  const borderPath = useMemo(() => countryMapService.getBorderPath(), [])

  return {
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
    toggleVisited: (code: string) =>
      countryMapService.applySelection({
        code,
        action: 'toggle',
      }),
  }
}
