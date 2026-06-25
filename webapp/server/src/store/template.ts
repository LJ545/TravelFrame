import { join } from 'node:path'
import fs from 'node:fs/promises'
import type { Serial } from '@travelframe/contracts'
import { atomicWrite } from './atomicWrite.js'

const userDir = (dataDir: string, serial: Serial) => join(dataDir, 'users', serial)
const templatePath = (dataDir: string, serial: Serial) =>
  join(userDir(dataDir, serial), 'template.svg')

export interface TemplateMeta {
  updatedAt: string
  bytes: number
}

export class TemplateStore {
  constructor(private readonly dataDir: string) {}

  async put(serial: Serial, svgMarkup: string): Promise<TemplateMeta> {
    await fs.mkdir(userDir(this.dataDir, serial), { recursive: true })
    await atomicWrite(templatePath(this.dataDir, serial), svgMarkup)
    return {
      updatedAt: new Date().toISOString(),
      bytes: Buffer.byteLength(svgMarkup, 'utf-8'),
    }
  }

  async get(serial: Serial): Promise<string | null> {
    try {
      return await fs.readFile(templatePath(this.dataDir, serial), 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
}
