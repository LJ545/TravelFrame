import { describe, expect, it } from 'vitest'
import { filterCountries, toggleVisited } from './visited'

describe('visited domain helpers', () => {
  it('toggles a country code on and off', () => {
    const initial = new Set<string>()
    const visited = toggleVisited(initial, 'NOR')
    expect(visited.has('NOR')).toBe(true)

    const unvisited = toggleVisited(visited, 'NOR')
    expect(unvisited.has('NOR')).toBe(false)
  })

  it('filters countries by partial case-insensitive name', () => {
    const countries = [{ name: 'Norway' }, { name: 'Germany' }, { name: 'Ghana' }]
    const filtered = filterCountries(countries, 'ger')
    expect(filtered).toEqual([{ name: 'Germany' }])
  })
})
