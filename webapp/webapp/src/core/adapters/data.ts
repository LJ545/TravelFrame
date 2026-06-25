import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import worldCountries, { type WorldCountry } from 'world-countries'
import countriesTopology from 'world-atlas/countries-110m.json'
import landTopology from 'world-atlas/land-110m.json'
import { feature, mesh, neighbors } from 'topojson-client'
import rewind from '@mapbox/geojson-rewind'
import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Polygon } from 'geojson'
import usaStatesGeoJson from '../../data/states/usa.json'
import canadaStatesGeoJson from '../../data/states/can.json'
import brazilStatesGeoJson from '../../data/states/bra.json'
import russiaStatesGeoJson from '../../data/states/rus.json'
import chinaStatesGeoJson from '../../data/states/chn.json'
import type { Country, CountryBorderShape, MapShape, StateInternationalBorder, StateShape } from '../domain/country'

interface CountryRecord {
  code: string
  name: string
  ccn3?: string
  latlng?: [number, number]
}

//get the country records from the world countries library
const countryRecords: CountryRecord[] = worldCountries
  .filter((country: WorldCountry) => country.status === 'officially-assigned')
  .map((country) => ({
    code: country.cca3,
    name: country.name.common,
    ccn3: country.ccn3,
    latlng: country.latlng,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const countries: Country[] = countryRecords.map(({ code, name }) => ({ code, name }))

const isoByNumericCode = new Map(
  countryRecords
    .filter((country) => country.ccn3)
    .map((country) => [country.ccn3!, country.code]),
)

//decode the numeric id of a topology geometry to its ISO code
const codeOf = (geom: { id?: string | number }): string | undefined =>
  isoByNumericCode.get(String(geom.id ?? '').padStart(3, '0'))

const topology = countriesTopology as {
  objects: { countries: { type: 'GeometryCollection'; geometries: Array<{ id?: string | number }> } }
}

const countryFeatures = feature(
  topology as never,
  topology.objects.countries as never,
) as unknown as FeatureCollection<Geometry, { id: string }>

const mappedFeatures = countryFeatures.features
  .map((featureItem) => {
    const code = codeOf(featureItem)
    if (!code) return null
    return { code, geometry: featureItem.geometry }
  })
  .filter((item): item is { code: string; geometry: Geometry } => Boolean(item))

//wrap geometry entries in a collection for the map display
const toFeatureCollection = (
  entries: Array<{ geometry: Geometry }>,
): FeatureCollection<Geometry> => ({
  type: 'FeatureCollection',
  features: entries.map((entry) => ({ type: 'Feature', geometry: entry.geometry, properties: {} })),
})

const projectedFeatureCollection = toFeatureCollection(mappedFeatures)

// The following shapes are exluded from the bounds calculation so the map zooms a bit more to the most relevant landmass
const FIT_BOUNDS_EXCLUDE = new Set([
  'ATA', //Antarctica is shifted a bit to the top to avoid it disapearing from the map
  'BVT', //subantarctic speck
  'HMD', //Heard
  'ATF', //French South
  'CCK', //Cocos
  'PCN', //Pitcairn
])

const forFitFeatures = mappedFeatures.filter((entry) => !FIT_BOUNDS_EXCLUDE.has(entry.code))

const projectedFeatureCollectionForFit: FeatureCollection<Geometry> =
  forFitFeatures.length > 0 ? toFeatureCollection(forFitFeatures) : projectedFeatureCollection

//map dimensions
export const MAP_WIDTH = 800
export const MAP_HEIGHT = 480
export const MAP_TOP_MARGIN = 5
//note: no bottom margin because Antarctica
export const MAP_BOTTOM_MARGIN = 0

//move antarctica up a bit
export const ANTARCTICA_NUDGE_Y = -10

const nudgeFor = (code: string): { nudgeY?: number } =>
  code === 'ATA' ? { nudgeY: ANTARCTICA_NUDGE_Y } : {}
//classify land-110m multipolygon rings south of this latitude as antarctica
const ANTARCTIC_LAND_CENTROID_LAT = -58

const splitLandExcludingAntarctic = (
  geometries: Array<Geometry | undefined | null>,
): { main: MultiPolygon; ant: MultiPolygon } | null => {
  const mainCoords: MultiPolygon['coordinates'] = []
  const antCoords: MultiPolygon['coordinates'] = []
  const classify = (poly: Polygon['coordinates']) => {
    const c = geoCentroid({ type: 'Polygon', coordinates: poly })
    return c[1] < ANTARCTIC_LAND_CENTROID_LAT
  }
  const walk = (g: Geometry) => {
    if (g.type === 'Polygon') {
      ;(classify(g.coordinates) ? antCoords : mainCoords).push(g.coordinates)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        ;(classify(poly) ? antCoords : mainCoords).push(poly)
      }
    } else if (g.type === 'GeometryCollection') {
      g.geometries.forEach(walk)
    }
  }
  geometries.forEach((geometry) => {
    if (geometry && 'type' in geometry) walk(geometry)
  })
  if (antCoords.length === 0 || mainCoords.length === 0) return null
  return { main: { type: 'MultiPolygon', coordinates: mainCoords }, ant: { type: 'MultiPolygon', coordinates: antCoords } }
}

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, MAP_TOP_MARGIN],
    [MAP_WIDTH, MAP_HEIGHT - MAP_BOTTOM_MARGIN],
  ],
  projectedFeatureCollectionForFit,
)
projection.precision(0.8)
const pathGenerator = geoPath(projection)


