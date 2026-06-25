import type { HudRenderInputs, HudSnapshot } from '@travelframe/contracts'
import { filterCountries, toggleVisited } from '../domain/visited'
import type { CountrySelectionCommand, VisitedChangedEvent } from '../domain/contracts'
import type { Country, CountryBorderShape, MapShape, StateShape } from '../domain/country'
import type {
  CountryRepository,
  MapShapeRepository,
  SvgExporter,
  VisitedStateStore,
} from '../ports'

export class CountryMapService {
  private countries: Country[]

  private mapShapes: MapShape[]
  private stateShapes: StateShape[]
  private landPath: string
  private antarcticLandPath: string
  private countryBorders: CountryBorderShape[]
  private borderPath: string

  private countryRepository: CountryRepository

  private mapShapeRepository: MapShapeRepository

  private visitedStateStore: VisitedStateStore

  private svgExporter: SvgExporter

  constructor(
    countryRepository: CountryRepository,
    mapShapeRepository: MapShapeRepository,
    visitedStateStore: VisitedStateStore,
    svgExporter: SvgExporter,
  ) {
    this.countryRepository = countryRepository
    this.mapShapeRepository = mapShapeRepository
    this.visitedStateStore = visitedStateStore
    this.svgExporter = svgExporter
    this.countries = this.countryRepository.getAllCountries()
    this.mapShapes = this.mapShapeRepository.getMapShapes()
    this.stateShapes = this.mapShapeRepository.getStateShapes()
    this.landPath = this.mapShapeRepository.getLandPath()
    this.antarcticLandPath = this.mapShapeRepository.getAntarcticLandPath()
    this.countryBorders = this.mapShapeRepository.getCountryBorders()
    this.borderPath = this.mapShapeRepository.getBorderPath()
  }

  getCountries(query = '') {
    return filterCountries(this.countries, query)
  }

  getMapShapes() {
    return this.mapShapes
  }

  getStateShapes() {
    return this.stateShapes
  }

  getLandPath() {
    return this.landPath
  }

  getAntarcticLandPath() {
    return this.antarcticLandPath
  }

  getCountryBorders() {
    return this.countryBorders
  }

  getBorderPath() {
    return this.borderPath
  }

  getVisited() {
    return this.visitedStateStore.getVisited()
  }

  subscribe(listener: () => void) {
    return this.visitedStateStore.subscribe(listener)
  }

  applySelection(command: CountrySelectionCommand): VisitedChangedEvent {
    const current = this.visitedStateStore.getVisited()
    const next = new Set(current)

    if (command.action === 'toggle') {
      const toggled = toggleVisited(next, command.code)
      const added = !current.has(command.code) ? command.code : undefined
      const removed = current.has(command.code) ? command.code : undefined
      this.visitedStateStore.setVisited(toggled)
      return { added, removed, visitedCodes: [...toggled].sort() }
    }

    if (command.action === 'visit') {
      next.add(command.code)
      this.visitedStateStore.setVisited(next)
      return { added: command.code, visitedCodes: [...next].sort() }
    }

    next.delete(command.code)
    this.visitedStateStore.setVisited(next)
    return { removed: command.code, visitedCodes: [...next].sort() }
  }

  renderBmp(svgElement: SVGSVGElement, hudInputs: HudRenderInputs) {
    return this.svgExporter.render(svgElement, hudInputs)
  }

  buildTemplate(svgElement: SVGSVGElement, snapshot: HudSnapshot) {
    return this.svgExporter.buildTemplate(svgElement, snapshot)
  }

  downloadBmp(bytes: Uint8Array, fileName = 'visited-world-map.bmp') {
    this.svgExporter.download(bytes, fileName)
  }

  replaceVisited(codes: Iterable<string>) {
    const next = new Set<string>()
    for (const code of codes) next.add(code)
    this.visitedStateStore.setVisited(next)
  }
}
