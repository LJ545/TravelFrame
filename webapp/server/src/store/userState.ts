import { join } from 'node:path'
import fs from 'node:fs/promises'
import type { Serial, UserState } from '@travelframe/contracts'
import { emptyUserState } from '@travelframe/contracts'
import { z } from 'zod'
import { readJsonOrNull, writeJson } from './atomicWrite.js'

export const userStateSchema = z.object({
  visited: z.array(z.string().min(1).max(8)),
  visitedStates: z.array(z.string().min(1).max(64)),
  stateMode: z.boolean(),
  twoUserMode: z.boolean(),
  activeUser: z.union([z.literal(1), z.literal(2)]),
  visitedUser1: z.array(z.string().min(1).max(8)),
  visitedStatesUser1: z.array(z.string().min(1).max(64)),
  visitedUser2: z.array(z.string().min(1).max(8)),
  visitedStatesUser2: z.array(z.string().min(1).max(64)),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']),
  nextDestination: z.object({
    name: z.string().max(64),
    date: z.string().max(32),
    countryCode: z.string().max(8).optional(),
  }),
}) satisfies z.ZodType<Omit<UserState, 'updatedAt'>>

export type UserStateInput = z.infer<typeof userStateSchema>

const userDir = (dataDir: string, serial: Serial) => join(dataDir, 'users', serial)
const statePath = (dataDir: string, serial: Serial) => join(userDir(dataDir, serial), 'state.json')

export class UserStateStore {
  constructor(private readonly dataDir: string) {}

  async ensureDir(serial: Serial): Promise<void> {
    await fs.mkdir(userDir(this.dataDir, serial), { recursive: true })
  }

  async get(serial: Serial): Promise<UserState> {
    const stored = await readJsonOrNull<UserState>(statePath(this.dataDir, serial))
    if (stored && typeof stored.updatedAt === 'string') return stored
    return emptyUserState(new Date(0).toISOString())
  }

  async put(serial: Serial, input: UserStateInput): Promise<UserState> {
    await this.ensureDir(serial)
    const next: UserState = { ...input, updatedAt: new Date().toISOString() }
    await writeJson(statePath(this.dataDir, serial), next)
    return next
  }
}
