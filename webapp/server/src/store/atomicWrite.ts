import fs from 'node:fs/promises'
import { dirname } from 'node:path'

export const atomicWrite = async (
  target: string,
  contents: Buffer | Uint8Array | string,
): Promise<void> => {
  const dir = dirname(target)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now().toString(36)}.tmp`
  const data = typeof contents === 'string' ? Buffer.from(contents, 'utf-8') : contents
  const handle = await fs.open(tmp, 'w', 0o644)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(tmp, target)
}

export const writeJson = async (target: string, value: unknown): Promise<void> => {
  await atomicWrite(target, JSON.stringify(value, null, 2) + '\n')
}

export const readJsonOrNull = async <T>(target: string): Promise<T | null> => {
  let buf: string
  try {
    buf = await fs.readFile(target, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(buf) as T
  } catch {
    return null
  }
}
