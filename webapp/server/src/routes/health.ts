import type { FastifyPluginAsync } from 'fastify'

const startedAt = Date.now()

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => ({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
  }))
}
