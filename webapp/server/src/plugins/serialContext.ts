import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { isValidSerial, type DeviceRecord, type Serial } from '@travelframe/contracts'
import type { DeviceRegistry } from '../store/devices.js'

declare module 'fastify' {
  interface FastifyRequest {
    deviceSerial?: Serial
    deviceRecord?: DeviceRecord
  }
  interface FastifyInstance {
    requireRegisteredSerial: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>
  }
}

interface Options {
  registry: DeviceRegistry
}

const serialContextPluginImpl: FastifyPluginAsync<Options> = async (app, opts) => {
  const { registry } = opts
  const handler: FastifyInstance['requireRegisteredSerial'] = async (request, reply) => {
    const raw = (request.params as { serial?: unknown } | undefined)?.serial
    const serial = typeof raw === 'string' && isValidSerial(raw) ? raw : null
    if (!serial) {
      reply.code(400).send({ error: 'invalid_serial' })
      return
    }
    const record = await registry.get(serial)
    if (!record) {
      reply.code(404).send({ error: 'not_found' })
      return
    }
    request.deviceSerial = serial
    request.deviceRecord = record
  }
  app.decorate('requireRegisteredSerial', handler)
}

export const serialContextPlugin = fp(serialContextPluginImpl, {
  name: 'travelframe-serial-context',
  fastify: '5.x',
})
