declare module 'world-atlas/countries-110m.json' {
  const data: unknown
  export default data
}

declare module 'world-atlas/land-110m.json' {
  const data: unknown
  export default data
}

declare module 'world-countries' {
  export interface WorldCountry {
    cca3: string
    ccn3?: string
    name: { common: string }
    unMember?: boolean
    status?: 'officially-assigned' | 'user-assigned'
    latlng?: [number, number]
  }

  const countries: WorldCountry[]
  export default countries
}

declare module '*.geojson' {
  const data: unknown
  export default data
}

declare module '@mapbox/geojson-rewind' {
  function rewind<T>(geojson: T, outer?: boolean): T
  export default rewind
}

declare module '*.woff2?inline' {
  const url: string
  export default url
}

declare module '*.woff2?url' {
  const url: string
  export default url
}
