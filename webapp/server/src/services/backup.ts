import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { create as createTar } from 'tar'
import cron from 'node-cron'
import type { FastifyBaseLogger } from 'fastify'

const execFileAsync = promisify(execFile)

export interface BackupOptions {
  dataDir: string
  backupDir: string
  retentionDays: number
  remote?: string
  logger: FastifyBaseLogger
}

const today = (): string => {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const tarballPathFor = (backupDir: string, dateLabel: string) =>
  path.join(backupDir, dateLabel, 'data.tar.gz')

export const runBackup = async (opts: BackupOptions): Promise<{ tarball: string }> => {
  const { dataDir, backupDir, retentionDays, remote, logger } = opts

  const dataExists = await fs.stat(dataDir).then(
    (s) => s.isDirectory(),
    () => false,
  )
  if (!dataExists) {
    logger.info({ dataDir }, 'backup: data dir absent, nothing to do')
    return { tarball: '' }
  }

  const dateLabel = today()
  const tarball = tarballPathFor(backupDir, dateLabel)
  await fs.mkdir(path.dirname(tarball), { recursive: true })

  const parent = path.dirname(dataDir)
  const dataName = path.basename(dataDir)
  await createTar({ gzip: true, cwd: parent, file: tarball }, [dataName])
  logger.info({ tarball }, 'backup: tarball written')

  await pruneOldBackups(backupDir, retentionDays, logger)

  if (remote) {
    try {
      await execFileAsync('rclone', ['copy', tarball, remote], { timeout: 5 * 60_000 })
      logger.info({ tarball, remote }, 'backup: pushed to remote')
    } catch (err) {
      logger.error({ err, remote }, 'backup: remote push failed (kept local copy)')
    }
  }

  return { tarball }
}

const pruneOldBackups = async (
  backupDir: string,
  retentionDays: number,
  logger: FastifyBaseLogger,
): Promise<void> => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let entries: string[] = []
  try {
    entries = await fs.readdir(backupDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue
    const ts = Date.parse(`${entry}T00:00:00Z`)
    if (Number.isNaN(ts) || ts >= cutoff) continue
    const target = path.join(backupDir, entry)
    try {
      await fs.rm(target, { recursive: true, force: true })
      logger.info({ target }, 'backup: pruned old snapshot')
    } catch (err) {
      logger.warn({ err, target }, 'backup: prune failed')
    }
  }
}

//daily backup using a cron job
export const scheduleBackup = (
  schedule: string,
  opts: BackupOptions,
): { stop: () => void } => {
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid BACKUP_CRON expression: ${schedule}`)
  }
  const task = cron.schedule(
    schedule,
    () => {
      runBackup(opts).catch((err) => {
        opts.logger.error({ err }, 'backup: scheduled run failed')
      })
    },
    { timezone: 'UTC' },
  )
  return { stop: () => task.stop() }
}
