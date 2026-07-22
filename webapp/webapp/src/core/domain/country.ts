export type CountryCode = string

export interface Country {
  code: CountryCode
  name: string
}

export interface MapDot {
  cx: number
  cy: number
  r: number
}

export interface MapShape {
  code: CountryCode
  path: string
  dot?: MapDot
  nudgeY?: number
  centroid?: [number, number]
}

export interface CountryBorderShape {
  codeA: CountryCode
  codeB: CountryCode
  path: string
  nudgeY?: number
}

export interface StateInternationalBorder {
  neighborCountryCode: CountryCode
  neighborSubId?: string
  path: string
}

export interface StateShape {
  id: string
  code: string
  name: string
  countryCode: CountryCode
  path: string
  internationalBorders?: StateInternationalBorder[]
}
