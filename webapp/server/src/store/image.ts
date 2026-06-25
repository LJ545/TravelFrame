import { join } from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import type { ImageMeta, Serial } from '@travelframe/contracts'
import { atomicWrite, readJsonOrNull, writeJson } from './atomicWrite.js'

const userDir = (dataDir: string, serial: Serial) => join(dataDir, 'users', serial)
const imagePath = (dataDir: string, serial: Serial) => join(userDir(dataDir, serial), 'image.bmp')
const metaPath = (dataDir: string, serial: Serial) =>
  join(userDir(dataDir, serial), 'image.meta.json')

export class ImageStore {
  constructor(private readonly dataDir: string) {}

  async getMeta(serial: Serial): Promise<ImageMeta | null> {
    return readJsonOrNull<ImageMeta>(metaPath(this.dataDir, serial))
  }

  async getImage(serial: Serial): Promise<{ bytes: Buffer; meta: ImageMeta } | null> {
    const meta = await this.getMeta(serial)
    if (!meta) return null
    try {
      const bytes = await fs.readFile(imagePath(this.dataDir, serial))
      return { bytes, meta }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async put(serial: Serial, bytes: Buffer): Promise<ImageMeta> {
    await fs.mkdir(userDir(this.dataDir, serial), { recursive: true })
    const etag = createHash('sha256').update(bytes).digest('hex')
    const meta: ImageMeta = {
      etag,
      updatedAt: new Date().toISOString(),
      bytes: bytes.length,
    }
    await atomicWrite(imagePath(this.dataDir, serial), bytes)
    await writeJson(metaPath(this.dataDir, serial), meta)
    return meta
  }
}
