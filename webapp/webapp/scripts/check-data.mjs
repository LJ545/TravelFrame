import worldCountries from 'world-countries'
import countriesTopology from 'world-atlas/countries-110m.json' with { type: 'json' }
import { feature } from 'topojson-client'

const countries = worldCountries.filter((country) => country.status === 'officially-assigned')

//check for ISO 3166-1 compliancee
if (countries.length !== 249) {
  throw new Error(`Expected 249 ISO 3166-1 officially-assigned codes instead got ${countries.length}`)
}

const isoByNumericCode = new Map(
  countries.filter((country) => country.ccn3).map((country) => [country.ccn3, country.cca3]),
)

const geoFeatures = feature(countriesTopology, countriesTopology.objects.countries)
const mapCodes = new Set(
  geoFeatures.features
    .map((shape) => String(shape.id ?? '').padStart(3, '0'))
    .map((numericCode) => isoByNumericCode.get(numericCode))
    .filter(Boolean),
)
const countryCodes = new Set(countries.map((country) => country.cca3))

const missingFromMap = [...countryCodes].filter((code) => !mapCodes.has(code))

const fallbackCandidates = new Set(
  countries.filter((country) => country.latlng?.length === 2).map((country) => country.cca3),
)
const nonRecoverableMissing = missingFromMap.filter((code) => !fallbackCandidates.has(code))

if (nonRecoverableMissing.length > 0) {
  throw new Error(`Destinations missing map and fallback coordinates: ${nonRecoverableMissing.join(', ')}`)
}

console.log(
  `Data integrity ok: ${countries.length} ISO 3166-1 destinations, ${mapCodes.size} direct map shapes, ${missingFromMap.length} with lat/lon fallback dots.`,
)
