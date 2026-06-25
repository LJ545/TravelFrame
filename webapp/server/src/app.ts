import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import staticPlugin from '@fastify/static'
import type { AppConfig } from './config.js'
import { DeviceRegistry } from './store/devices.js'
import { ImageStore } from './store/image.js'
import { UserStateStore } from './store/userState.js'
import { TemplateStore } from './store/template.js'
import { rawBodyPlugin } from './plugins/rawBody.js'
import { serialContextPlugin } from './plugins/serialContext.js'
import { healthRoutes } from './routes/health.js'
import { userRoutes } from './routes/api.user.js'
import { deviceRoutes } from './routes/device.js'
import { weatherRoutes } from './routes/weather.js'

export interface AppDeps {
  registry: DeviceRegistry
  userState: UserStateStore
  image: ImageStore
  template: TemplateStore
}

export interface BuiltApp {
  app: FastifyInstance
  deps: AppDeps
}


export const buildApp = async (
  config: AppConfig,
  overrides?: Partial<AppDeps>,
): Promise<BuiltApp> => {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    trustProxy: config.trustProxy,
    bodyLimit: Math.max(config.imageMaxBytes, config.templateMaxBytes, 1 * 1024 * 1024),
  })

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: false,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'If-None-Match'],
    exposedHeaders: ['ETag'],
  })

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  })

  const deps: AppDeps = {
    registry: overrides?.registry ?? new DeviceRegistry(config.dataDir),
    userState: overrides?.userState ?? new UserStateStore(config.dataDir),
    image: overrides?.image ?? new ImageStore(config.dataDir),
    template: overrides?.template ?? new TemplateStore(config.dataDir),
  }

  await app.register(serialContextPlugin, { registry: deps.registry })
  await app.register(rawBodyPlugin, {
    imageMaxBytes: config.imageMaxBytes,
    templateMaxBytes: config.templateMaxBytes,
  })

  await app.register(healthRoutes)
  await app.register(weatherRoutes)
  await app.register(
    userRoutes({
      registry: deps.registry,
      userState: deps.userState,
      image: deps.image,
      template: deps.template,
      templateMaxBytes: config.templateMaxBytes,
    }),
  )
  await app.register(deviceRoutes({ registry: deps.registry, image: deps.image }))

  const webappDir = resolveWebappDir()
  if (webappDir) {
    await app.register(staticPlugin, {
      root: webappDir,
      prefix: '/',
      decorateReply: true,
    })

    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split('?')[0] ?? request.url
      if (
        request.method === 'GET' &&
        !pathname.startsWith('/api') &&
        !pathname.startsWith('/device') &&
        pathname !== '/healthz'
      ) {
        return reply.sendFile('index.html')
      }
      reply.code(404).send({
        message: `Route ${request.method}:${request.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      })
    })
  } else {
    app.log.warn('Web app build not found — run `npm run build` from the webapp folder')
  }

  return { app, deps }
}

const resolveWebappDir = (): string | null => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const candidate of [
    path.join(here, '..', '..', 'webapp', 'dist'),
    path.join(here, '..', '..', '..', 'webapp', 'dist'),
  ]) {
    try {
      if (fs.statSync(path.join(candidate, 'index.html')).isFile()) return candidate
    } catch {
    }
  }
  return null
}
