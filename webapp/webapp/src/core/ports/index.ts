import type { HudRenderInputs, HudSnapshot } from '@travelframe/contracts'
import type { Country, CountryBorderShape, CountryCode, MapShape, StateShape } from '../domain/country'

export interface CountryRepository {
  getAllCountries(): Country[]
}

export interface MapShapeRepository {
  getMapShapes(): MapShape[]
  getStateShapes(): StateShape[]
  getLandPath(): string
  getAntarcticLandPath(): string
  getCountryBorders(): CountryBorderShape[]
  getBorderPath(): string
}

export interface VisitedStateStore {
  getVisited(): Set<CountryCode>
  setVisited(next: Set<CountryCode>): void
  subscribe(listener: () => void): () => void
}

export interface SvgExporter {
  render(svgElement: SVGSVGElement, hudInputs: HudRenderInputs): Promise<Uint8Array>
  download(bytes: Uint8Array, fileName: string): void
  buildTemplate(svgElement: SVGSVGElement, snapshot: HudSnapshot): string
}
