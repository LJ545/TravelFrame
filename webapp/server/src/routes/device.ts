import type { FastifyPluginAsync } from 'fastify'
import { devicePaths } from '@travelframe/contracts'
import type { DeviceRegistry } from '../store/devices.js'
import type { ImageStore } from '../store/image.js'

interface Deps {
  registry: DeviceRegistry
  image: ImageStore
}

//device facing api
export const deviceRoutes = (deps: Deps): FastifyPluginAsync =>
  async (app) => {
    app.addHook('preHandler', app.requireRegisteredSerial)

    app.get<{ Params: { serial: string } }>(
      devicePaths.version(':serial'),
      async (request) => {
        const meta = await deps.image.getMeta(request.deviceSerial!)
        if (!meta) {
          return { hasImage: false, etag: null, updatedAt: null, bytes: 0 }
        }
        return { hasImage: true, ...meta }
      },
    )

    app.get<{ Params: { serial: string } }>(
      devicePaths.image(':serial'),
      async (request, reply) => {
        const got = await deps.image.getImage(request.deviceSerial!)
        if (!got) {
          reply.code(404).send({ error: 'no_image' })
          return
        }
        const quoted = `"${got.meta.etag}"`
        const incoming = request.headers['if-none-match']
        if (typeof incoming === 'string' && etagMatches(incoming, quoted)) {
          //304 must carry the ETag header
          reply.header('ETag', quoted)
          reply.code(304).send()
          return
        }
        reply
          .header('Content-Type', 'image/bmp')
          .header('ETag', quoted)
          .header('Cache-Control', 'no-cache')
          .send(got.bytes)
      },
    )
  }

const etagMatches = (incoming: string, quoted: string): boolean => {
  const parts = incoming.split(',').map((s) => s.trim())
  for (const part of parts) {
    if (part === '*') return true
    const stripped = part.startsWith('W/') ? part.slice(2) : part
    if (stripped === quoted) return true
  }
  return false
}
