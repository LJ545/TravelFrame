import { countryData } from './data'
import type { CountryRepository, MapShapeRepository } from '../ports'

export class StaticCountryRepository implements CountryRepository {
  getAllCountries() {
    return countryData.countries
  }
}

export class StaticMapShapeRepository implements MapShapeRepository {
  getMapShapes() {
    return countryData.mapShapes
  }

  getStateShapes() {
    return countryData.stateShapes
  }

  getLandPath() {
    return countryData.landPath
  }

  getAntarcticLandPath() {
    return countryData.antarcticLandPath
  }

  getCountryBorders() {
    return countryData.countryBorders
  }

  getBorderPath() {
    return countryData.borderPath
  }
}
