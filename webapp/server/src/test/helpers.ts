import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//create a fresh temp dir
export const makeTempDir = async (label: string) => {
  const dir = await mkdtemp(join(tmpdir(), `tf-${label}-`))
  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
}
