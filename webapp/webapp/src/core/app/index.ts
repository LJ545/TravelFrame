import { StaticCountryRepository, StaticMapShapeRepository } from '../adapters/repositories'
import { BrowserSvgExporter } from '../adapters/svgExporter'
import { InMemoryVisitedStateStore } from '../adapters/visitedStore'
import { CountryMapService } from './CountryMapService'

export const countryMapService = new CountryMapService(
  new StaticCountryRepository(),
  new StaticMapShapeRepository(),
  new InMemoryVisitedStateStore(),
  new BrowserSvgExporter(),
)
