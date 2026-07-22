import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { DeviceRegistry } from '../store/devices.js'
import { ImageStore } from '../store/image.js'
import { UserStateStore } from '../store/userState.js'
import { makeTempDir } from './helpers.js'

describe('DeviceRegistry', () => {
  let dir = ''
  let cleanup = async () => {}
  beforeEach(async () => {
    const t = await makeTempDir('reg')
    dir = t.dir
    cleanup = t.cleanup
  })
  afterEach(async () => cleanup())

  it('starts empty and inserts a device', async () => {
    const r = new DeviceRegistry(dir)
    expect(await r.list()).toEqual([])
    await r.insert({ serial: 'ABCDEFGH', createdAt: '2026-01-01T00:00:00Z' })
    expect(await r.has('ABCDEFGH')).toBe(true)
    expect((await r.get('ABCDEFGH'))?.serial).toBe('ABCDEFGH')
    expect(await r.list()).toHaveLength(1)
  })

  it('mirror file is updated alongside primary', async () => {
    const r = new DeviceRegistry(dir)
    await r.insert({ serial: 'ABCDEFGH', createdAt: '2026-01-01T00:00:00Z' })
    const primary = JSON.parse(await fs.readFile(join(dir, 'devices.json'), 'utf-8')) as { devices: { serial: string }[] }
    const mirror = JSON.parse(await fs.readFile(join(dir, 'devices.bak.json'), 'utf-8')) as { devices: { serial: string }[] }
    expect(primary.devices[0]?.serial).toBe('ABCDEFGH')
    expect(mirror.devices[0]?.serial).toBe('ABCDEFGH')
  })

  it('falls back to mirror when primary is corrupted', async () => {
    const r = new DeviceRegistry(dir)
    await r.insert({ serial: 'ABCDEFGH', createdAt: '2026-01-01T00:00:00Z' })
    await fs.writeFile(join(dir, 'devices.json'), 'not-json{', 'utf-8')
    expect(await r.has('ABCDEFGH')).toBe(true)
  })

  it('serializes concurrent inserts (no lost updates)', async () => {
    const r = new DeviceRegistry(dir)
    await Promise.all([
      r.insert({ serial: 'AAAAAAAA', createdAt: '2026-01-01T00:00:00Z' }),
      r.insert({ serial: 'BBBBBBBB', createdAt: '2026-01-01T00:00:01Z' }),
    ])
    const serials = (await r.list()).map((d) => d.serial).sort()
    expect(serials).toEqual(['AAAAAAAA', 'BBBBBBBB'])
  })
})

describe('UserStateStore', () => {
  let dir = ''
  let cleanup = async () => {}
  beforeEach(async () => {
    const t = await makeTempDir('state')
    dir = t.dir
    cleanup = t.cleanup
  })
  afterEach(async () => cleanup())

  it('returns empty state for unknown serial', async () => {
    const s = new UserStateStore(dir)
    const state = await s.get('UNKNOWN1')
    expect(state.visited).toEqual([])
    expect(state.stateMode).toBe(false)
  })

  it('round-trips a put → get with refreshed updatedAt', async () => {
    const s = new UserStateStore(dir)
    const written = await s.put('ABCDEFGH', {
      visited: ['DEU', 'NLD'],
      visitedStates: ['USA-CA'],
      stateMode: true,
      twoUserMode: true,
      activeUser: 2,
      visitedUser1: ['DEU'],
      visitedStatesUser1: [],
      visitedUser2: ['NLD'],
      visitedStatesUser2: ['USA-CA'],
      temperatureUnit: 'fahrenheit',
      nextDestination: { name: 'Tokyo', date: '2026-09-01' },
    })
    expect(written.updatedAt).not.toBe('')
    const read = await s.get('ABCDEFGH')
    expect(read.visited).toEqual(['DEU', 'NLD'])
    expect(read.activeUser).toBe(2)
    expect(read.temperatureUnit).toBe('fahrenheit')
    expect(read.nextDestination.name).toBe('Tokyo')
    expect(read.updatedAt).toBe(written.updatedAt)
  })
})

describe('ImageStore', () => {
  let dir = ''
  let cleanup = async () => {}
  beforeEach(async () => {
    const t = await makeTempDir('img')
    dir = t.dir
    cleanup = t.cleanup
  })
  afterEach(async () => cleanup())

  it('stores bytes + meta and yields a stable etag', async () => {
    const i = new ImageStore(dir)
    const bytes = Buffer.from('BMpretendpayload')
    const meta = await i.put('ABCDEFGH', bytes)
    expect(meta.etag).toMatch(/^[0-9a-f]{64}$/)
    expect(meta.bytes).toBe(bytes.length)

    const round = await i.getImage('ABCDEFGH')
    expect(round?.bytes.equals(bytes)).toBe(true)
    expect(round?.meta.etag).toBe(meta.etag)
  })

  it('returns null when no image exists', async () => {
    const i = new ImageStore(dir)
    expect(await i.getImage('ABCDEFGH')).toBeNull()
    expect(await i.getMeta('ABCDEFGH')).toBeNull()
  })
})
