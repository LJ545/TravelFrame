import path from 'node:path'
import { z } from 'zod'

//server sec settings

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  TRUST_PROXY: z
    .union([z.literal('true'), z.literal('false'), z.string()])
    .default('false')
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v)),

  CORS_ORIGINS: z.string().default('*'),

  //per ip rate limit
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  TEMPLATE_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),

  DATA_DIR: z.string().default('./data'),

  //backup settings
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_CRON: z.string().default('17 3 * * *'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  BACKUP_REMOTE: z.string().optional(),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type AppConfig = ReturnType<typeof loadConfig>

const resolveAbsolute = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(process.cwd(), value)

const splitOrigins = (value: string): string[] | true => {
  const trimmed = value.trim()
  if (trimmed === '*' || trimmed === '') return true
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env) => {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<env>'}: ${i.message}`)
      .join('\n  ')
    throw new Error(`Invalid environment configuration:\n  ${summary}`)
  }
  const v = parsed.data
  return {
    port: v.PORT,
    host: v.HOST,
    trustProxy: v.TRUST_PROXY,
    corsOrigins: splitOrigins(v.CORS_ORIGINS),
    rateLimit: { max: v.RATE_LIMIT_MAX, timeWindow: v.RATE_LIMIT_WINDOW },
    imageMaxBytes: v.IMAGE_MAX_BYTES,
    templateMaxBytes: v.TEMPLATE_MAX_BYTES,
    dataDir: resolveAbsolute(v.DATA_DIR),
    backupDir: resolveAbsolute(v.BACKUP_DIR),
    backupCron: v.BACKUP_CRON,
    backupRetentionDays: v.BACKUP_RETENTION_DAYS,
    backupRemote: v.BACKUP_REMOTE,
    logLevel: v.LOG_LEVEL,
    nodeEnv: v.NODE_ENV,
  } as const
}
