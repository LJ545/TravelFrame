import type { CountryCode } from './country'

export interface VisitedChangedEvent {
  added?: CountryCode
  removed?: CountryCode
  visitedCodes: CountryCode[]
}

export interface CountrySelectionCommand {
  code: CountryCode
  action: 'visit' | 'unvisit' | 'toggle'
}
