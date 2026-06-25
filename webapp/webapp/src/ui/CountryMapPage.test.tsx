import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CountryMapPage } from './CountryMapPage'
import type { Serial } from '@travelframe/contracts'
import { emptyUserState } from '@travelframe/contracts'

const TEST_SERIAL = 'ABCDEFGH' as Serial

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith(`/api/devices/${TEST_SERIAL}/state`)) {
        return new Response(JSON.stringify(emptyUserState(new Date(0).toISOString())), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CountryMapPage', () => {
  it('filters destinations and toggles visited class from list click', async () => {
    render(<CountryMapPage serial={TEST_SERIAL} />)
    const user = userEvent.setup()

    const input = screen.getByLabelText('Search destinations')
    await user.type(input, 'norway')

    const norway = screen.getByRole('button', { name: /Norway/i })
    await user.click(norway)

    expect(norway).toHaveClass('selected')
  })
})
