import type { CountryCode } from './country'

export const toggleVisited = (visited: Set<CountryCode>, code: CountryCode) => {
  const next = new Set(visited)
  if (next.has(code)) {
    next.delete(code)
  } else {
    next.add(code)
  }
  return next
}

export const isVisited = (visited: Set<CountryCode>, code: CountryCode) => visited.has(code)

export const filterCountries = <T extends { name: string }>(countries: T[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return countries
  return countries.filter((country) => country.name.toLowerCase().includes(normalizedQuery))
}