const toPath = (geometry: Geometry): string =>
  pathGenerator({ type: 'Feature', geometry, properties: {} }) ?? ''

//radius of the dots on the map
const DOT_RADIUS = 2.35
//country will turn to a dot on the map if the projected area is below this
const DOT_AREA_MAX = Math.PI * DOT_RADIUS * DOT_RADIUS

const mergeGeometries = (parts: { geometry: Geometry }[]): MultiPolygon | null => {
  const rings: MultiPolygon['coordinates'] = []
  for (const p of parts) {
    const g = p.geometry
    if (g.type === 'Polygon') {
      rings.push(g.coordinates)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        rings.push(poly)
      }
    }
  }
  if (rings.length === 0) return null
  return { type: 'MultiPolygon', coordinates: rings }
}

//explained down below
const splitFGfromFR = () => {
  const fraParts = byTopoCode.get('FRA')
  if (!fraParts?.length) return
  const fraRings: MultiPolygon['coordinates'] = []
  const gufRings: MultiPolygon['coordinates'] = []
  const collectRings = (geometry: Geometry) => {
    if (geometry.type === 'Polygon') {
      return [geometry.coordinates]
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates
    }
    return []
  }
  for (const part of fraParts) {
    for (const ring of collectRings(part.geometry)) {
      const [lon] = geoCentroid({ type: 'Polygon', coordinates: ring })
      // Guiana only; metro (~2°E) and Corsica (~9°E) stay on FRA
      if (lon < -30) {
        gufRings.push(ring)
      } else {
        fraRings.push(ring)
      }
    }
  }
  if (gufRings.length === 0) return
  byTopoCode.set('FRA', [{ code: 'FRA', geometry: { type: 'MultiPolygon', coordinates: fraRings } }])
  byTopoCode.set('GUF', [{ code: 'GUF', geometry: { type: 'MultiPolygon', coordinates: gufRings } }])
}

const byTopoCode = new Map<string, { code: string; geometry: Geometry }[]>()
mappedFeatures.forEach((entry) => {
  const list = byTopoCode.get(entry.code) ?? []
  list.push(entry)
  byTopoCode.set(entry.code, list)
})

//this is a one time fix to split french guiana from france as it has its own ISO code but had the same geometry as france
//theoretically this should be done using a more elegant solution but it was the only country i had this issue with so far
splitFGfromFR()

//create the map shapes
const mapShapes: MapShape[] = []
for (const [code, parts] of byTopoCode) {
  const mergedGeometry = mergeGeometries(parts)
  if (!mergedGeometry) continue

  const mergedFeature: Feature<MultiPolygon> = {
    type: 'Feature',
    geometry: mergedGeometry,
    properties: { code },
  }

  const pathStr = pathGenerator(mergedFeature) ?? ''
  if (!pathStr) continue

  const area = Math.abs(pathGenerator.area(mergedFeature) ?? 0)
  const centroid = pathGenerator.centroid(mergedFeature)
  const [cx, cy] = centroid
  const dotFromCentroid =
    area > 0 &&
    area < DOT_AREA_MAX &&
    Number.isFinite(cx) &&
    Number.isFinite(cy)

  if (dotFromCentroid) {
    mapShapes.push({ code, path: '', dot: { cx, cy, r: DOT_RADIUS }, ...nudgeFor(code) })
  } else {
    mapShapes.push({ code, path: pathStr, ...nudgeFor(code) })
  }
}

mapShapes.sort((a, b) => a.code.localeCompare(b.code))

