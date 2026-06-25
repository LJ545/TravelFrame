import { join } from 'node:path'
import type { DeviceRecord, Serial } from '@travelframe/contracts'
import { isValidSerial } from '@travelframe/contracts'
import { readJsonOrNull, writeJson } from './atomicWrite.js'

//managing device serial
interface RegistryFile {
  version: 1
  devices: DeviceRecord[]
}

const emptyFile = (): RegistryFile => ({ version: 1, devices: [] })

export class DeviceRegistry {
  private readonly primary: string
  private readonly mirror: string
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(dataDir: string) {
    this.primary = join(dataDir, 'devices.json')
    this.mirror = join(dataDir, 'devices.bak.json')
  }

  private async readFile(): Promise<RegistryFile> {
    const main = await readJsonOrNull<RegistryFile>(this.primary)
    if (main && Array.isArray(main.devices)) return main
    const bak = await readJsonOrNull<RegistryFile>(this.mirror)
    if (bak && Array.isArray(bak.devices)) return bak
    return emptyFile()
  }

  private async writeFile(file: RegistryFile): Promise<void> {
    await writeJson(this.primary, file)
    await writeJson(this.mirror, file)
  }

  async list(): Promise<DeviceRecord[]> {
    const file = await this.readFile()
    return [...file.devices]
  }

  async has(serial: Serial): Promise<boolean> {
    if (!isValidSerial(serial)) return false
    const file = await this.readFile()
    return file.devices.some((d) => d.serial === serial)
  }

  async get(serial: Serial): Promise<DeviceRecord | null> {
    if (!isValidSerial(serial)) return null
    const file = await this.readFile()
    return file.devices.find((d) => d.serial === serial) ?? null
  }

  private withMutex<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(fn, fn)
    this.writeChain = next.catch(() => undefined)
    return next
  }

  async insert(record: DeviceRecord): Promise<void> {
    if (!isValidSerial(record.serial)) {
      throw new Error(`insert: invalid serial "${record.serial}"`)
    }
    await this.withMutex(async () => {
      const file = await this.readFile()
      await this.writeFile({ ...file, devices: [...file.devices, record] })
    })
  }
}