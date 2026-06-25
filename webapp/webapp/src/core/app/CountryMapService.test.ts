import { describe, expect, it } from 'vitest'
import { CountryMapService } from './CountryMapService'
import { InMemoryVisitedStateStore } from '../adapters/visitedStore'
import type { CountryRepository, MapShapeRepository, SvgExporter } from '../ports'

const countryRepo: CountryRepository = {
  getAllCountries: () => [
    { code: 'NOR', name: 'Norway' },
    { code: 'SWE', name: 'Sweden' },
  ],
}

const mapRepo: MapShapeRepository = {
  getMapShapes: () => [{ code: 'NOR', path: 'M0,0' }],
  getStateShapes: () => [],
  getLandPath: () => 'M0,0',
  getAntarcticLandPath: () => '',
  getCountryBorders: () => [],
  getBorderPath: () => 'M0,0',
}

const exporter: SvgExporter = {
  render: async () => new Uint8Array(0),
  download: () => undefined,
  buildTemplate: () => '<svg></svg>',
}

describe('CountryMapService', () => {
  it('keeps map/list codes aligned and toggles visited state', () => {
    const service = new CountryMapService(countryRepo, mapRepo, new InMemoryVisitedStateStore(), exporter)
    service.applySelection({ code: 'NOR', action: 'toggle' })

    expect(service.getVisited().has('NOR')).toBe(true)
    expect(service.getCountries('').map((item) => item.code)).toContain('NOR')
    expect(service.getMapShapes().map((item) => item.code)).toContain('NOR')
  })
})