const mapCodes = new Set(mapShapes.map((shape) => shape.code))
const fallbackMapShapes = countryRecords
  .filter((country) => !mapCodes.has(country.code) && country.latlng?.length === 2)
  .map((country) => {
    const projected = projection([country.latlng![1], country.latlng![0]])
    if (!projected) return null
    const [cx, cy] = projected
    return { code: country.code, path: '', dot: { cx, cy, r: DOT_RADIUS }, ...nudgeFor(country.code) } as MapShape
  })
  .filter((entry): entry is MapShape => Boolean(entry))

const allMapShapes = [...mapShapes, ...fallbackMapShapes]

//note: this is was more difficult than expected, but it works
//push country dots apart so they dont overlap while keeping them close to their original position
const DOT_SEPARATION_MARGIN = 0.15
const DOT_RELAX_ITERATIONS = 120
const DOT_RELAX_HOME_PULL = 0.11

const relaxOverlappingDots = (shapes: MapShape[]) => {
  type Work = { shape: MapShape; ox: number; oy: number; x: number; y: number; r: number }
  const work: Work[] = []
  for (const shape of shapes) {
    const d = shape.dot
    if (!d) continue
    const nudgeY = shape.nudgeY ?? 0
    const ox = d.cx
    const oy = d.cy + nudgeY
    work.push({ shape, ox, oy, x: ox, y: oy, r: d.r })
  }
  const n = work.length
  for (let iter = 0; iter < DOT_RELAX_ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = work[i]
        const b = work[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.hypot(dx, dy)
        const minDist = a.r + b.r + DOT_SEPARATION_MARGIN
        if (dist < 1e-9) {
          dx = 1
          dy = 0
          dist = 1
        }
        if (dist < minDist) {
          const push = (minDist - dist) / 2
          const ux = dx / dist
          const uy = dy / dist
          a.x += ux * push
          a.y += uy * push
          b.x -= ux * push
          b.y -= uy * push
        }
      }
    }
    for (const w of work) {
      w.x += DOT_RELAX_HOME_PULL * (w.ox - w.x)
      w.y += DOT_RELAX_HOME_PULL * (w.oy - w.y)
    }
  }
  for (const w of work) {
    const ny = w.shape.nudgeY ?? 0
    const d = w.shape.dot!
    d.cx = w.x
    d.cy = w.y - ny
  }
}

relaxOverlappingDots(allMapShapes)

//get the land geometries
const landFeature = feature(
  landTopology as never,
  (landTopology as { objects: { land: unknown } }).objects.land as never,
) as unknown as Feature<Geometry> | FeatureCollection<Geometry>

const landGeometries = landFeature.type === 'FeatureCollection'
  ? landFeature.features.map((entry) => entry.geometry)
  : [landFeature.geometry]
const landSplit = splitLandExcludingAntarctic(landGeometries)
const landPath =
  landSplit === null ? pathGenerator(landFeature) ?? '' : toPath(landSplit.main)
const antarcticLandPath = landSplit === null ? '' : toPath(landSplit.ant)

const isAtaGeometry = (g: { id?: string | number }) => String(g.id) === '010'
const countryTopologyGeometries = topology.objects.countries.geometries

//generate the shared country borders
const countryBorders: CountryBorderShape[] = []
const borderPath =
  pathGenerator(
    mesh(
      topology as never,
      topology.objects.countries as never,
      (a, b) => a !== b && !isAtaGeometry(a) && !isAtaGeometry(b),
    ) as never,
  ) ?? ''

interface RawStateProperties {
  shapeName?: string
  shapeISO?: string
  shapeID?: string
}

interface RawStateCollection {
  features: Array<Feature<Geometry, RawStateProperties>>
}

type LonLat = [number, number]

const subPropsId = (countryCode: string, p: RawStateProperties) =>
  p.shapeID?.trim() ||
  p.shapeISO?.trim() ||
  `${countryCode}-${(p.shapeName ?? 'UNKNOWN').replaceAll(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`

const subdivisionsByCode: Record<string, Array<Feature<Geometry, RawStateProperties>>> = {
  USA: rewind(usaStatesGeoJson as RawStateCollection, true).features,
  CAN: rewind(canadaStatesGeoJson as RawStateCollection, true).features,
  BRA: rewind(brazilStatesGeoJson as RawStateCollection, true).features,
  RUS: rewind(russiaStatesGeoJson as RawStateCollection, true).features,
  CHN: rewind(chinaStatesGeoJson as RawStateCollection, true).features,
}
const subdividedCodesSet = new Set(Object.keys(subdivisionsByCode))

