import type { CountryCode } from '../domain/country'
import type { VisitedStateStore } from '../ports'

export class InMemoryVisitedStateStore implements VisitedStateStore {
  private visited = new Set<CountryCode>()

  private listeners = new Set<() => void>()

  getVisited() {
    return this.visited
  }

  setVisited(next: Set<CountryCode>) {
    this.visited = new Set(next)
    this.listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
