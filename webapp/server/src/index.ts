import { loadConfig } from './config.js'
import { buildApp } from './app.js'
import { scheduleBackup } from './services/backup.js'
import { scheduleAutoRefresh } from './services/autoRefresh.js'
import type { Serial } from '@travelframe/contracts'

//single device in self hosted edition
const DEFAULT_SERIAL = 'XXXXXXXX' as Serial

const main = async () => {
  const config = loadConfig()
  const { app, deps } = await buildApp(config)

  if (!(await deps.registry.has(DEFAULT_SERIAL))) {
    await deps.registry.insert({
      serial: DEFAULT_SERIAL,
      label: 'TravelFrame',
      createdAt: new Date().toISOString(),
    })
    app.log.info({ serial: DEFAULT_SERIAL }, 'default device registered')
  }

  const backup = scheduleBackup(config.backupCron, {
    dataDir: config.dataDir,
    backupDir: config.backupDir,
    retentionDays: config.backupRetentionDays,
    remote: config.backupRemote,
    logger: app.log,
  })

  const autoRefresh = scheduleAutoRefresh({
    userState: deps.userState,
    template: deps.template,
    image: deps.image,
    logger: app.log,
  })

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'shutting down')
    backup.stop()
    autoRefresh.stop()
    await app.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  await app.listen({ port: config.port, host: config.host })
  app.log.info(
    { port: config.port, host: config.host, dataDir: config.dataDir },
    'travelframe server ready',
  )
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