const pointInRing = (x: number, y: number, ring: LonLat[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const denom = yj - yi
    if (denom === 0) continue
    const xint = ((xj - xi) * (y - yi)) / denom + xi
    if ((yi > y) !== (yj > y) && x < xint) inside = !inside
  }
  return inside
}

const pointInPolygonRings = (x: number, y: number, poly: LonLat[][]) => {
  if (!pointInRing(x, y, poly[0])) return false
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(x, y, poly[h])) return false
  }
  return true
}

const pointInMultiPolygon = (x: number, y: number, mp: MultiPolygon) => {
  for (const poly of mp.coordinates) {
    if (pointInPolygonRings(x, y, poly as LonLat[][])) return true
  }
  return false
}

const bboxOfGeometry = (g: Geometry): [number, number, number, number] => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const scanRing = (ring: LonLat[]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (g.type === 'Polygon') (g.coordinates as LonLat[][]).forEach(scanRing)
  else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) (poly as LonLat[][]).forEach(scanRing)
  }
  return [minX, minY, maxX, maxY]
}

interface SubIndexEntry {
  id: string
  geometry: Geometry
  bbox: [number, number, number, number]
}
const subIndexByCode = new Map<string, SubIndexEntry[]>()
for (const [code, feats] of Object.entries(subdivisionsByCode)) {
  const entries: SubIndexEntry[] = []
  for (const f of feats) {
    if (!f.geometry) continue
    entries.push({
      id: subPropsId(code, f.properties as RawStateProperties),
      geometry: f.geometry,
      bbox: bboxOfGeometry(f.geometry),
    })
  }
  subIndexByCode.set(code, entries)
}

const findSubIdAtPoint = (x: number, y: number, code: string): string | undefined => {
  const idx = subIndexByCode.get(code)
  if (!idx) return undefined
  for (const e of idx) {
    if (x < e.bbox[0] || x > e.bbox[2] || y < e.bbox[1] || y > e.bbox[3]) continue
    const g = e.geometry
    if (g.type === 'Polygon') {
      if (pointInPolygonRings(x, y, g.coordinates as LonLat[][])) return e.id
    } else if (g.type === 'MultiPolygon') {
      if (pointInMultiPolygon(x, y, g)) return e.id
    }
  }
  return undefined
}

//Test point used to determine which state/province owns a border segment
const inwardTestPoint = (a: LonLat, b: LonLat, toward: LonLat, step: number): LonLat => {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  let nx = -dy / len
  let ny = dx / len
  const vx = toward[0] - mx
  const vy = toward[1] - my
  if (nx * vx + ny * vy < 0) {
    nx = -nx
    ny = -ny
  }
  return [mx + nx * step, my + ny * step]
}

//far too complicated for what it does, had issues with combining the state and country map data
//not very elegant should be reworked in the future
const INTL_NUDGE_STEPS = [0.12, 0.25, 0.45, 0.7, -0.12, -0.3]

const resolveSubAtEdge = (a: LonLat, b: LonLat, toward: LonLat, code: string): string | undefined => {
  for (const step of INTL_NUDGE_STEPS) {
    const p = inwardTestPoint(a, b, toward, step)
    const found = findSubIdAtPoint(p[0], p[1], code)
    if (found) return found
  }
  return undefined
}

const mergedCountry = (code: string): MultiPolygon | null => {
  const parts = byTopoCode.get(code)
  if (!parts) return null
  return mergeGeometries(parts)
}

const centroidCacheByCode = new Map<string, LonLat>()
const getCountryCentroid = (code: string): LonLat | null => {
  const cached = centroidCacheByCode.get(code)
  if (cached) return cached
  const merged = mergedCountry(code)
  if (!merged) return null
  const c = geoCentroid({ type: 'Feature', geometry: merged, properties: {} } as Feature<MultiPolygon>) as LonLat
  centroidCacheByCode.set(code, c)
  return c
}

const intlBySubId = new Map<string, StateInternationalBorder[]>()
const appendIntl = (subId: string, entry: StateInternationalBorder) => {
  const cur = intlBySubId.get(subId) ?? []
  cur.push(entry)
  intlBySubId.set(subId, cur)
}

const emitIntlPath = (
  subId: string,
  neighborCode: string,
  neighborSubId: string | undefined,
  coords: LonLat[],
) => {
  if (coords.length < 2) return
  const path =
    pathGenerator({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    } as Feature<LineString>) ?? ''
  if (!path) return
  appendIntl(subId, {
    neighborCountryCode: neighborCode,
    ...(neighborSubId ? { neighborSubId } : {}),
    path,
  })
}

