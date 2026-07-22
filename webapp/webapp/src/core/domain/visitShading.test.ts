import { describe, expect, it } from 'vitest'
import { resolveVisitShade } from './visitShading'

describe('resolveVisitShade', () => {
  const user1 = new Set(['DEU', 'NOR'])
  const user2 = new Set(['DEU', 'SWE'])

  it('resolves unvisited and per-user visits', () => {
    expect(resolveVisitShade('FRA', user1, user2)).toBe('none')
    expect(resolveVisitShade('NOR', user1, user2)).toBe('user1')
    expect(resolveVisitShade('SWE', user1, user2)).toBe('user2')
  })

  it('resolves shared visits as both', () => {
    expect(resolveVisitShade('DEU', user1, user2)).toBe('both')
  })
})