const extractMeshLines = (m: unknown): LonLat[][] => {
  if (!m || typeof m !== 'object' || !('type' in m)) return []
  const mm = m as { type: string; coordinates?: unknown }
  if (mm.type === 'LineString' && Array.isArray(mm.coordinates)) {
    return [mm.coordinates as LonLat[]]
  }
  if (mm.type === 'MultiLineString' && Array.isArray(mm.coordinates)) {
    return mm.coordinates as LonLat[][]
  }
  return []
}

//process the border line between two countries
const processBorderLine = (
  codeA: string,
  codeB: string,
  line: LonLat[],
  centroidA: LonLat,
  centroidB: LonLat,
) => {
  const hasSubA = subdividedCodesSet.has(codeA)
  const hasSubB = subdividedCodesSet.has(codeB)
  if (!hasSubA && !hasSubB) return
  const N = line.length
  if (N < 2) return

  interface Assign {
    sidA: string | undefined
    sidB: string | undefined
  }
  const assigns: Assign[] = new Array(N - 1)
  for (let i = 0; i < N - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    assigns[i] = {
      sidA: hasSubA ? resolveSubAtEdge(a, b, centroidA, codeA) : undefined,
      sidB: hasSubB ? resolveSubAtEdge(a, b, centroidB, codeB) : undefined,
    }
  }

  let runStart = 0
  for (let i = 1; i <= N - 1; i++) {
    const prev = assigns[runStart]
    const cur = i < N - 1 ? assigns[i] : null
    if (!cur || cur.sidA !== prev.sidA || cur.sidB !== prev.sidB) {
      const coords = line.slice(runStart, i + 1)
      if (prev.sidA) emitIntlPath(prev.sidA, codeB, prev.sidB, coords)
      if (prev.sidB) emitIntlPath(prev.sidB, codeA, prev.sidA, coords)
      runStart = i
    }
  }
}

//compute both border layers (state and country) in once pass
const computeBorders = () => {
  neighbors(countryTopologyGeometries as never).forEach((neighborIndexes, aIndex) => {
    const geomA = countryTopologyGeometries[aIndex]
    const codeA = codeOf(geomA)
    if (!codeA) return

    neighborIndexes.forEach((bIndex) => {
      if (bIndex <= aIndex) return
      const geomB = countryTopologyGeometries[bIndex]
      const codeB = codeOf(geomB)
      if (!codeB) return

      const meshResult = mesh(
        topology as never,
        { type: 'GeometryCollection', geometries: [geomA, geomB] } as never,
        (x, y) => x !== y,
      )

      const path = pathGenerator(meshResult as never)
      if (path && codeA !== 'ATA' && codeB !== 'ATA') {
        countryBorders.push({ codeA, codeB, path })
      }

      if (!subdividedCodesSet.has(codeA) && !subdividedCodesSet.has(codeB)) return
      const lines = extractMeshLines(meshResult)
      if (!lines.length) return

      const centroidA = getCountryCentroid(codeA)
      const centroidB = getCountryCentroid(codeB)
      if (!centroidA || !centroidB) return

      for (const line of lines) {
        processBorderLine(codeA, codeB, line, centroidA, centroidB)
      }
    })
  })
}

computeBorders()

const mapFeaturesToStateShapes = (
  countryCode: string,
  features: Array<Feature<Geometry, RawStateProperties>>,
): StateShape[] =>
  features
    .map((featureItem) => {
      const geometry = featureItem.geometry
      if (!geometry) return null
      const path = pathGenerator({
        type: 'Feature',
        geometry,
        properties: {},
      })
      if (!path) return null

      const stateCode = subPropsId(countryCode, featureItem.properties as RawStateProperties)
      const stateName = featureItem.properties?.shapeName?.trim() || stateCode

      return {
        id: stateCode,
        code: stateCode,
        name: stateName,
        countryCode,
        path,
      }
    })
    .filter((state): state is StateShape => Boolean(state))

const stateShapesBase: StateShape[] = Object.entries(subdivisionsByCode).flatMap(
  ([code, feats]) => mapFeaturesToStateShapes(code, feats),
)

const stateShapes: StateShape[] = stateShapesBase.map((s) => {
  const intl = intlBySubId.get(s.id)
  return intl?.length ? { ...s, internationalBorders: intl } : s
})

export const countryData = {
  countries,
  mapShapes: allMapShapes,
  stateShapes,
  landPath,
  antarcticLandPath,
  borderPath,
  countryBorders,
}
